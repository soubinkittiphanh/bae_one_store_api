
const logger = require('../../api/logger');
const  RateType  = require('../../models').rateType; // Adjust the path as needed

const getAllRateTypes = async (req, res) => {
  try {
    const rateTypes = await RateType.findAll();
    return res.status(200).json(rateTypes);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getRateTypeById = async (req, res) => {
  const { rateTypeId } = req.params;

  try {
    const rateType = await RateType.findByPk(rateTypeId);

    if (!rateType) {
      return res.status(404).json({ error: 'RateType not found' });
    }

    return res.status(200).json(rateType);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createRateType = async (req, res) => {
  const { name, remark, isActive } = req.body;

  try {
    const newRateType = await RateType.create({ name, remark, isActive });
    return res.status(201).json(newRateType);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateRateType = async (req, res) => {
  const { rateTypeId } = req.params;
  const { name, remark, isActive } = req.body;

  try {
    const rateType = await RateType.findByPk(rateTypeId);

    if (!rateType) {
      return res.status(404).json({ error: 'RateType not found' });
    }

    await rateType.update({ name, remark, isActive });
    return res.status(200).json(rateType);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteRateType = async (req, res) => {
  const { rateTypeId } = req.params;

  try {
    const rateType = await RateType.findByPk(rateTypeId);

    if (!rateType) {
      return res.status(404).json({ error: 'RateType not found' });
    }

    await rateType.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllRateTypes,
  getRateTypeById,
  createRateType,
  updateRateType,
  deleteRateType,
};
