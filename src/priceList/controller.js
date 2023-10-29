const logger = require('../api/logger');
const PriceList = require('../models').priceList;

const priceListController = {
  createPriceList: async (req, res) => {
    try {
      const { name, type, isActive, amount, productId, currencyId } = req.body;
      const newPriceList = await PriceList.create({ name, type, isActive, amount, productId, currencyId });
      res.status(201).json(newPriceList);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  getPriceLists: async (req, res) => {
    try {
      const priceLists = await PriceList.findAll();
      res.status(200).json(priceLists);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  getActivePriceLists: async (req, res) => {
    try {
      const priceLists = await PriceList.findAll({ where: { isActive: true } });
      res.status(200).json(priceLists);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  getPriceListById: async (req, res) => {
    try {
      const { id } = req.params;
      const priceList = await PriceList.findByPk(id);
      if (!priceList) {
        return res.status(404).json({ message: 'Price list not found' });
      }
      res.status(200).json(priceList);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  getPriceListByProductId: async (req, res) => {
    try {
      const { id } = req.params;
      const priceList = await PriceList.findAll({ where: { productId: id, isActive: true } });
      if (!priceList) {
        return res.status(404).json({ message: 'Price list not found' });
      }
      res.status(200).json(priceList);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  updatePriceListById: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, type, isActive, amount, productId, currencyId } = req.body;
      const priceListToUpdate = await PriceList.findBy(id);
      if (!priceListToUpdate) {
        return res.status(404).json({ message: 'Price list not found' });
      }
      const updatedPriceList = await priceListToUpdate.update({ name, type, isActive, amount, productId, currencyId });
      res.status(200).json(updatedPriceList);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  deletePriceListById: async (req, res) => {
    try {
      const { id } = req.params;
      const priceListToDelete = await PriceList.findByPk(id);
      if (!priceListToDelete) {
        return res.status(404).json({ message: 'Price list not found' });
      }
      await priceListToDelete.destroy();
      res.status(204).json();
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  },
};

module.exports = priceListController;
