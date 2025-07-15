const { ArInvoice, Customer, User, ArInvoiceItem, ArPayment } = require('../../../models');
const { Op } = require('sequelize');

const arInvoiceController = {
  // Get all AR invoices with pagination and filtering
  getAllInvoices: async (req, res) => {
    try {
      const { page = 1, limit = 10, status, customerId, startDate, endDate, search } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = { isActive: true };

      // Apply filters
      if (status) whereClause.status = status;
      if (customerId) whereClause.customerId = customerId;
      if (startDate && endDate) {
        whereClause.invoiceDate = {
          [Op.between]: [startDate, endDate]
        };
      }
      if (search) {
        whereClause[Op.or] = [
          { invoiceNumber: { [Op.like]: `%${search}%` } },
          { customerName: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows } = await ArInvoice.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email', 'phone']
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email']
          },
          {
            model: ArInvoiceItem,
            as: 'items'
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['invoiceDate', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching invoices',
        error: error.message
      });
    }
  },

  // Get single AR invoice by ID
  getInvoiceById: async (req, res) => {
    try {
      const { id } = req.params;

      const invoice = await ArInvoice.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: Customer,
            as: 'customer'
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email']
          },
          {
            model: User,
            as: 'updater',
            attributes: ['id', 'name', 'email']
          },
          {
            model: ArInvoiceItem,
            as: 'items'
          },
          {
            model: ArPayment,
            as: 'payments',
            where: { isActive: true },
            required: false
          }
        ]
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      res.status(200).json({
        success: true,
        data: invoice
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching invoice',
        error: error.message
      });
    }
  },

  // Create new AR invoice
  createInvoice: async (req, res) => {
    try {
      const {
        customerId,
        customerName,
        customerAddress,
        customerPhone,
        customerEmail,
        invoiceDate,
        dueDate,
        paymentTerms,
        subtotal,
        taxRate,
        discountRate,
        currency,
        description,
        notes,
        terms,
        items
      } = req.body;

      // Generate invoice number
      const lastInvoice = await ArInvoice.findOne({
        order: [['id', 'DESC']],
        attributes: ['invoiceNumber']
      });

      let invoiceNumber;
      if (lastInvoice) {
        const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[1]);
        invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;
      } else {
        invoiceNumber = 'INV-000001';
      }

      const invoice = await ArInvoice.create({
        invoiceNumber,
        customerId,
        customerName,
        customerAddress,
        customerPhone,
        customerEmail,
        invoiceDate,
        dueDate,
        paymentTerms,
        subtotal,
        taxRate,
        discountRate,
        currency,
        description,
        notes,
        terms,
        createdBy: req.user.id // Assuming user is available in req
      });

      // Calculate totals
      invoice.calculateTotals();
      await invoice.save();

      // Create invoice items if provided
      if (items && items.length > 0) {
        const invoiceItems = items.map(item => ({
          ...item,
          invoiceId: invoice.id
        }));
        await ArInvoiceItem.bulkCreate(invoiceItems);
      }

      res.status(201).json({
        success: true,
        message: 'Invoice created successfully',
        data: invoice
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating invoice',
        error: error.message
      });
    }
  },

  // Update AR invoice
  updateInvoice: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = { ...req.body, updatedBy: req.user.id };

      const invoice = await ArInvoice.findOne({
        where: { id, isActive: true }
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      // Don't allow updates to paid invoices
      if (invoice.status === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update paid invoice'
        });
      }

      await invoice.update(updateData);

      // Recalculate totals if financial fields were updated
      if (updateData.subtotal || updateData.taxRate || updateData.discountRate) {
        invoice.calculateTotals();
        await invoice.save();
      }

      res.status(200).json({
        success: true,
        message: 'Invoice updated successfully',
        data: invoice
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating invoice',
        error: error.message
      });
    }
  },

  // Delete AR invoice (soft delete)
  deleteInvoice: async (req, res) => {
    try {
      const { id } = req.params;

      const invoice = await ArInvoice.findOne({
        where: { id, isActive: true }
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      // Don't allow deletion of paid invoices
      if (invoice.status === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete paid invoice'
        });
      }

      await invoice.update({ 
        isActive: false, 
        updatedBy: req.user.id 
      });

      res.status(200).json({
        success: true,
        message: 'Invoice deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting invoice',
        error: error.message
      });
    }
  },

  // Update invoice status
  updateInvoiceStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const invoice = await ArInvoice.findOne({
        where: { id, isActive: true }
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      await invoice.update({ 
        status, 
        updatedBy: req.user.id 
      });

      res.status(200).json({
        success: true,
        message: 'Invoice status updated successfully',
        data: invoice
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating invoice status',
        error: error.message
      });
    }
  },

  // Get invoice statistics
  getInvoiceStats: async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const whereClause = { isActive: true };

      if (startDate && endDate) {
        whereClause.invoiceDate = {
          [Op.between]: [startDate, endDate]
        };
      }

      const stats = await ArInvoice.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalInvoices'],
          [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalAmount'],
          [sequelize.fn('SUM', sequelize.col('paidAmount')), 'paidAmount'],
          [sequelize.fn('SUM', sequelize.col('remainingAmount')), 'remainingAmount']
        ]
      });

      const statusStats = await ArInvoice.findAll({
        where: whereClause,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalAmount')), 'amount']
        ],
        group: ['status']
      });

      res.status(200).json({
        success: true,
        data: {
          overview: stats[0],
          byStatus: statusStats
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching invoice statistics',
        error: error.message
      });
    }
  }
};

module.exports = arInvoiceController;