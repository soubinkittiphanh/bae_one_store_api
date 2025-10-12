const logger = require('../api/logger');

const Rider = require('../models').rider;
const  {Transaction}  = require('../models');

// Helper: Generate simple code if not provided
const generateCode = async () => {
  const count = await Transaction.count();
  const nextNumber = String(count + 1).padStart(4, '0');
  return `TRX-${nextNumber}`;
};

module.exports = {
  // Create new transaction
  async create(req, res) {
    try {
      const { code, type, description } = req.body;

      const newTransaction = await Transaction.create({
        code: code || await generateCode(),
        type,
        description,
      });

      res.status(201).json(newTransaction);
    } catch (error) {
      console.error('Transaction Create Error:', error);
      res.status(500).json({ message: 'Failed to create transaction', error });
    }
  },

  // Get all active transactions
  async getAll(req, res) {
    try {
      const { includeInactive } = req.query;
      const where = includeInactive ? {} : { isActive: true };

      const transactions = await Transaction.findAll({
        where,
        order: [['createdAt', 'DESC']],
      });

      res.json(transactions);
    } catch (error) {
      console.error('Transaction GetAll Error:', error);
      res.status(500).json({ message: 'Failed to fetch transactions', error });
    }
  },

  // Get single transaction by ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const trx = await Transaction.findByPk(id);

      if (!trx) {
        return res.status(404).json({ message: 'Transaction not found' });
      }

      res.json(trx);
    } catch (error) {
      console.error('Transaction GetById Error:', error);
      res.status(500).json({ message: 'Failed to fetch transaction', error });
    }
  },

  // Update transaction
  async update(req, res) {
    try {
      const { id } = req.params;
      const { type, description, isActive } = req.body;

      const trx = await Transaction.findByPk(id);
      if (!trx) {
        return res.status(404).json({ message: 'Transaction not found' });
      }

      await trx.update({ type, description, isActive });
      res.json(trx);
    } catch (error) {
      console.error('Transaction Update Error:', error);
      res.status(500).json({ message: 'Failed to update transaction', error });
    }
  },

  // Soft delete (set isActive = false)
  async deactivate(req, res) {
    try {
      const { id } = req.params;
      const trx = await Transaction.findByPk(id);

      if (!trx) {
        return res.status(404).json({ message: 'Transaction not found' });
      }

      await trx.update({ isActive: false });
      res.json({ message: 'Transaction deactivated successfully' });
    } catch (error) {
      console.error('Transaction Deactivate Error:', error);
      res.status(500).json({ message: 'Failed to deactivate transaction', error });
    }
  },

  // Permanently delete
  async delete(req, res) {
    try {
      const { id } = req.params;
      const deleted = await Transaction.destroy({ where: { id } });

      if (!deleted) {
        return res.status(404).json({ message: 'Transaction not found' });
      }

      res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
      console.error('Transaction Delete Error:', error);
      res.status(500).json({ message: 'Failed to delete transaction', error });
    }
  },
};
