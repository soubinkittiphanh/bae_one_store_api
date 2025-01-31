const logger = require('../api/logger');
const PriceList = require('../models').priceList;

const priceListService = {
    uploadCreatePriceList: async (req, res) => {
        try {
            const { name, type, isActive, amount, productId, currencyId, grade } = req.body;
            const newPriceList = await PriceList.create({ name, type, isActive, amount, productId, currencyId, grade });
            res.status(201).json(newPriceList);
        } catch (error) {
            logger.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    },
    uploadUpdatePriceList: async (req, res) => {
        try {
            const { name, type, isActive, amount, productId, currencyId, grade } = req.body;
            const newPriceList = await PriceList.create({ name, type, isActive, amount, productId, currencyId, grade });
            res.status(201).json(newPriceList);
        } catch (error) {
            logger.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    },
}
