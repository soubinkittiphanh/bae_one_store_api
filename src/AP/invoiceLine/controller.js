// ===============================================================
// INVOICE LINE ITEM CONTROLLER
// ===============================================================
const logger = require("../../api/logger");
const { invoiceLineItem, apInvoice, glAccount, user } = require("../../models");
const { Op } = require('sequelize');

class invoiceLineItemController {

  // ===============================================================
  // CREATE INVOICE LINE ITEM
  // ===============================================================
  static async createLineItem(req, res) {
    try {
      logger.info('Creating new Invoice Line Item');

      const {
        invoiceId,
        lineNumber,
        description,
        quantity = 1,
        unitPrice,
        taxRate = 0,
        discountRate = 0,
        DRglAccountId,
        CRglAccountId,
        makerId,
        note
      } = req.body;

      // Validation
      if (!invoiceId || !lineNumber || !description || !unitPrice) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: invoiceId, lineNumber, description, unitPrice'
        });
      }

      // Check if invoice exists and is editable
      const invoice = await apInvoice.findByPk(invoiceId);
      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      if (!['draft', 'pending'].includes(invoice.status)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot add line items to invoice in current status'
        });
      }

      // Check if line number already exists for this invoice
      const existingLine = await invoiceLineItem.findOne({
        where: { invoiceId, lineNumber }
      });

      if (existingLine) {
        return res.status(400).json({
          success: false,
          message: 'Line number already exists for this invoice'
        });
      }

      // Create line item
      const lineItem = await invoiceLineItem.create({
        invoiceId,
        lineNumber,
        description,
        quantity,
        unitPrice,
        taxRate,
        discountRate,
        DRglAccountId,
        CRglAccountId,
        makerId,
        note
      });

      // Fetch created line item with associations
      const createdLineItem = await invoiceLineItem.findByPk(lineItem.id, {
        include: [
          { model: apInvoice, as: 'invoice' },
          { model: glAccount, as: 'DRglAccount' },
          { model: glAccount, as: 'CRglAccount' },
          { model: user, as: 'maker' }
        ]
      });

      // Update invoice total
      await this.updateInvoiceTotal(invoiceId);

      logger.info(`Invoice Line Item created successfully with ID: ${lineItem.id}`);

      res.status(201).json({
        success: true,
        message: 'Invoice Line Item created successfully',
        data: createdLineItem
      });

    } catch (error) {
      logger.error('Error creating Invoice Line Item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ===============================================================
  // GET LINE ITEMS BY INVOICE ID
  // ===============================================================
  static async getLineItemsByInvoice(req, res) {
    try {
      const { invoiceId } = req.params;
      logger.info(`Fetching line items for invoice: ${invoiceId}`);

      // Import the db models (adjust the path as needed)
      const db = require('../../models'); // or wherever your db setup file is

      const lineItems = await db.invoiceLineItem.findAll({
        where: { invoiceId },
        include: [
          {
            model: db.apInvoice,
            as: 'invoice',
            include: [
              {
                model: db.user,
                as: 'maker'
              },
              {
                model: db.user,
                as: 'checker'
              },
            ]
          },
          {
            model: db.chartAccount,
            as: 'DRglAccount'
          },
          {
            model: db.chartAccount,
            as: 'CRglAccount'
          },
          {
            model: db.user,
            as: 'maker'
          },

        ],
        order: [['lineNumber', 'ASC']]
      });

      res.status(200).json({
        success: true,
        message: 'Line items fetched successfully',
        data: lineItems
      });
    } catch (error) {
      logger.error('Error fetching line items:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ===============================================================
  // GET LINE ITEM BY ID
  // ===============================================================
  static async getLineItemById(req, res) {
    try {
      const { id } = req.params;
      logger.info(`Fetching line item with ID: ${id}`);

      const lineItem = await invoiceLineItem.findByPk(id, {
        include: [
          { model: apInvoice, as: 'invoice' },
          { model: glAccount, as: 'DRglAccount' },
          { model: glAccount, as: 'CRglAccount' },
          { model: user, as: 'maker' }
        ]
      });

      if (!lineItem) {
        return res.status(404).json({
          success: false,
          message: 'Line item not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Line item fetched successfully',
        data: lineItem
      });

    } catch (error) {
      logger.error('Error fetching line item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ===============================================================
  // UPDATE LINE ITEM
  // ===============================================================
  static async updateLineItem(req, res) {
    try {
      const { id } = req.params;
      logger.info(`Updating line item with ID: ${id}`);

      const lineItem = await invoiceLineItem.findByPk(id, {
        include: [{ model: apInvoice, as: 'invoice' }]
      });

      if (!lineItem) {
        return res.status(404).json({
          success: false,
          message: 'Line item not found'
        });
      }

      // Check if invoice is editable
      if (!['draft', 'pending'].includes(lineItem.invoice.status)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update line items for invoice in current status'
        });
      }

      // Check if GL has been posted
      if (lineItem.isGLPosted) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update line item that has been posted to GL'
        });
      }

      const updateData = req.body;

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.invoiceId;
      delete updateData.createdAt;
      delete updateData.updateTimestamp;
      delete updateData.lineTotal; // This is calculated automatically
      delete updateData.taxAmount; // This is calculated automatically
      delete updateData.discountAmount; // This is calculated automatically

      await lineItem.update(updateData);

      // Fetch updated line item with associations
      const updatedLineItem = await invoiceLineItem.findByPk(id, {
        include: [
          { model: apInvoice, as: 'invoice' },
          { model: glAccount, as: 'DRglAccount' },
          { model: glAccount, as: 'CRglAccount' },
          { model: user, as: 'maker' }
        ]
      });

      // Update invoice total
      await this.updateInvoiceTotal(lineItem.invoiceId);

      logger.info(`Line item updated successfully with ID: ${id}`);

      res.status(200).json({
        success: true,
        message: 'Line item updated successfully',
        data: updatedLineItem
      });

    } catch (error) {
      logger.error('Error updating line item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ===============================================================
  // DELETE LINE ITEM
  // ===============================================================
  static async deleteLineItem(req, res) {
    try {
      const { id } = req.params;
      logger.info(`Deleting line item with ID: ${id}`);

      const lineItem = await invoiceLineItem.findByPk(id, {
        include: [{ model: apInvoice, as: 'invoice' }]
      });

      if (!lineItem) {
        return res.status(404).json({
          success: false,
          message: 'Line item not found'
        });
      }

      // Check if invoice is editable
      if (!['draft', 'pending'].includes(lineItem.invoice.status)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete line items for invoice in current status'
        });
      }

      // Check if GL has been posted
      if (lineItem.isGLPosted) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete line item that has been posted to GL'
        });
      }

      const invoiceId = lineItem.invoiceId;
      await lineItem.destroy();

      // Update invoice total
      await this.updateInvoiceTotal(invoiceId);

      logger.info(`Line item deleted successfully with ID: ${id}`);

      res.status(200).json({
        success: true,
        message: 'Line item deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting line item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ===============================================================
  // BULK CREATE LINE ITEMS
  // ===============================================================
  static async bulkCreateLineItems(req, res) {
    try {
      const { invoiceId, lineItems } = req.body;
      logger.info(`Bulk creating line items for invoice: ${invoiceId}`);

      // Validation
      if (!invoiceId || !Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invoice ID and line items array are required'
        });
      }

      // Check if invoice exists and is editable
      const invoice = await apInvoice.findByPk(invoiceId);
      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      if (!['draft', 'pending'].includes(invoice.status)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot add line items to invoice in current status'
        });
      }

      // Prepare line items data
      const lineItemsData = lineItems.map((item, index) => ({
        ...item,
        invoiceId,
        lineNumber: item.lineNumber || (index + 1)
      }));

      // Create line items
      const createdLineItems = await invoiceLineItem.bulkCreate(lineItemsData);

      // Fetch created line items with associations
      const lineItemIds = createdLineItems.map(item => item.id);
      const fullLineItems = await invoiceLineItem.findAll({
        where: { id: { [Op.in]: lineItemIds } },
        include: [
          { model: apInvoice, as: 'invoice' },
          { model: glAccount, as: 'DRglAccount' },
          { model: glAccount, as: 'CRglAccount' },
          { model: user, as: 'maker' }
        ],
        order: [['lineNumber', 'ASC']]
      });

      // Update invoice total
      await this.updateInvoiceTotal(invoiceId);

      logger.info(`${createdLineItems.length} line items created successfully`);

      res.status(201).json({
        success: true,
        message: `${createdLineItems.length} line items created successfully`,
        data: fullLineItems
      });

    } catch (error) {
      logger.error('Error bulk creating line items:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ===============================================================
  // GET GL ENTRIES FOR LINE ITEM
  // ===============================================================
  static async getGLEntries(req, res) {
    try {
      const { id } = req.params;
      logger.info(`Getting GL entries for line item: ${id}`);

      const lineItem = await invoiceLineItem.findByPk(id, {
        include: [
          { model: glAccount, as: 'DRglAccount' },
          { model: glAccount, as: 'CRglAccount' }
        ]
      });

      if (!lineItem) {
        return res.status(404).json({
          success: false,
          message: 'Line item not found'
        });
      }

      const glEntries = lineItem.getGLEntries();

      if (!glEntries) {
        return res.status(400).json({
          success: false,
          message: 'Cannot generate GL entries - missing GL accounts or already posted'
        });
      }

      res.status(200).json({
        success: true,
        message: 'GL entries generated successfully',
        data: {
          lineItem: lineItem,
          glEntries: glEntries
        }
      });

    } catch (error) {
      logger.error('Error getting GL entries:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ===============================================================
  // HELPER METHOD - UPDATE INVOICE TOTAL
  // ===============================================================
  static async updateInvoiceTotal(invoiceId) {
    try {
      const lineItems = await invoiceLineItem.findAll({
        where: { invoiceId }
      });

      const totalAmount = lineItems.reduce((sum, item) =>
        sum + parseFloat(item.lineTotal || 0), 0);

      await apInvoice.update(
        { totalAmount },
        { where: { id: invoiceId } }
      );

      logger.info(`Invoice total updated for invoice: ${invoiceId}, new total: ${totalAmount}`);
    } catch (error) {
      logger.error('Error updating invoice total:', error);
      throw error;
    }
  }

  // ===============================================================
  // GET LINE ITEMS PENDING GL POSTING
  // ===============================================================
  static async getPendingGLLineItems(req, res) {
    try {
      logger.info('Fetching line items pending GL posting');

      const pendingLineItems = await invoiceLineItem.findAll({
        where: {
          isGLPosted: false,
          DRglAccountId: { [Op.not]: null },
          CRglAccountId: { [Op.not]: null }
        },
        include: [
          { model: apInvoice, as: 'invoice' },
          { model: glAccount, as: 'DRglAccount' },
          { model: glAccount, as: 'CRglAccount' },
          { model: user, as: 'maker' }
        ],
        order: [['createdAt', 'ASC']]
      });

      res.status(200).json({
        success: true,
        message: 'Pending GL line items fetched successfully',
        data: {
          count: pendingLineItems.length,
          lineItems: pendingLineItems
        }
      });

    } catch (error) {
      logger.error('Error fetching pending GL line items:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = invoiceLineItemController;