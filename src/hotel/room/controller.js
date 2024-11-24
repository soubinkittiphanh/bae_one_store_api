
const logger = require('../../api/logger');
const  Room  = require('../../models').room; // Adjust the path as needed

const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.findAll();
    return res.status(200).json(rooms);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getRoomById = async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findByPk(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    return res.status(200).json(room);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createRoom = async (req, res) => {
  const { name, remark, isActive } = req.body;

  try {
    const newRoom = await Room.create({ name, remark, isActive });
    return res.status(201).json(newRoom);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateRoom = async (req, res) => {
  const { roomId } = req.params;
  const { name, remark, isActive } = req.body;

  try {
    const room = await Room.findByPk(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    await room.update({ name, remark, isActive });
    return res.status(200).json(room);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteRoom = async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findByPk(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    await room.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};
