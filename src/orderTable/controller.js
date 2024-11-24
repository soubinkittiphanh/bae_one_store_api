
const { Op } = require('sequelize');
const logger = require('../api/logger');
const OrderTable = require('../models').orderTable; // Adjust the path accordingly

const orderTableController = {
  createOrderTable: async (req, res) => {
    try {
      const { name, llname, remark, status, isActive } = req.body;
      const orderTable = await OrderTable.create({ name, llname, remark, status, isActive });
      res.json(orderTable);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error creating OrderTable' });
    }
  },

  getAllOrderTables: async (req, res) => {
    try {
      const orderTables = await OrderTable.findAll();
      res.json(orderTables);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error fetching OrderTables' });
    }
  },

  getOrderTableById: async (req, res) => {
    try {
      const { id } = req.params;
      const orderTable = await OrderTable.findByPk(id);
      if (!orderTable) {
        return res.status(404).json({ error: 'OrderTable not found' });
      }
      res.json(orderTable);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error fetching OrderTable by ID' });
    }
  },

  updateOrderTableById: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, llname, remark, status, isActive } = req.body;
      const orderTable = await OrderTable.findByPk(id);
      if (!orderTable) {
        return res.status(404).json({ error: 'OrderTable not found' });
      }
      orderTable.name = name;
      orderTable.llname = llname;
      orderTable.remark = remark;
      orderTable.status = status;
      orderTable.isActive = isActive;
      await orderTable.save();
      res.json(orderTable);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error updating OrderTable by ID' });
    }
  },

  deleteOrderTableById: async (req, res) => {
    try {
      const { id } = req.params;
      const orderTable = await OrderTable.findByPk(id);
      if (!orderTable) {
        return res.status(404).json({ error: 'OrderTable not found' });
      }
      await orderTable.destroy();
      res.json({ message: 'OrderTable deleted successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error deleting OrderTable by ID' });
    }
  },
};

module.exports = orderTableController;