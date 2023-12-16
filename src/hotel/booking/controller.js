
const logger = require('../../api/logger');
const  BedType  = require('../../models').bedType; // Adjust the path as needed

const getAllBedTypes = async (req, res) => {
  try {
    const bedTypes = await BedType.findAll();
    return res.status(200).json(bedTypes);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getBedTypeById = async (req, res) => {
  const { bedTypeId } = req.params;

  try {
    const bedType = await BedType.findByPk(bedTypeId);

    if (!bedType) {
      return res.status(404).json({ error: 'Bed type not found' });
    }

    return res.status(200).json(bedType);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createBedType = async (req, res) => {
  const { name, remark, isActive } = req.body;

  try {
    const newBedType = await BedType.create({ name, remark, isActive });
    return res.status(201).json(newBedType);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateBedType = async (req, res) => {
  const { bedTypeId } = req.params;
  const { name, remark, isActive } = req.body;

  try {
    const bedType = await BedType.findByPk(bedTypeId);

    if (!bedType) {
      return res.status(404).json({ error: 'Bed type not found' });
    }

    await bedType.update({ name, remark, isActive });
    return res.status(200).json(bedType);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteBedType = async (req, res) => {
  const { bedTypeId } = req.params;

  try {
    const bedType = await BedType.findByPk(bedTypeId);

    if (!bedType) {
      return res.status(404).json({ error: 'Bed type not found' });
    }

    await bedType.destroy();
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllBedTypes,
  getBedTypeById,
  createBedType,
  updateBedType,
  deleteBedType,
};
