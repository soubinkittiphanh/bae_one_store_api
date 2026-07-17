const { Op } = require('sequelize');
const db = require('../models');
const ShippingOrder = db.shipping_order;
const Client = db.client;

module.exports = {
  /**
   * Phase 1: Scan Arrival (First Scan)
   * Scans a barcode on container/product arrival.
   */
  async scanArrival(req, res) {
    try {
      const { barcode } = req.body;
      if (!barcode) {
        return res.status(400).json({ message: 'Barcode is required' });
      }

      // 1. Search for PENDING orders matching the barcode
      const pendingOrders = await ShippingOrder.findAll({
        where: {
          barcode: barcode,
          status: 'PENDING'
        },
        include: [
          {
            model: Client,
            as: 'customer',
            attributes: ['id', 'name', 'telephone', 'address']
          },
          {
            model: db.currency,
            as: 'currency',
            attributes: ['id', 'code', 'name', 'symbol', 'rate']
          }
        ]
      });

      // 2. Handle matches
      if (pendingOrders.length === 0) {
        return res.status(404).json({
          message: 'No pending shipping order found matching this barcode'
        });
      }

      if (pendingOrders.length === 1) {
        // Unique match found
        return res.status(200).json({
          type: 'SINGLE_MATCH',
          order: pendingOrders[0]
        });
      }

      // Edge Case: Duplicate retail barcode found in PENDING
      return res.status(200).json({
        type: 'DUPLICATE_MATCH',
        orders: pendingOrders,
        message: 'Multiple pending orders share this retail barcode. Please select the correct customer.'
      });

    } catch (error) {
      console.error('Error in scanArrival:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  /**
   * Confirm Arrival & Set Price
   * Updates status to ARRIVED and saves final_price + timestamp.
   */
  async confirmArrival(req, res) {
    try {
      const { id } = req.params;
      const { final_price, currency_id } = req.body;

      if (final_price === undefined || final_price === null || final_price < 0) {
        return res.status(400).json({ message: 'Valid final price is required' });
      }

      const order = await ShippingOrder.findOne({
        where: { id, status: 'PENDING' }
      });

      if (!order) {
        return res.status(404).json({ message: 'Pending shipping order not found' });
      }

      // If currency_id is provided, validate it exists
      if (currency_id) {
        const currencyExists = await db.currency.findByPk(currency_id);
        if (!currencyExists) {
          return res.status(400).json({ message: 'Invalid currency ID' });
        }
        order.currency_id = currency_id;
      }

      order.final_price = final_price;
      order.status = 'ARRIVED';
      order.arrived_at = new Date();
      await order.save();

      // Reload with associations
      const updatedOrder = await ShippingOrder.findByPk(order.id, {
        include: [
          {
            model: Client,
            as: 'customer',
            attributes: ['id', 'name', 'telephone', 'address']
          },
          {
            model: db.currency,
            as: 'currency',
            attributes: ['id', 'code', 'name', 'symbol', 'rate']
          }
        ]
      });

      return res.status(200).json({
        message: 'Arrival confirmed successfully',
        order: updatedOrder
      });

    } catch (error) {
      console.error('Error in confirmArrival:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  /**
   * Phase 2: Customer Pickup Scan (Second Scan)
   * Scans an arrived package barcode.
   */
  async scanPickup(req, res) {
    try {
      const { barcode } = req.body;
      if (!barcode) {
        return res.status(400).json({ message: 'Barcode is required' });
      }

      // 1. Find the ARRIVED order matching that barcode
      const scannedOrder = await ShippingOrder.findOne({
        where: {
          barcode: barcode,
          status: 'ARRIVED'
        },
        include: [
          {
            model: Client,
            as: 'customer',
            attributes: ['id', 'name', 'telephone']
          },
          {
            model: db.currency,
            as: 'currency',
            attributes: ['id', 'code', 'name', 'symbol', 'rate']
          }
        ]
      });

      if (!scannedOrder) {
        return res.status(404).json({
          message: 'No arrived shipping order found matching this barcode'
        });
      }

      const customerId = scannedOrder.customer_id;

      // 2. Upsell/Cross-check Feature:
      // Query database for OTHER arrived items sitting on the shelf for this customer
      const otherArrivedItems = await ShippingOrder.findAll({
        where: {
          customer_id: customerId,
          status: 'ARRIVED',
          id: { [Op.ne]: scannedOrder.id } // Exclude the scanned item
        },
        include: [{
          model: db.currency,
          as: 'currency',
          attributes: ['id', 'code', 'name', 'symbol', 'rate']
        }]
      });

      // 3. Return scanned item price and details plus the list of other pending arrived items
      return res.status(200).json({
        scannedOrder,
        otherArrivedItems,
        totalItemsOnShelf: otherArrivedItems.length + 1
      });

    } catch (error) {
      console.error('Error in scanPickup:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  /**
   * Complete Pickup (Batch checkout confirmation)
   * Marks selected shipping orders as COMPLETED.
   */
  async completePickup(req, res) {
    const transaction = await db.sequelize.transaction();
    try {
      const { orderIds, payments } = req.body; // orderIds: [1, 2], payments: [{ paymentId: 1, amount: 100, referenceNo: '...' }]
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Array of order IDs is required' });
      }
      if (!payments || !Array.isArray(payments) || payments.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Payments array is required' });
      }

      // Find the orders
      const orders = await ShippingOrder.findAll({
        where: {
          id: { [Op.in]: orderIds },
          status: 'ARRIVED'
        },
        include: [{
          model: db.currency,
          as: 'currency',
          attributes: ['id', 'code', 'name', 'symbol', 'rate', 'exchangeDirection']
        }],
        transaction
      });

      if (orders.length !== orderIds.length) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Some of the selected shipping orders were not found or are not in ARRIVED status'
        });
      }

      // Ensure they all belong to the same customer
      const customerIds = [...new Set(orders.map(o => o.customer_id))];
      if (customerIds.length > 1) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'All shipping orders in a checkout batch must belong to the same customer'
        });
      }
      const customerId = customerIds[0];

      // Retrieve default local currency
      const localCurrency = await db.currency.findOne({
        where: { isLocalCCY: true },
        transaction
      });
      const defaultCurrency = localCurrency || await db.currency.findOne({ transaction });

      // Calculate total price in local currency
      let totalPrice = 0;
      for (const o of orders) {
        const price = parseFloat(o.final_price || 0);
        const fromCurrency = o.currency;
        if (!fromCurrency || !defaultCurrency || fromCurrency.id === defaultCurrency.id) {
          totalPrice += price;
        } else {
          if (fromCurrency.exchangeDirection === 'local_to_foreign') {
            totalPrice += price / (parseFloat(fromCurrency.rate) || 1.0);
          } else {
            totalPrice += price * (parseFloat(fromCurrency.rate) || 1.0);
          }
        }
      }

      // Create the checkout batch
      const batch = await db.shipping_checkout_batch.create({
        customer_id: customerId,
        total_price: totalPrice
      }, { transaction });

      // Create payment rows in salePayment
      const paymentRows = payments.map(p => ({
        shippingCheckoutBatchId: batch.id,
        paymentId: p.paymentId,
        amount: parseFloat(p.amount || 0),
        referenceNo: p.referenceNo || '',
        isActive: true
      }));
      await db.salePayment.bulkCreate(paymentRows, { transaction });

      // Update the shipping orders to COMPLETED and link to batch
      await ShippingOrder.update({
        status: 'COMPLETED',
        picked_up_at: new Date(),
        checkout_batch_id: batch.id
      }, {
        where: { id: { [Op.in]: orderIds } },
        transaction
      });

      await transaction.commit();

      // Fetch the created batch with all nested relationships for the ticket print
      const completedBatch = await db.shipping_checkout_batch.findByPk(batch.id, {
        include: [
          {
            model: Client,
            as: 'customer',
            attributes: ['id', 'name', 'telephone', 'address']
          },
          {
            model: db.salePayment,
            as: 'payments',
            include: [{ model: db.payment, as: 'paymentMethod', attributes: ['id', 'payment_name', 'payment_code'] }]
          },
          {
            model: ShippingOrder,
            as: 'orders',
            include: [{ model: db.currency, as: 'currency', attributes: ['id', 'code', 'symbol', 'rate'] }]
          }
        ]
      });

      return res.status(200).json({
        message: 'Pickup completed successfully',
        batch: completedBatch
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Error in completePickup:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  /**
   * Find All Shipping Orders
   * Fetches all shipping orders including customer details.
   */
  async findAll(req, res) {
    try {
      const orders = await ShippingOrder.findAll({
        include: [
          {
            model: Client,
            as: 'customer',
            attributes: ['id', 'name', 'telephone', 'address']
          },
          {
            model: db.currency,
            as: 'currency',
            attributes: ['id', 'code', 'name', 'symbol', 'rate']
          }
        ],
        order: [['createdAt', 'DESC']]
      });
      return res.status(200).json(orders);
    } catch (error) {
      console.error('Error in findAll:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  /**
   * Create Shipping Order (Manual Registration)
   */
  async create(req, res) {
    try {
      const { customer_id, barcode, final_price, status, currency_id } = req.body;
      if (!customer_id || !barcode) {
        return res.status(400).json({ message: 'Customer ID and Barcode are required' });
      }

      // Validate currency if provided
      if (currency_id) {
        const currencyExists = await db.currency.findByPk(currency_id);
        if (!currencyExists) {
          return res.status(400).json({ message: 'Invalid currency ID' });
        }
      }

      // Check if a pending or arrived shipping order already exists with this barcode
      const existing = await ShippingOrder.findOne({
        where: {
          barcode: barcode,
          status: { [Op.ne]: 'COMPLETED' }
        }
      });

      if (existing) {
        return res.status(400).json({
          message: `A shipping order with barcode "${barcode}" already exists with status "${existing.status}"`
        });
      }

      const order = await ShippingOrder.create({
        customer_id: customer_id,
        barcode: barcode,
        final_price: final_price !== undefined ? final_price : null,
        currency_id: currency_id || null,
        status: status || 'PENDING',
        arrived_at: status === 'ARRIVED' ? new Date() : null
      });

      // Reload with customer and currency relations
      const createdOrder = await ShippingOrder.findOne({
        where: { id: order.id },
        include: [
          {
            model: Client,
            as: 'customer',
            attributes: ['id', 'name', 'telephone', 'address']
          },
          {
            model: db.currency,
            as: 'currency',
            attributes: ['id', 'code', 'name', 'symbol', 'rate']
          }
        ]
      });

      return res.status(201).json({
        message: 'Shipping order created successfully',
        order: createdOrder
      });

    } catch (error) {
      console.error('Error in create shipping order:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  /**
   * Get Checkout Batch Details
   * Fetches details of a specific checkout batch/ticket.
   */
  async getCheckoutBatch(req, res) {
    try {
      const { id } = req.params;
      const batch = await db.shipping_checkout_batch.findByPk(id, {
        include: [
          {
            model: Client,
            as: 'customer',
            attributes: ['id', 'name', 'telephone', 'address']
          },
          {
            model: db.salePayment,
            as: 'payments',
            include: [{ model: db.payment, as: 'paymentMethod', attributes: ['id', 'payment_name', 'payment_code'] }]
          },
          {
            model: ShippingOrder,
            as: 'orders',
            include: [{ model: db.currency, as: 'currency', attributes: ['id', 'code', 'symbol', 'rate'] }]
          }
        ]
      });

      if (!batch) {
        return res.status(404).json({ message: 'Checkout ticket not found' });
      }

      return res.status(200).json(batch);
    } catch (error) {
      console.error('Error in getCheckoutBatch:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  /**
   * Revert / Cancel Pickup for a Shipping Order
   * Updates status back to ARRIVED, clears picked_up_at, and clears checkout_batch_id.
   */
  async revertPickup(req, res) {
    const transaction = await db.sequelize.transaction();
    try {
      const { id } = req.params;

      const order = await ShippingOrder.findOne({
        where: { id, status: 'COMPLETED' },
        transaction
      });

      if (!order) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Completed shipping order not found' });
      }

      const batchId = order.checkout_batch_id;

      // Revert the shipping order
      order.status = 'ARRIVED';
      order.picked_up_at = null;
      order.checkout_batch_id = null;
      await order.save({ transaction });

      // If there are no other shipping orders remaining in this batch, delete/cancel the batch payments
      if (batchId) {
        const remainingOrders = await ShippingOrder.count({
          where: { checkout_batch_id: batchId },
          transaction
        });

        if (remainingOrders === 0) {
          // Delete associated payments
          await db.salePayment.destroy({
            where: { shippingCheckoutBatchId: batchId },
            transaction
          });
          // Delete the batch itself
          await db.shipping_checkout_batch.destroy({
            where: { id: batchId },
            transaction
          });
        } else {
          // Update the batch total price if some orders still remain
          const ordersInBatch = await ShippingOrder.findAll({
            where: { checkout_batch_id: batchId },
            include: [{
              model: db.currency,
              as: 'currency',
              attributes: ['id', 'code', 'symbol', 'rate', 'exchangeDirection']
            }],
            transaction
          });

          // Retrieve default local currency
          const localCurrency = await db.currency.findOne({
            where: { isLocalCCY: true },
            transaction
          });
          const defaultCurrency = localCurrency || await db.currency.findOne({ transaction });

          let newTotalPrice = 0;
          for (const o of ordersInBatch) {
            const price = parseFloat(o.final_price || 0);
            const fromCurrency = o.currency;
            if (!fromCurrency || !defaultCurrency || fromCurrency.id === defaultCurrency.id) {
              newTotalPrice += price;
            } else {
              if (fromCurrency.exchangeDirection === 'local_to_foreign') {
                newTotalPrice += price / (parseFloat(fromCurrency.rate) || 1.0);
              } else {
                newTotalPrice += price * (parseFloat(fromCurrency.rate) || 1.0);
              }
            }
          }

          await db.shipping_checkout_batch.update({
            total_price: newTotalPrice
          }, {
            where: { id: batchId },
            transaction
          });
        }
      }

      await transaction.commit();
      return res.status(200).json({ message: 'Pickup reverted successfully' });
    } catch (error) {
      await transaction.rollback();
      console.error('Error in revertPickup:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
};
