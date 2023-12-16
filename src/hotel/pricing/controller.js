
const logger = require('../../api/logger');
const  Pricing  = require('../../models').pricing; // Adjust the path as needed

const getAllPricings = async (req, res) => {
  try {
    const pricings = await Pricing.findAll();
    return res.status(200).json(pricings);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getPricingById = async (req, res) => {
  const { pricingId } = req.params;

  try {
    const pricing = await Pricing.findByPk(pricingId);

    if (!pricing) {
      return res.status(404).json({ error: 'Pricing not found' });
    }

    return res.status(200).json(pricing);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createPricing = async (req, res) => {
  const { name, price, exchangeRate, effectedDate, lastDate, isActive } = req.body;

  try {
    const newPricing = await Pricing.create({ name, price, exchangeRate, effectedDate, lastDate, isActive });
    return res.status(201).json(newPricing);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updatePricing = async (req, res) => {
  const { pricingId } = req.params;
  const { name, price, exchangeRate, effectedDate, lastDate, isActive } = req.body;

  try {
    const pricing = await Pricing.findByPk(pricingId);

    if (!pricing) {
      return res.status(404).json({ error: 'Pricing not found' });
    }

    await pricing.update({ name, price, exchangeRate, effectedDate, lastDate, isActive });
    return res.status(200).json(pricing);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deletePricing = async (req, res) => {
  const { pricingId } = req.params;

  try {
    const pricing = await Pricing.findByPk(pricingId);

    if (!pricing) {
      return res.status(404).json({ error: 'Pricing not found' });
    }

    await pricing.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllPricings,
  getPricingById,
  createPricing,
  updatePricing,
  deletePricing,
};
