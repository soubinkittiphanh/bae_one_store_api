// ===============================================================
// AUDIT MIDDLEWARE - ADD TO EXISTING CONTROLLER
// ===============================================================
const  MoneyAdvanceAudit  = require('../models').moneyAdvanceAudit;

class AuditHelper {
  
  /**
   * Capture audit context from request
   */
  static getAuditContext(req) {
    return {
      userId: req.user?.id || req.body.userId || req.query.userId,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      reason: req.body.reason || req.query.reason
    };
  }

  /**
   * Create audit record for CREATE action
   */
  static async auditCreate(recordId, newData, context = {}) {
    return await MoneyAdvanceAudit.createAuditRecord(
      recordId,
      'CREATE',
      null, // no old data for create
      newData,
      context
    );
  }

  /**
   * Create audit record for UPDATE action
   */
  static async auditUpdate(recordId, oldData, newData, context = {}) {
    return await MoneyAdvanceAudit.createAuditRecord(
      recordId,
      'UPDATE',
      oldData,
      newData,
      context
    );
  }

  /**
   * Create audit record for DELETE action
   */
  static async auditDelete(recordId, oldData, context = {}) {
    return await MoneyAdvanceAudit.createAuditRecord(
      recordId,
      'DELETE',
      oldData,
      null, // no new data for delete
      context
    );
  }

  /**
   * Create audit record for APPROVE action
   */
  static async auditApprove(recordId, oldData, newData, context = {}) {
    return await MoneyAdvanceAudit.createAuditRecord(
      recordId,
      'APPROVE',
      oldData,
      newData,
      context
    );
  }

  /**
   * Create audit record for SETTLE action
   */
  static async auditSettle(recordId, oldData, newData, context = {}) {
    return await MoneyAdvanceAudit.createAuditRecord(
      recordId,
      'SETTLE',
      oldData,
      newData,
      context
    );
  }
}

// ===============================================================
// MODIFIED CONTROLLER METHODS - ADD THESE TO YOUR EXISTING CONTROLLER
// ===============================================================


// ===============================================================
// SIMPLE WRAPPER FUNCTIONS - USE THESE IN YOUR EXISTING CONTROLLER
// ===============================================================

class MoneyAdvanceControllerWithAudit {
  
  // Wrapper for create with audit
  static async createWithAudit(req, res) {
    try {
      const {
        bookingDate,
        amount,
        exchangeRate,
        purpose,
        note,
        makerId,
        currencyId,
        dueDate,
        bankAccountId,
        ministryId
      } = req.body;

      // Validation (your existing validation logic)
      if (!bookingDate || !amount || !makerId || !currencyId) {
        return res.status(400).json({
          success: false,
          message: 'BookingDate, amount, makerId, and currencyId are required'
        });
      }

      // Create the record (your existing create logic)
      const advance = await MoneyAdvance.create({
        bookingDate,
        amount,
        exchangeRate,
        purpose,
        note,
        makerId,
        currencyId,
        dueDate,
        bankAccountId,
        ministryId,
        status: 'pending'
      });

      // Create audit record
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditCreate(advance.id, advance.toJSON(), auditContext);

      // Fetch with associations (your existing logic)
      const createdAdvance = await MoneyAdvance.findByPk(advance.id, {
        include: [
          { model: user, as: 'maker' },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdAdvance,
        message: 'Money advance created successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating money advance',
        error: error.message
      });
    }
  }

  // Wrapper for update with audit
  static async updateWithAudit(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Get current record before update
      const currentRecord = await MoneyAdvance.findByPk(id);
      if (!currentRecord) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      // Store old data for audit
      const oldData = currentRecord.toJSON();

      // Your existing update validation and logic
      if (currentRecord.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update approved or settled advances'
        });
      }

      // Update the record
      await currentRecord.update(updateData);

      // Create audit record
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditUpdate(id, oldData, currentRecord.toJSON(), auditContext);

      // Fetch updated record with associations
      const updatedAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.json({
        success: true,
        data: updatedAdvance,
        message: 'Money advance updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating money advance',
        error: error.message
      });
    }
  }

  // Wrapper for approve with audit
  static async approveWithAudit(req, res) {
    try {
      const { id } = req.params;
      const { checkerId } = req.body;

      // Get current record
      const advance = await MoneyAdvance.findByPk(id);
      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      if (advance.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending advances can be approved'
        });
      }

      // Store old data
      const oldData = advance.toJSON();

      // Update status
      await advance.update({
        status: 'approved',
        checkerId,
        approvedAt: new Date()
      });

      // Create audit record
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditApprove(id, oldData, advance.toJSON(), auditContext);

      // Return updated record
      const approvedAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.json({
        success: true,
        data: approvedAdvance,
        message: 'Money advance approved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error approving money advance',
        error: error.message
      });
    }
  }

  // Wrapper for settle with audit
  static async settleWithAudit(req, res) {
    try {
      const { id } = req.params;

      const advance = await MoneyAdvance.findByPk(id);
      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      if (advance.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Only approved advances can be settled'
        });
      }

      // Store old data
      const oldData = advance.toJSON();

      // Update status
      await advance.update({ status: 'settled' });

      // Create audit record
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditSettle(id, oldData, advance.toJSON(), auditContext);

      // Return updated record
      const settledAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: settlement, as: 'settlementLine' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.json({
        success: true,
        data: settledAdvance,
        message: 'Money advance settled successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error settling money advance',
        error: error.message
      });
    }
  }

  // Wrapper for delete with audit
  static async deleteWithAudit(req, res) {
    try {
      const { id } = req.params;

      const advance = await MoneyAdvance.findByPk(id);
      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      if (advance.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete approved or settled advances'
        });
      }

      // Store data before deletion
      const oldData = advance.toJSON();

      // Delete the record
      await advance.destroy();

      // Create audit record
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditDelete(id, oldData, auditContext);

      res.json({
        success: true,
        message: 'Money advance deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting money advance',
        error: error.message
      });
    }
  }

  // Get audit trail for a specific record
  static async getAuditTrail(req, res) {
    try {
      const { id } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const auditTrail = await MoneyAdvanceAudit.getAuditTrail(id, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: auditTrail.map(record => record.getChangeSummary()),
        totalRecords: auditTrail.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching audit trail',
        error: error.message
      });
    }
  }

  // Get audit changes by user
  static async getUserAuditTrail(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const changes = await MoneyAdvanceAudit.getChangesByUser(userId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: changes,
        totalRecords: changes.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching user audit trail',
        error: error.message
      });
    }
  }
}

module.exports = {
  AuditHelper,
  MoneyAdvanceControllerWithAudit
};