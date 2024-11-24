
const logger = require('../../api/logger');
const  GuestFolio  = require('../../models').guestFolio; // Adjust the path as needed


const getAllGuestFolios = async (req, res) => {
  try {
    const guestFolios = await GuestFolio.findAll();
    return res.status(200).json(guestFolios);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getGuestFolioById = async (req, res) => {
  const { guestFolioId } = req.params;

  try {
    const guestFolio = await GuestFolio.findByPk(guestFolioId);

    if (!guestFolio) {
      return res.status(404).json({ error: 'GuestFolio not found' });
    }

    return res.status(200).json(guestFolio);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createGuestFolio = async (req, res) => {
  const { title, firstName, lastName, email, phoneNumber, guestType, isActive } = req.body;

  try {
    const newGuestFolio = await GuestFolio.create({
      title,
      firstName,
      lastName,
      email,
      phoneNumber,
      guestType,
      isActive,
    });

    return res.status(201).json(newGuestFolio);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateGuestFolio = async (req, res) => {
  const { guestFolioId } = req.params;
  const { title, firstName, lastName, email, phoneNumber, guestType, isActive } = req.body;

  try {
    const guestFolio = await GuestFolio.findByPk(guestFolioId);

    if (!guestFolio) {
      return res.status(404).json({ error: 'GuestFolio not found' });
    }

    await guestFolio.update({
      title,
      firstName,
      lastName,
      email,
      phoneNumber,
      guestType,
      isActive,
    });

    return res.status(200).json(guestFolio);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteGuestFolio = async (req, res) => {
  const { guestFolioId } = req.params;

  try {
    const guestFolio = await GuestFolio.findByPk(guestFolioId);

    if (!guestFolio) {
      return res.status(404).json({ error: 'GuestFolio not found' });
    }

    await guestFolio.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllGuestFolios,
  getGuestFolioById,
  createGuestFolio,
  updateGuestFolio,
  deleteGuestFolio,
};
