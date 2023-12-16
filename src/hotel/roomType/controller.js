
const logger = require('../../api/logger');
const  RoomType  = require('../../models').roomType; // Adjust the path as needed

const getAllRoomTypes = async (req, res) => {
  try {
    const roomTypes = await RoomType.findAll();
    return res.status(200).json(roomTypes);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getRoomTypeById = async (req, res) => {
  const { roomTypeId } = req.params;

  try {
    const roomType = await RoomType.findByPk(roomTypeId);

    if (!roomType) {
      return res.status(404).json({ error: 'Room type not found' });
    }

    return res.status(200).json(roomType);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createRoomType = async (req, res) => {
  const { name, remark, isActive } = req.body;

  try {
    const newRoomType = await RoomType.create({ name, remark, isActive });
    return res.status(201).json(newRoomType);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateRoomType = async (req, res) => {
  const { roomTypeId } = req.params;
  const { name, remark, isActive } = req.body;

  try {
    const roomType = await RoomType.findByPk(roomTypeId);

    if (!roomType) {
      return res.status(404).json({ error: 'Room type not found' });
    }

    await roomType.update({ name, remark, isActive });
    return res.status(200).json(roomType);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteRoomType = async (req, res) => {
  const { roomTypeId } = req.params;

  try {
    const roomType = await RoomType.findByPk(roomTypeId);

    if (!roomType) {
      return res.status(404).json({ error: 'Room type not found' });
    }

    await roomType.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllRoomTypes,
  getRoomTypeById,
  createRoomType,
  updateRoomType,
  deleteRoomType,
};
