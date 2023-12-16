const logger = require('../../api/logger');

const  Hotel  = require('../../models').hotel; // Adjust the path as needed

const getAllHotels = async (req, res) => {
  try {
    const hotels = await Hotel.findAll();
    return res.status(200).json(hotels);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getHotelById = async (req, res) => {
  const { hotelId } = req.params;

  try {
    const hotel = await Hotel.findByPk(hotelId);

    if (!hotel) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    return res.status(200).json(hotel);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createHotel = async (req, res) => {
  const { name, address, telephone, location, email, isActive } = req.body;

  try {
    const newHotel = await Hotel.create({ name, address, telephone, location, email, isActive });
    return res.status(201).json(newHotel);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateHotel = async (req, res) => {
  const { hotelId } = req.params;
  const { name, address, telephone, location, email, isActive } = req.body;

  try {
    const hotel = await Hotel.findByPk(hotelId);

    if (!hotel) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    await hotel.update({ name, address, telephone, location, email, isActive });
    return res.status(200).json(hotel);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteHotel = async (req, res) => {
  const { hotelId } = req.params;

  try {
    const hotel = await Hotel.findByPk(hotelId);

    if (!hotel) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    await hotel.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllHotels,
  getHotelById,
  createHotel,
  updateHotel,
  deleteHotel,
};
