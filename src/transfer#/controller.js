
const Currency = require('../models').currency;
const { Transfer } = require('../models');

module.exports = {
  // Create a new transfer
  async createTransfer(req, res) {
    const { bookingDate, referenceNo, remark } = req.body;
    try {

      // Create a new transfer record in the database
      const transfer = await Transfer.create({
        bookingDate,
        referenceNo,
        remark
      });

      res.status(201).json({
        success: true,
        message: 'Transfer created successfully',
        data: transfer
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Something went wrong',
        error: error.message
      });
    }
  },

  // Get all transfers
  async getTransfers(req, res) {
    try {
      // Retrieve all transfer records from the database
      const transfers = await Transfer.findAll();

      res.status(200).json({
        success: true,
        message: 'Transfers retrieved successfully',
        data: transfers
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Something went wrong',
        error: error.message
      });
    }
  },

  // Get a single transfer by ID
  async getTransferById(req, res) {
    try {
      const { id } = req.params;

      // Retrieve the transfer record with the specified ID from the database
      const transfer = await Transfer.findByPk(id);

      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: 'Transfer not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Transfer retrieved successfully',
        data: transfer
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Something went wrong',
        error: error.message
      });
    }
  },

  // Update a transfer by ID
  async updateTransfer(req, res) {
    try {
      const { id } = req.params;
      const { bookingDate, referenceNo, remark } = req.body;

      // Retrieve the transfer record with the specified ID from the database
      let transfer = await Transfer.findByPk(id);

      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: 'Transfer not found'
        });
      }

      // Update the transfer record in the database
      transfer.bookingDate = bookingDate;
      transfer.referenceNo = referenceNo;
      transfer.remark = remark;
      await transfer.save();

      res.status(200).json({
        success: true,
        message: 'Transfer updated successfully',
        data: transfer
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Something went wrong',
        error: error.message
      });
    }
  },

  // Delete a transfer by ID
  async deleteTransfer(req, res) {
    const { id } = req.params;
    try {

      // Retrieve the transfer record with the specified ID from the database
      const transfer = await Transfer.findByPk(id);

      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: 'Transfer not found'
        });
      }

      // Delete the transfer record from the database
      await transfer.destroy();

      res.status(200).json({
        success: true,
        message: 'Transfer deleted successfully'
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Something went wrong',
        error: error.message
      });
    }
  }
};
