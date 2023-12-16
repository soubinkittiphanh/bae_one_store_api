
const logger = require('../../api/logger');
const  Building  = require('../../models').building; // Adjust the path as needed

const getAllBuildings = async (req, res) => {
  try {
    const buildings = await Building.findAll();
    return res.status(200).json(buildings);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getBuildingById = async (req, res) => {
  const { buildingId } = req.params;

  try {
    const building = await Building.findByPk(buildingId);

    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    return res.status(200).json(building);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createBuilding = async (req, res) => {
  const { name, remark, isActive } = req.body;

  try {
    const newBuilding = await Building.create({ name, remark, isActive });
    return res.status(201).json(newBuilding);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateBuilding = async (req, res) => {
  const { buildingId } = req.params;
  const { name, remark, isActive } = req.body;

  try {
    const building = await Building.findByPk(buildingId);

    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    await building.update({ name, remark, isActive });
    return res.status(200).json(building);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteBuilding = async (req, res) => {
  const { buildingId } = req.params;

  try {
    const building = await Building.findByPk(buildingId);

    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    await building.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllBuildings,
  getBuildingById,
  createBuilding,
  updateBuilding,
  deleteBuilding,
};
