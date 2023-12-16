
const logger = require('../../api/logger');
const  Owner  = require('../../models').owner; // Adjust the path as needed

const getAllOwners = async (req, res) => {
  try {
    const owners = await Owner.findAll();
    return res.status(200).json(owners);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getOwnerById = async (req, res) => {
  const { ownerId } = req.params;

  try {
    const owner = await Owner.findByPk(ownerId);

    if (!owner) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    return res.status(200).json(owner);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createOwner = async (req, res) => {
  const { name, lname, telephone, email, isActive } = req.body;

  try {
    const newOwner = await Owner.create({ name, lname, telephone, email, isActive });
    return res.status(201).json(newOwner);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateOwner = async (req, res) => {
  const { ownerId } = req.params;
  const { name, lname, telephone, email, isActive } = req.body;

  try {
    const owner = await Owner.findByPk(ownerId);

    if (!owner) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    await owner.update({ name, lname, telephone, email, isActive });
    return res.status(200).json(owner);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteOwner = async (req, res) => {
  const { ownerId } = req.params;

  try {
    const owner = await Owner.findByPk(ownerId);

    if (!owner) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    await owner.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllOwners,
  getOwnerById,
  createOwner,
  updateOwner,
  deleteOwner,
};
