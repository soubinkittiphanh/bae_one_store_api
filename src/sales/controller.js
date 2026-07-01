
const SaleHeader = require('../models').saleHeader;
const SalePayment = require('../models').salePayment;
const Payment = require('../models').payment;
const SaleLine = require('../models').saleLine;
const Customer = require('../models').customer;
const Category = require('../models').category;
const Line = require('../models').saleLine;
const Product = require('../models').product;
const Card = require('../models').card;
const Unit = require('../models').unit;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const lineService = require("./line/service");
const headerService = require("./service");
const common = require('../common')
const { Op, where, literal } = require('sequelize');
const productService = require('../product/service');
const { sequelize, location, company } = require('../models');
const spfService = require('../spf/service')
const cardService = require('../card/service')
const loyaltyService = require('../loyalty/service');
const WashJob = require('../models').washjob;
// 1. 200 OK - The request has succeeded and the server has returned the requested data.

// 2. 201 Created - The request has been fulfilled and a new resource has been created.

// 3. 204 No Content - The server successfully processed the request, but there is no response body to return.

// 4. 400 Bad Request - The server cannot or will not process the request due to an error in the client's request.

// 5. 401 Unauthorized - The client must authenticate itself before it can access the requested resource.

// 6. 403 Forbidden - The server understands the request but refuses to authorize it.

// 7. 404 Not Found - The server cannot find the requested resource.

// 8. 500 Internal Server Error - The server encountered an unexpected condition that prevented it from fulfilling the request.

// 9. 502 Bad Gateway - The server received an invalid response from an upstream server while trying to fulfill the request.

const validateStockForLines = async (lines, locationId) => {
  logger.info(`Starting stock validation for ${lines.length} lines`);

  const stockValidationErrors = [];

  // Fetch STOCK.VAR parameter from SPF
  const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
  const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';
  logger.info(`STOCK.VAR parameter value is: ${spfStockVarParam ? spfStockVarParam.value : 'not set'} (checkVariant: ${checkVariant})`);

  for (const line of lines) {
    // Check if this line requires stock validation
    const isRedeem = line.productId === 999;
    const shouldValidate = !isRedeem && (
      line.validateStockOnSale === true ||
      line.validateStockOnSale === 1 ||
      (line.validateStockOnSale !== false && line.validateStockOnSale !== 0 && line.product && line.product.validateStockOnSale)
    );

    if (shouldValidate) {
      logger.info(`Validating stock for line with productId: ${line.productId}`);

      const requiredQty = (line.unitRate || 1) * line.quantity;

      // Check available cards/stock for this product at this location
      const whereCondition = {
        productId: line.productId,
        saleLineId: null,
        card_isused: 0,
        locationId: locationId,
        isActive: true
      };

      // Add variant checks if STOCK.VAR is active and properties are provided
      if (checkVariant) {
        if (line.colorId !== undefined && line.colorId !== null) {
          whereCondition.colorId = line.colorId;
        }
        if (line.sizeId !== undefined && line.sizeId !== null) {
          whereCondition.sizeId = line.sizeId;
        }
      }

      const availableCards = await Card.findAll({
        where: whereCondition,
        order: [['createdAt', 'DESC']]
      });

      logger.info(`Product ${line.productId} (Color: ${line.colorId}, Size: ${line.sizeId}) requires ${requiredQty} units, available: ${availableCards.length}`);

      if (availableCards.length < requiredQty) {
        stockValidationErrors.push({
          productId: line.productId,
          colorId: checkVariant ? line.colorId : null,
          sizeId: checkVariant ? line.sizeId : null,
          required: requiredQty,
          available: availableCards.length,
          shortage: requiredQty - availableCards.length
        });
      }
    } else {
      logger.info(`Skipping stock validation for line with productId: ${line.productId} (validateStockOnSale: ${line.validateStockOnSale})`);
    }
  }

  return stockValidationErrors;
};


const autoCreateStock = async (lines, locationId) => {
  const spfStockCheckParam = await spfService.getSPFByCode('STOCK.VAL');
  logger.warn(`PARAMETER CHECK SPF: ${JSON.stringify(spfStockCheckParam)}`);
  logger.warn(`LINE HERE: ${JSON.stringify(lines)}`);
  logger.warn(`LINE LEN: ${lines.length}`);

  if (spfStockCheckParam) {
    if (spfStockCheckParam.value == 'N') {
      for (const line of lines) {
        // Only auto-create stock for lines that require stock validation
        const isRedeem = line.productId === 999;
        const shouldValidate = !isRedeem && (
          line.validateStockOnSale === true ||
          line.validateStockOnSale === 1 ||
          (line.validateStockOnSale !== false && line.validateStockOnSale !== 0 && line.product && line.product.validateStockOnSale)
        );
        if (shouldValidate) {
          logger.info(`LINE OBJECT DATA ${JSON.stringify(line)}`);
          const cardTemp = {
            inputter: 1,
            product_id: line.productId,
            totalCost: 0,
            stockCardQty: line.quantity,
            productId: line.productId,
            srcLocationId: locationId
          };
          const autoCardCreate = await cardService.createAutoHulkStockCard(cardTemp);
          logger.info(`CARD HAS BEEN CREATED :${autoCardCreate.length} || ${JSON.stringify(autoCardCreate)}`);
        }
      }
    }
  }
};

// Add this function to your controller.js file
// Add this function to your controller.js file

exports.createSaleHeaderOnly = async (req, res) => {
  try {
    let {
      bookingDate,
      qrRequestId,
      remark,
      discount,
      total,
      exchangeRate,
      isActive,
      clientId,
      paymentId,
      currencyId,
      userId,
      referenceNo,
      locationId,
      lines, // Added lines parameter for stock validation
      redeemedPoints = 0
    } = req.body;

    logger.info("===== Create Sale Header Only (Multi-Payment) =====" + JSON.stringify(req.body));

    // Validate stock for lines if lines are provided
    if (lines && lines.length > 0) {
      logger.info("Validating stock for provided lines before creating sale header");

      // Check if auto stock creation is needed
      // await autoCreateStock(lines, locationId);

      // Validate stock for lines that require validation
      const stockValidationErrors = await validateStockForLines(lines, locationId);

      if (stockValidationErrors.length > 0) {
        logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for some items',
          stockErrors: stockValidationErrors,
          details: stockValidationErrors.map(err =>
            `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
          )
        });
      }

      logger.info("Stock validation passed for all lines requiring validation");
    }

    // Set default remark for multi-payment transactions
    if (!remark) {
      remark = 'Multi-payment transaction - pending payment completion';
    }

    // For multi-payment, we need to either:
    // 1. Use a valid default payment ID, or 
    // 2. Set paymentId to null (if your DB allows it)

    // Option 1: Find the first available payment method as temporary
    let tempPaymentId = paymentId;
    if (!tempPaymentId) {
      const firstPayment = await sequelize.models.payment.findOne({
        where: { isActive: true },
        order: [['id', 'ASC']]
      });

      if (firstPayment) {
        tempPaymentId = firstPayment.id;
        logger.info(`Using temporary payment ID: ${tempPaymentId}`);
      } else {
        return res.status(400).json({
          success: false,
          message: 'No valid payment methods found in system',
          error: 'Payment setup required'
        });
      }
    }

    // Validate that the payment ID exists
    const paymentExists = await sequelize.models.payment.findByPk(tempPaymentId);
    if (!paymentExists) {
      return res.status(400).json({
        success: false,
        message: `Payment method with ID ${tempPaymentId} not found`,
        error: 'Invalid payment ID'
      });
    }

    let loyaltyDiscount = 0;
    if (clientId && redeemedPoints > 0) {
      // For multi-payment, we handle redemption now
      const resultRedeem = await sequelize.transaction(async (t) => {
        const discount = await loyaltyService.redeemPoints(clientId, null, redeemedPoints, t);
        return discount;
      });
      loyaltyDiscount = resultRedeem;
      remark = `${remark || ''} (Redeemed ${redeemedPoints} points)`.trim();
    }

    // Create sale header with valid payment ID
    const saleHeader = await SaleHeader.create({
      bookingDate,
      qrRequestId,
      remark,
      discount,
      total,
      exchangeRate,
      isActive,
      clientId,
      paymentId: null, // Set to null as discussed
      currencyId,
      userId,
      referenceNo,
      locationId,
      redeemedPoints,
      loyaltyDiscount
    });

    // Update loyalty transaction with header ID
    if (clientId && redeemedPoints > 0) {
      const { loyaltyTransaction } = require('../models');
      await loyaltyTransaction.update(
        { 
          saleHeaderId: saleHeader.id,
          remark: `Redeemed points on Sale ID: ${saleHeader.id}`
        },
        { where: { saleHeaderId: null, clientId, type: 'REDEEMED' } }
      );
    }

    logger.info(`Sale header created successfully with ID: ${saleHeader.id}`);

    // Return the created sale header with ID
    res.status(201).json({
      success: true,
      saleHeaderId: saleHeader.id,
      message: 'Sale header created successfully - ready for payment processing',
      data: saleHeader,
      stockValidationPassed: lines ? true : 'No lines provided for validation'
    });

  } catch (error) {
    logger.error(`Error creating sale header only: ${error}`);
    res.status(500).json({
      success: false,
      message: `Failed to create sale header: ${error.message}`,
      error: error.message
    });
  }
};
exports.createSaleLineOnly = async (req, res) => {
  try {
    let {
      id,
      lines,
      locationId,
      validateStock = true // Optional flag to control stock validation
    } = req.body;

    logger.info("===== Create Sale Line Only =====" + JSON.stringify(req.body));

    // Validate required parameters
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Sale Header ID is required',
        error: 'Missing saleHeaderId parameter'
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lines array is required and cannot be empty',
        error: 'Invalid or missing lines parameter'
      });
    }

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'Location ID is required',
        error: 'Missing locationId parameter'
      });
    }

    // Verify that the sale header exists
    const saleHeaderExists = await SaleHeader.findByPk(id);
    if (!saleHeaderExists) {
      return res.status(404).json({
        success: false,
        message: `Sale Header with ID ${id} not found`,
        error: 'Invalid sale header ID'
      });
    }

    logger.warn(`====>  lines for header ${id}: ${JSON.stringify(lines)}`);

    // Validate stock if required
    if (validateStock) {
      const stockValidationErrors = await validateStockForLines(lines, locationId);
      if (stockValidationErrors.length > 0) {
        logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for some items',
          stockErrors: stockValidationErrors,
          details: stockValidationErrors.map(err =>
            `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
          )
        });
      }

      // Auto create stock if needed
      // const checking = await autoCreateStock(lines, locationId);
      logger.info("Stock validation passed and auto-stock creation completed");
    }

    // Use transaction for consistency
    const result = await sequelize.transaction(async (t) => {
      const lockingSessionId = common.generateLockingSessionId();
      const errorList = [];
      let linesCreated = false;

      try {
        // Assign header ID to lines
        const linesWithHeaderId = await assignHeaderId(lines, id, lockingSessionId, false, locationId);

        // Create bulk sale lines - DON'T pass res to avoid double response
        await lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId);
        linesCreated = true;

        logger.info(`Sale lines created successfully for header ID: ${id}`);

      } catch (error) {
        logger.error("Error creating sale lines: " + error);
        errorList.push(error);
        throw error; // Re-throw to trigger transaction rollback
      }

      return {
        id,
        linesCreated,
        linesCount: lines.length,
        lockingSessionId
      };
    });

    logger.info(`Sale lines creation transaction complete for header ${id}`);
    logger.info(`Saleline only create result ${JSON.stringify(result)}`)
    // Return success response
    // res.status(201).json({
    //   success: true,
    //   message: 'Sale lines created successfully',
    //   data: {
    //     saleHeaderId: result.id, // Fixed: was result.saleHeaderId
    //     linesCreated: result.linesCreated,
    //     linesCount: result.linesCount,
    //     lockingSessionId: result.lockingSessionId,
    //     stockValidationPerformed: validateStock
    //   }
    // });

  } catch (error) {
    logger.error(`Error creating sale lines only: ${error}`);

    // Check if response was already sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: `Failed to create sale lines: ${error.message}`,
        error: error.message
      });
    }
  }
};
// Optional: Add a function to complete the sale after payments are processed
exports.completeSaleWithLines = async (req, res) => {
  try {
    const { saleHeaderId } = req.params;
    const { lines, locationId } = req.body;

    logger.info(`Completing sale ${saleHeaderId} with lines: ${JSON.stringify(lines)}`);

    // Find the existing sale header
    const saleHeader = await SaleHeader.findByPk(saleHeaderId);

    if (!saleHeader) {
      return res.status(404).json({
        success: false,
        message: 'Sale header not found'
      });
    }

    // Validate stock for lines that require validation
    const stockValidationErrors = await validateStockForLines(lines, locationId);

    if (stockValidationErrors.length > 0) {
      logger.error(`Stock validation failed during sale completion: ${JSON.stringify(stockValidationErrors)}`);
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for some items during completion',
        stockErrors: stockValidationErrors,
        details: stockValidationErrors.map(err =>
          `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
        )
      });
    }

    // Check if stock check is required before sale process
    const checking = await autoCreateStock(lines, locationId);

    const result = await sequelize.transaction(async (t) => {
      // Process the lines for this sale header
      const lockingSessionId = common.generateLockingSessionId();
      const errorList = [];

      try {
        const linesWithHeaderId = await assignHeaderId(lines, saleHeaderId, lockingSessionId, false, locationId);
        await lineService.createBulkSaleLineWithoutRes(linesWithHeaderId, lockingSessionId);

        // Update sale header to mark as completed
        await saleHeader.update({
          remark: 'Multi-payment transaction completed',
          isActive: true
        }, { transaction: t });

      } catch (error) {
        logger.error("Something wrong need to reverse header " + error);
        errorList.push(error);
        throw new Error(error);
      }

      return { saleHeader, errorList };
    });

    // Update product stock counts
    await updateProductStockCount(lines);

    logger.info(`Sale completion transaction successful for ${saleHeaderId}`);

    res.status(200).json({
      success: true,
      message: 'Sale completed successfully with payment processing',
      saleHeaderId: saleHeaderId,
      data: result.saleHeader
    });

    // AWARD LOYALTY POINTS
    if (saleHeader.clientId) {
      await loyaltyService.awardPoints(saleHeader.clientId, saleHeaderId, saleHeader.total, null);
    }

  } catch (error) {
    logger.error(`Error completing sale: ${error}`);

    // If there was an error, mark the sale header for review
    try {
      await SaleHeader.update(
        { remark: `Multi-payment transaction failed: ${error.message}` },
        { where: { id: req.params.saleHeaderId } }
      );
    } catch (updateError) {
      logger.error(`Failed to update error status: ${updateError}`);
    }

    res.status(500).json({
      success: false,
      message: `Failed to complete sale: ${error.message}`,
      error: error.message
    });
  }
};


exports.createSaleHeader = async (req, res) => {
  try {
    let { bookingDate, qrRequestId, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId, referenceNo, locationId, customerForm, redeemedPoints = 0 } = req.body;
    logger.info("===== Create Sale Header =====" + JSON.stringify(req.body));

    //------------ Check if stock check is require before sale process
    logger.warn(`====>  lines     ${JSON.stringify(lines)}`);

    // Validate stock using the new approach
    const stockValidationErrors = await validateStockForLines(lines, locationId);

    if (stockValidationErrors.length > 0) {
      logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for some items',
        stockErrors: stockValidationErrors,
        details: stockValidationErrors.map(err =>
          `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
        )
      });
    }

    const checking = await autoCreateStock(lines, locationId);

    const result = await sequelize.transaction(async (t) => {
      logger.warn(`SALE HEADER: ${JSON.stringify(req.body)}`);

      let loyaltyDiscount = 0;
      if (clientId && redeemedPoints > 0) {
        loyaltyDiscount = await loyaltyService.redeemPoints(clientId, null, redeemedPoints, t);
        remark = `${remark || ''} (Redeemed ${redeemedPoints} points)`.trim();
      }

      const saleHeader = await SaleHeader.create({
        bookingDate, qrRequestId, remark, discount, total, exchangeRate, isActive,
        clientId, paymentId, currencyId, userId, referenceNo, locationId,
        redeemedPoints, loyaltyDiscount
      }, { transaction: t });

      // Update the loyalty transaction with the real saleHeaderId
      if (clientId && redeemedPoints > 0) {
        const { loyaltyTransaction } = require('../models');
        await loyaltyTransaction.update(
          { 
            saleHeaderId: saleHeader.id,
            remark: `Redeemed points on Sale ID: ${saleHeader.id}`
          },
          { where: { saleHeaderId: null, clientId, type: 'REDEEMED' }, transaction: t }
        );
      }

      let customer = null;

      if (customerForm) {
        logger.info(`********** Customer form ${customerForm}***********`);
        logger.info(`********** Customer form ${customerForm.name}***********`);
        delete customerForm.discount;
        customerForm.saleHeaderId = saleHeader.id;
        customer = await Customer.create(customerForm, { transaction: t });
      }

      logger.info(`*************Sale header ${saleHeader.id} *************`);
      // **********************
      //  Line with headerId
      // **********************
      const lockingSessionId = common.generateLockingSessionId();
      const errorList = [];

      try {
        const linesWithHeaderId = await assignHeaderId(lines, saleHeader.id, lockingSessionId, false, locationId);
        lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId);
      } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created
        // ********************************************
        logger.error("Something wrong need to reverse header " + error);
        res.status(500).send("Unfortunately " + error);
        errorList.push(error);
      }

      const reversalRequire = errorList.length > 0 ? true : false;
      return { customer, saleHeader, reversalRequire };
    });

    if (result.reversalRequire) {
      await headerService.saleHeaderReversal(result.saleHeader.id);
      return logger.warn(`Transaction reversed`);
    }

    logger.info(`Transaction complete ${result}`);

    if (clientId && result.saleHeader) {
      // Award points on the net total (total - discount - loyaltyDiscount)
      // Actually 'total' from POS is usually the final amount to pay.
      await loyaltyService.awardPoints(clientId, result.saleHeader.id, total, null);
    }
  } catch (error) {
    logger.error(`Error occurs ${error}`);
    res.status(500).send(error);
  }
};

exports.updateSaleHeaderV2 = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId, locationId } = req.body;

    const saleHeader = await SaleHeader.findByPk(id);
    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found');
      return res.status(404).json({
        success: false,
        message: 'Sale header not found'
      });
    }

    logger.info("===== Update Sale Header ===== ID: " + id);
    logger.warn(`====>  lines     ${JSON.stringify(lines)}`);

    // Validate stock using the same approach as create function
    const stockValidationErrors = await validateStockForLines(lines, locationId);
    if (stockValidationErrors.length > 0) {
      logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for some items',
        stockErrors: stockValidationErrors,
        details: stockValidationErrors.map(err =>
          `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
        )
      });
    }

    const checking = await autoCreateStock(lines, locationId);

    const result = await sequelize.transaction(async (t) => {
      logger.info("Updating header");
      const lockingSessionId = common.generateLockingSessionId();
      await assignHeaderId(lines, id, lockingSessionId, true, locationId);

      // ********** Classify new or old saleLine ********** //
      const saleLineForCreate = lines.filter(el => el['id'] == null);
      logger.warn(`SaleLine for create count is ${saleLineForCreate.length}`);

      if (saleLineForCreate.length > 0) {
        await lineService.createBulkSaleLineWithoutRes(saleLineForCreate, lockingSessionId);
      }

      const updatedSaleHeader = await saleHeader.update({
        bookingDate,
        remark,
        discount,
        total,
        exchangeRate,
        isActive,
        lines,
        clientId,
        paymentId,
        currencyId,
        userId
      }, { transaction: t });

      logger.info(`Update transaction completed ${updatedSaleHeader}`);

      // ************* UPDATE PRODUCT STOCK COUNT *************//
      updateProductStockCount(lines);

      return { saleHeader: updatedSaleHeader };
    });

    // Send success response in the same format as create function
    logger.info(`Transaction complete ${result}`);

    // Format response similar to create function success message
    const successMessage = `Successfully updated sale header - ${result.saleHeader.id}`;
    res.status(200).send(`${successMessage} - ${result.saleHeader.id}`);

  } catch (error) {
    logger.error("Cannot update data " + error);

    // Handle different error types similar to create function
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.errors.map(err => err.message)
      });
    }

    // Send error response in consistent format
    res.status(500).json({
      success: false,
      message: `Cannot update data: ${error.message || error}`,
      error: error.message || error
    });
  }
};
exports.updateSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { lines, locationId, ...headerData } = req.body;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) return res.status(404).json({ success: false, message: 'Sale header not found' });

    const lockingSessionId = common.generateLockingSessionId();

    // STEP 1: Assign header info and tag cards (Existing Logic)
    await assignHeaderId(lines, id, lockingSessionId, true, locationId);

    // STEP 2: Handle NEW lines (Existing Logic)
    const saleLineForCreate = lines.filter(el => el.id == null);
    if (saleLineForCreate.length > 0) {
      await lineService.createBulkSaleLineWithoutRes(saleLineForCreate, lockingSessionId);
    }

    // STEP 3: Handle EXISTING lines (The Missing Logic!)
    const saleLineForUpdate = lines.filter(el => el.id != null);
    if (saleLineForUpdate.length > 0) {
      await lineService.updateBulkSaleLine(saleLineForUpdate, lockingSessionId, locationId);
    }

    // STEP 4: Update Header (Existing Logic)
    await saleHeader.update(headerData);
    updateProductStockCount(lines);

    res.status(200).json(saleHeader);
  } catch (error) {
    logger.error("Update failed: " + error);
    res.status(500).send(`Update error: ${error.message}`);
  }
};
exports.settlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentId, codFee, customerId } = req.body;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info("Updating header")
    await saleHeader.update({ paymentId, });
    logger.info(`Update transaction completed ${saleHeader}`)
    // ******* IF COD FEE IS THERE NEED TO UPDATE DY-CUS ********
    const customer = await Customer.findByPk(customerId)
    await customer.update({ cod_fee: codFee })
    res.status(200).json(saleHeader);
  } catch (error) {
    logger.error("Cannot update data " + error)
    res.status(500).send(`Cannot update data with ${error}`);
  }
};
exports.reverseSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, remark, cancel_fee, customerId } = req.body;
    const saleHeader = await SaleHeader.findByPk(id, {
      include: [{
        model: Line,
        as: "lines",
        include: [
          {
            model: Product,
            as: "product"
          },
          'cards'
        ]
      }]
    });
    logger.info(`Sale header ${JSON.stringify(saleHeader)}`)
    // Reverse external transaction 
    if (saleHeader.washJobId) {
      logger.info(`Reversing the washJob ${saleHeader.washJobId}`)
      const washJob = await WashJob.findByPk(saleHeader.washJobId)
      await washJob.update({
        status: 'CANCELLED',
      });
      logger.info(`Currency wash job version ${JSON.stringify(washJob)}`)
    }
    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info(`SaleLine len: ${saleHeader['lines'].length}`)
    logger.info(`SaleLine product len: ${saleHeader['lines'].length}`)
    // Collect card id to reverse back
    // const cardIds = [];
    // for (const iterator of saleHeader['lines']) {
    //   logger.info(`product id ${iterator['product']['id']}`)
    //   cardIds.concat(iterator['cards'].map(card => card['id']))
    // }
    const cardIds = saleHeader['lines'].flatMap(iterator => iterator['cards'].map(card => card['id']));
    const lineIds = saleHeader['lines'].map(line => line.id)
    const result = await sequelize.transaction(async (t) => {
      const updatedRecord = await saleHeader.update({ isActive, remark }, { transaction: t });
      const updatedSaleLineRecord = await SaleLine.update({ isActive }, { where: { 'id': { [Op.in]: lineIds } } }, { transaction: t });
      const [numUpdated] = await Card.update(
        {
          card_isused: 0,
          saleLineId: null,
          isActive: true,
        },
        {
          where: {
            id: {
              [Op.in]: cardIds,
            },
          },
        }, { transaction: t }
      );

      // REVERSE LOYALTY POINTS
      await loyaltyService.reversePointsForSale(id, t);

      return { updatedRecord, numUpdated };
    })




    logger.info("Reversal is on going...")
    // ********** Clasify new or old saleLine ********** //
    logger.info(`Reversal transaction completed ${saleHeader}`)

    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
    updateProductStockCount(saleHeader['lines'])
    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
    // *********** SET CANCELATION CHARGE ***********
    if (cancel_fee > 0) {
      logger.info(`CANCEL FEE SET ${cancel_fee} | ${customerId}`)
      const customer = await Customer.findByPk(customerId)
      await customer.update({ cancel_fee: cancel_fee })
    }
    res.status(200).json(saleHeader);
  } catch (error) {
    logger.error("Cannot reverse data " + error)
    res.status(500).send(`Cannot reverse data with ${error}`);
  }
};
const assignHeaderId = async (lines, id, lockingSessionId, isUpdate, locationId) => {
  // Fetch STOCK.VAR parameter from SPF
  const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
  const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';
  logger.info(`[assignHeaderId] STOCK.VAR parameter value is: ${spfStockVarParam ? spfStockVarParam.value : 'not set'} (checkVariant: ${checkVariant})`);

  for (const iterator of lines) {
    iterator.headerId = id;
    iterator.saleHeaderId = id;

    // Use iterator.product.validateStockOnSale if it's nested, or directly
    const isRedeem = iterator.productId === 999;
    const shouldValidate = !isRedeem && (
      iterator.validateStockOnSale === true ||
      iterator.validateStockOnSale === 1 ||
      (iterator.validateStockOnSale !== false && iterator.validateStockOnSale !== 0 && iterator.product && iterator.product.validateStockOnSale)
    );

    if (shouldValidate) {
      try {
        // CASE 1: NEW LINE (Create mode or adding a new line during an update)
        if (!iterator.id) {
          const qtyToLock = (iterator.unitRate || 1) * iterator.quantity;
          await reserveCard(iterator, lockingSessionId, qtyToLock, locationId);
        }

        // CASE 2: EXISTING LINE (Update mode)
        else {
          // Find how many cards are ALREADY linked to this saleLine
          const previousCards = await Card.findAll({ where: { saleLineId: iterator.id } });
          const currentRequiredQty = (iterator.unitRate || 1) * iterator.quantity;
          const actualLinkedCount = previousCards.length;

          // Check if it's same product and same variant properties
          const sameProduct = actualLinkedCount > 0 && previousCards[0].productId == iterator.productId;
          const sameVariant = !checkVariant || (
            actualLinkedCount > 0 &&
            previousCards[0].colorId == iterator.colorId &&
            previousCards[0].sizeId == iterator.sizeId
          );

          // A. Same Product and Variant: Adjust quantity
          if (actualLinkedCount > 0 && sameProduct && sameVariant) {
            if (currentRequiredQty > actualLinkedCount) {
              const diff = currentRequiredQty - actualLinkedCount;
              await reserveCard(iterator, lockingSessionId, diff, locationId);
            } else if (currentRequiredQty < actualLinkedCount) {
              const releaseCount = actualLinkedCount - currentRequiredQty;
              const cardsToRelease = previousCards.slice(0, releaseCount);

              await Card.update({
                card_isused: 0,
                saleLineId: null,
                locking_session_id: '' // Satisfy NOT NULL constraint
              }, {
                where: { id: { [Op.in]: cardsToRelease.map(el => el.id) } }
              });
            }
          }
          // B. Product/Variant Swap: Release all old cards, lock all new cards
          else {
            if (actualLinkedCount > 0) {
              await Card.update({ card_isused: 0, saleLineId: null, locking_session_id: '' }, {
                where: { id: { [Op.in]: previousCards.map(el => el.id) } }
              });
              await productService.updateProductCountById(previousCards[0].productId);
            }
            await reserveCard(iterator, lockingSessionId, currentRequiredQty, locationId);
          }
        }
      } catch (err) {
        logger.error(`Stock assignment failed for productId ${iterator.productId}: ${err.message}`);
        throw err;
      }
    }
  }
  return lines;
};

const updateProductStockCount = async (lines) => {
  // ************* TAKE THE PRODUCT ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
  const productIdList = lines.map((item) => {
    return item.productId;
  });
  await productService.updateProductCountGroup(productIdList);
  // ************* TAKE THE PRODUCT ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
};

const reserveCard = async (line, lockingSessionId, qty, locationId) => {
  logger.info(`[RESERVE] Product: ${line.productId}, Qty: ${qty}, Color: ${line.colorId}, Size: ${line.sizeId}`);

  // Fetch STOCK.VAR parameter from SPF
  const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
  const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';

  const whereCondition = {
    productId: line.productId,
    saleLineId: null,
    card_isused: 0,
    locationId
  };

  if (checkVariant) {
    if (line.colorId !== undefined && line.colorId !== null) {
      whereCondition.colorId = line.colorId;
    }
    if (line.sizeId !== undefined && line.sizeId !== null) {
      whereCondition.sizeId = line.sizeId;
    }
  }

  const cards = await Card.findAll({
    limit: qty,
    order: [['createdAt', 'DESC']],
    where: whereCondition
  });

  if (!cards || cards.length < qty) {
    const variantStr = checkVariant ? ` (Color: ${line.colorId}, Size: ${line.sizeId})` : '';
    throw new Error(`Insufficient stock for Product ${line.productId}${variantStr}`);
  }

  await Card.update({
    locking_session_id: lockingSessionId
  }, {
    where: { id: { [Op.in]: cards.map(el => el.id) } }
  });
};


exports.getSaleHeaders = async (req, res) => {
  try {
    const saleHeaders = await SaleHeader.findAll({ include: ['lines', 'user', 'client', 'payment', 'currency', 'location', Customer], });

    res.status(200).json({ success: true, data: saleHeaders });
  } catch (error) {
    res.status(500).send(error);
  }
};


exports.getSaleHeadersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  logger.warn(`Request date ${date.startDate} userId ${req.user.id}`)
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', 'location',
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            }
          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping', 'rider']
        },
        {
          model: SalePayment,
          as: 'payments',
          include: [
            {
              model: Payment,
              as: 'paymentMethod'
            }
          ]
        }

      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        // isActive:false
      }
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};
exports.getSaleHeadersDetailByDate = async (req, res) => {
  try {
    if (!req.query.date || req.query.date === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid or missing date parameter' });
    }
    const date = JSON.parse(req.query.date);
    logger.warn("Date " + date.startDate + " " + date.endDate)
    if (req.user && req.user.id) {
      logger.warn(`Request date ${date.startDate} userId ${req.user.id}`)
    }
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', 'location',
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            },
            'cards'
          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping', 'rider']
        }

      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        ...(req.query.locationId && { locationId: req.query.locationId })
      }
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};

exports.getSaleHeadersByDateAndUser = async (req, res) => {
  logger.warn("=============Loading saleHeader data=============")
  const date = JSON.parse(req.query.date);
  logger.warn(`Request date ${date.startDate} userId ${date.userId}`)
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', Customer,
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            },
            {
              model: SaleHeader,
              as: "header",
            },
            {
              model: Card,
              as: "cards",
            },

          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping']
        },

        {
          model: location,
          as: "location",
          include: [
            {
              model: company,
              as: "company"
            },]
        },


      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        userId: {
          [date.userId < 1 ? Op.ne : Op.eq]: date.userId,
        }
      }
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};
exports.getSaleHeadersByDateAndCustomer = async (req, res) => {
  try {
    const date = JSON.parse(req.query.date);
    logger.warn(`Filter By Customer: Request date ${date.startDate} to ${date.endDate} customerId ${date.clientId}`)

    const whereClause = {
      bookingDate: {
        [Op.between]: [date.startDate, date.endDate]
      }
    };

    // Improved logic: skip filter if clientId is negative or 0 (All)
    if (date.clientId && parseInt(date.clientId) > 0) {
      whereClause.clientId = date.clientId;
    }

    const saleHeaders = await SaleHeader.findAll({
      include: [
        'user',
        'client',
        'payment',
        'currency',
        'location',
        {
          model: Customer,
          include: ['geography', 'shipping']
        },
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            },
            {
              model: Card,
              as: "cards"
            }
          ]
        }
      ],
      where: whereClause
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> getSaleHeadersByDateAndCustomer error: " + error)
    res.status(500).send(error);
  }
};
exports.getSaleHeadersByDateAndProduct = async (req, res) => {
  const date = JSON.parse(req.query.date);
  const productId = date.productId;
  logger.warn(`Request date ${date.startDate} customerId ${date.productId}`)
  try {
    const saleLines = await Line.findAll({
      attributes: [
        ['productId', 'product_id'], // Aliasing product.id as product_id
        ['headerId', 'header_id'],   // Aliasing header.id as header_id
        [sequelize.fn('SUM', sequelize.col('price')), 'totalPrice'],
        [sequelize.fn('SUM', sequelize.col('saleLine.total')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQTY'],
        [sequelize.fn('SUM', sequelize.col('taxAmount')), 'totalTaxAmount'],
        [sequelize.fn('SUM', sequelize.col('header.discount')), 'totalDiscount'],
      ],
      group: ['productId'],
      include: [
        {
          model: Product,
          as: "product",
          include: [{
            model: Category,
            as: "category",
          }]
        },
        {
          model: SaleHeader,
          as: "header",
          include: ['user', 'client', 'payment', 'currency', 'location', Customer],
          where: {
            '$header.bookingDate$': {
              [Op.between]: [date.startDate, date.endDate]
            },
            '$saleLine.productId$': { // Assuming `productId` is the correct field name
              [productId < 1 ? Op.ne : Op.eq]: productId,
            },
            'locationId': date.locationId,

          },
        }
      ],
      where: {
        "isActive": true,
      }
    });

    res.status(200).send(saleLines);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};

exports.getSaleHeaderById = async (req, res) => {
  try {
    const { id } = req.params;
    const saleHeader = await SaleHeader.findByPk(id, {
      include: ['user', 'location', 'client', 'payment', 'currency', Customer, {
        model: Line,
        as: "lines",
        include: [
          {
            model: Product,
            as: "product",
            include: ['images']
          },
          {
            model: Unit,
            as: "unit"
          },
        ]
      }],
    });

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json(saleHeader);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.getSaleHeaderByPaymentType = async (req, res) => {

  try {
    const { clientId, paymentId, date } = req.body;
    const saleHeaders = await SaleHeader.findAll({
      include: ['lines', 'user', 'location', 'client', 'payment', 'currency', 'location', {
        model: Line,
        as: "lines",
        include: [
          {
            model: Product,
            as: "product"
          },
          {
            model: Unit,
            as: "unit"
          },
        ]
      }],
      where: {
        paymentId,
        clientId,
        isActive: true,
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
      }
    },

    );

    if (!saleHeaders) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json(saleHeaders);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.updateSaleHeaderPostToInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    // const { bookingDate, remark, discount, total, exchangeRate, isActive } = req.body;
    const isActive = true;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await saleHeader.update({ isActive });

    res.status(200).json({ success: true, data: saleHeader });
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.deleteSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await saleHeader.destroy();

    res.status(200).json({ success: true, message: 'Sale header deleted successfully' });
  } catch (error) {
    res.status(500).send(error);
  }
};


// const products = await Product.findAll({
//   where: {
//     [Op.and]: Sequelize.literal('(price * quantity) > 100')
//   }
// });
exports.sumSaleToday = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  const { startDate, endDate } = date // new Date('2022-01-01');
  try {
    const saleHeader = await SaleHeader.findAll({
      attributes: ['total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        }
      }

    })
    res.send(saleHeader)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }

  // attributes: ['id', 'name'],
  // SaleHeader.sum(literal('total - discount'), {
  //   where: {
  //     bookingDate: {
  //       [Op.between]: [startDate, endDate]
  //     }
  //   }
  // })
  //   .then(total => {
  //     console.log(`Total price after discounts between ${startDate} and ${endDate}: ${total}`);
  //     res.send(total)
  //   })
  //   .catch(err => {
  //     logger.error(`Error cannot retreive data ${err}`)
  //     res.status(503).send(`error ${err}`)
  //   });
};

exports.sumSaleCurrentMonth = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  const { startDate, endDate } = date // new Date('2022-01-01');
  try {
    const saleHeader = await SaleHeader.findAll({
      attributes: ['total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        }
      }

    })
    res.send(saleHeader)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }
};
exports.sumSaleCurrentYear = async (req, res) => {
  const date = JSON.parse(req.query.date);
  const locationId = req.query.locationId;  // Get locationId directly
  const includeCards = req.query.includeCards === 'true'; // Optional parameter

  logger.warn("Date " + date.startDate + " " + date.endDate)
  const { startDate, endDate } = date


  try {
    // Build the lines include dynamically
    const linesInclude = {
      model: SaleLine,
      as: "lines"
    };

    // Only add cards if specifically requested
    if (includeCards) {
      linesInclude.include = ['cards'];
    }

    const saleHeader = await SaleHeader.findAll({
      include: [
        Customer,
        'payment',
        'payments',
        'qrRequest',
        linesInclude
      ],
      attributes: ['id', 'discount', 'total', 'bookingDate', 'currencyId'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate],
        },
        locationId: locationId,
        isActive: true,
      }
    })
    res.send(saleHeader)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }
};

exports.getSaleHeadersByDateWithGifts = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Gift Report - Date " + date.startDate + " " + date.endDate);
  logger.warn(`Gift Report - Request date ${date.startDate} userId ${req.user.id}`);

  try {
    const saleHeaders = await SaleHeader.findAll({
      include: [
        'user',
        'client',
        'payment',
        'currency',
        'location',
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            }
          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping', 'rider']
        },
        {
          model: SalePayment,
          as: 'payments',
          include: [
            {
              model: Payment,
              as: 'paymentMethod'
            }
          ]
        }
      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        // Only include headers that have at least one gift line
        id: {
          [Op.in]: sequelize.literal(`(
            SELECT DISTINCT saleHeaderId 
            FROM saleLine 
            WHERE isGift = 1 AND isActive = 1
          )`)
        }
      },
      order: [['createdAt', 'DESC']]
    });

    // Filter and enhance with gift information
    const giftSaleHeaders = saleHeaders.map(header => {
      // Filter only gift lines
      const giftLines = header.lines.filter(line => line.isGift === 1);

      // Calculate gift statistics
      const giftItemsCount = giftLines.length;
      const giftValue = giftLines.reduce((sum, line) => sum + line.total, 0);

      return {
        ...header.toJSON(),
        giftItemsCount,
        giftValue,
        giftLines
      };
    });

    logger.info(`Found ${giftSaleHeaders.length} sale headers with gift items`);
    res.status(200).send(giftSaleHeaders);

  } catch (error) {
    logger.error("===> Gift report filter by date error: " + error);
    res.status(500).send(error);
  }
};

/**
 * Get sale headers that contain gift items by date range and user
 * Similar to getSaleHeadersByDateAndUser but filters only orders with gift items
 */
exports.getSaleHeadersByDateAndUserWithGifts = async (req, res) => {
  logger.warn("=============Loading gift saleHeader data=============");
  const date = JSON.parse(req.query.date);
  logger.warn(`Gift Report - Request date ${date.startDate} userId ${date.userId}`);

  try {
    const saleHeaders = await SaleHeader.findAll({
      include: [
        'user',
        'client',
        'payment',
        'currency',
        Customer,
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            },
            {
              model: SaleHeader,
              as: "header",
            },
            {
              model: Card,
              as: "cards",
            },
          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping']
        },
        {
          model: location,
          as: "location",
          include: [
            {
              model: company,
              as: "company"
            },
          ]
        },
        {
          model: SalePayment,
          as: 'payments',
          include: [
            {
              model: Payment,
              as: 'paymentMethod'
            }
          ]
        }
      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        userId: {
          [date.userId < 1 ? Op.ne : Op.eq]: date.userId,
        },
        // Only include headers that have at least one gift line
        id: {
          [Op.in]: sequelize.literal(`(
            SELECT DISTINCT saleHeaderId 
            FROM saleLine 
            WHERE isGift = 1 AND isActive = 1
          )`)
        }
      },
      order: [['createdAt', 'DESC']]
    });

    // Filter and enhance with gift information
    const giftSaleHeaders = saleHeaders.map(header => {
      // Filter only gift lines
      const giftLines = header.lines.filter(line => line.isGift === 1);

      // Calculate gift statistics
      const giftItemsCount = giftLines.length;
      const giftValue = giftLines.reduce((sum, line) => sum + line.total, 0);

      return {
        ...header.toJSON(),
        giftItemsCount,
        giftValue,
        giftLines
      };
    });

    logger.info(`Found ${giftSaleHeaders.length} sale headers with gift items for user ${date.userId}`);
    res.status(200).send(giftSaleHeaders);

  } catch (error) {
    logger.error("===> Gift report filter by date and user error: " + error);
    res.status(500).send(error);
  }
};

/**
 * Get gift statistics summary for a date range
 * Provides aggregate data about gift transactions
 */
exports.getGiftStatsByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Gift Stats - Date " + date.startDate + " " + date.endDate);

  try {
    // Get gift lines with their headers for the date range
    const giftLines = await SaleLine.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('saleLine.id')), 'totalGiftItems'],
        [sequelize.fn('SUM', sequelize.col('saleLine.total')), 'totalGiftValue'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('saleHeaderId'))), 'totalOrdersWithGifts'],
      ],
      include: [
        {
          model: SaleHeader,
          as: "header",
          attributes: [],
          where: {
            bookingDate: {
              [Op.between]: [date.startDate, date.endDate]
            },
            isActive: true
          }
        }
      ],
      where: {
        isGift: 1,
        isActive: true
      }
    });

    // Get detailed breakdown by product
    const giftProductBreakdown = await SaleLine.findAll({
      attributes: [
        'productId',
        [sequelize.fn('COUNT', sequelize.col('saleLine.id')), 'giftCount'],
        [sequelize.fn('SUM', sequelize.col('saleLine.total')), 'giftValue'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
      ],
      include: [
        {
          model: Product,
          as: "product",
          attributes: ['id', 'name', 'description']
        },
        {
          model: SaleHeader,
          as: "header",
          attributes: [],
          where: {
            bookingDate: {
              [Op.between]: [date.startDate, date.endDate]
            },
            isActive: true
          }
        }
      ],
      where: {
        isGift: 1,
        isActive: true
      },
      group: ['productId', 'product.id'],
      order: [[sequelize.fn('SUM', sequelize.col('saleLine.total')), 'DESC']]
    });

    const stats = {
      summary: giftLines[0] || {
        totalGiftItems: 0,
        totalGiftValue: 0,
        totalOrdersWithGifts: 0
      },
      productBreakdown: giftProductBreakdown,
      dateRange: {
        startDate: date.startDate,
        endDate: date.endDate
      }
    };

    logger.info(`Gift stats calculated: ${stats.summary.totalGiftItems} items, ${stats.summary.totalGiftValue} value`);
    res.status(200).json(stats);

  } catch (error) {
    logger.error("===> Gift stats error: " + error);
    res.status(500).send(error);
  }
};

/**
 * Get gift items breakdown by customer
 * Shows which customers received the most gifts
 */
exports.getGiftsByCustomer = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Gift by Customer - Date " + date.startDate + " " + date.endDate);

  try {
    const giftsByCustomer = await SaleHeader.findAll({
      attributes: [
        'clientId',
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('SaleHeader.id'))), 'ordersCount'],
        [sequelize.fn('COUNT', sequelize.col('lines.id')), 'giftItemsCount'],
        [sequelize.fn('SUM', sequelize.col('lines.total')), 'totalGiftValue'],
      ],
      include: [
        {
          model: sequelize.models.client,
          as: 'client',
          attributes: ['id', 'name', 'telephone', 'email']
        },
        {
          model: SaleLine,
          as: 'lines',
          attributes: [],
          where: {
            isGift: 1,
            isActive: true
          }
        }
      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        isActive: true
      },
      group: ['clientId', 'client.id'],
      order: [[sequelize.fn('SUM', sequelize.col('lines.total')), 'DESC']],
      limit: 50 // Top 50 customers
    });

    logger.info(`Found gift data for ${giftsByCustomer.length} customers`);
    res.status(200).json(giftsByCustomer);

  } catch (error) {
    logger.error("===> Gift by customer error: " + error);
    res.status(500).send(error);
  }
};

/**
 * Get gift trends over time (monthly breakdown)
 * Shows gift distribution patterns over months
 */
exports.getGiftTrends = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Gift Trends - Date " + date.startDate + " " + date.endDate);

  try {
    const giftTrends = await SaleLine.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('header.bookingDate'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('saleLine.id')), 'giftCount'],
        [sequelize.fn('SUM', sequelize.col('saleLine.total')), 'giftValue'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('saleHeaderId'))), 'ordersWithGifts'],
      ],
      include: [
        {
          model: SaleHeader,
          as: "header",
          attributes: [],
          where: {
            bookingDate: {
              [Op.between]: [date.startDate, date.endDate]
            },
            isActive: true
          }
        }
      ],
      where: {
        isGift: 1,
        isActive: true
      },
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('header.bookingDate'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('header.bookingDate'), '%Y-%m'), 'ASC']]
    });

    logger.info(`Gift trends calculated for ${giftTrends.length} months`);
    res.status(200).json(giftTrends);

  } catch (error) {
    logger.error("===> Gift trends error: " + error);
    res.status(500).send(error);
  }
};

/**
 * Create a gift sale line (helper function for manual gift creation)
 * Allows staff to add gift items to existing orders
 */
exports.addGiftToSale = async (req, res) => {
  try {
    const { saleHeaderId, productId, quantity, unitRate, remark } = req.body;

    logger.info(`Adding gift to sale ${saleHeaderId}: Product ${productId}, Qty ${quantity}`);

    // Validate sale header exists
    const saleHeader = await SaleHeader.findByPk(saleHeaderId);
    if (!saleHeader) {
      return res.status(404).json({
        success: false,
        message: 'Sale header not found'
      });
    }

    // Validate product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const result = await sequelize.transaction(async (t) => {
      // Create gift sale line
      const giftLine = await SaleLine.create({
        saleHeaderId: saleHeaderId,
        headerId: saleHeaderId,
        productId: productId,
        quantity: quantity || 1,
        unitRate: unitRate || 0,
        price: 0, // Gifts are free
        discount: 0,
        total: 0, // Gifts have zero total
        isGift: 1, // Mark as gift
        isActive: true
      }, { transaction: t });

      // Update sale header remark to indicate gift was added
      const currentRemark = saleHeader.remark || '';
      const newRemark = currentRemark + (currentRemark ? '; ' : '') +
        `Gift added: ${product.name} (${quantity})` +
        (remark ? ` - ${remark}` : '');

      await saleHeader.update({
        remark: newRemark
      }, { transaction: t });

      return { giftLine, saleHeader };
    });

    logger.info(`Gift line created successfully: ${result.giftLine.id}`);

    res.status(201).json({
      success: true,
      message: 'Gift added to sale successfully',
      data: {
        giftLine: result.giftLine,
        saleHeader: result.saleHeader
      }
    });

  } catch (error) {
    logger.error(`Error adding gift to sale: ${error}`);
    res.status(500).json({
      success: false,
      message: `Failed to add gift: ${error.message}`,
      error: error.message
    });
  }
};

/**
 * Remove gift from sale
 * Allows staff to remove gift items from orders
 */
exports.removeGiftFromSale = async (req, res) => {
  try {
    const { saleLineId } = req.params;
    const { remark } = req.body;

    logger.info(`Removing gift sale line: ${saleLineId}`);

    // Find the gift line
    const giftLine = await SaleLine.findOne({
      where: {
        id: saleLineId,
        isGift: 1,
        isActive: true
      },
      include: [
        {
          model: Product,
          as: 'product'
        },
        {
          model: SaleHeader,
          as: 'header'
        }
      ]
    });

    if (!giftLine) {
      return res.status(404).json({
        success: false,
        message: 'Gift line not found'
      });
    }

    const result = await sequelize.transaction(async (t) => {
      // Mark gift line as inactive
      await giftLine.update({
        isActive: false,
        remark: `Removed: ${remark || 'Gift removed by staff'}`
      }, { transaction: t });

      // Update sale header remark
      const saleHeader = giftLine.header;
      const currentRemark = saleHeader.remark || '';
      const newRemark = currentRemark + (currentRemark ? '; ' : '') +
        `Gift removed: ${giftLine.product.name}` +
        (remark ? ` - ${remark}` : '');

      await saleHeader.update({
        remark: newRemark
      }, { transaction: t });

      return { giftLine, saleHeader };
    });

    logger.info(`Gift line removed successfully: ${saleLineId}`);

    res.status(200).json({
      success: true,
      message: 'Gift removed from sale successfully',
      data: result
    });

  } catch (error) {
    logger.error(`Error removing gift from sale: ${error}`);
    res.status(500).json({
      success: false,
      message: `Failed to remove gift: ${error.message}`,
      error: error.message
    });
  }
};

exports.validateStockForLines = validateStockForLines;

