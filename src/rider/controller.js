const logger = require('../api/logger');

const Rider = require('../models').rider;

const riderController = {
  getAllRiders: async (req, res) => {
    try {
      const riders = await Rider.findAll();
      logger.info("rider" + riders)
      res.status(200).send(riders);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },
  getAllActiveRiders: async (req, res) => {
    try {
      const riders = await Rider.findAll({
        where: {
          isActive: true
        }
      });
      logger.info("rider" + riders)
      res.status(200).send(riders);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  getRiderById: async (req, res) => {
    const { id } = req.params;
    try {
      const rider = await Rider.findByPk(id);
      if (!rider) {
        return res.status(404).json({ message: 'Rider not found' });
      }
      res.status(200).send(rider);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  createRider: async (req, res) => {
    const { name, tel, rating, isActive } = req.body;
    logger.info(name + " " + tel + " " + rating)
    try {
      const rider = await Rider.create({ name, tel, rating, isActive });
      res.status(200).json(rider);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  updateRider: async (req, res) => {
    const { id } = req.params;
    const { name, tel, rating, isActive } = req.body;
    try {
      const rider = await Rider.findByPk(id);
      if (!rider) {
        return res.status(404).json({ message: 'Rider not found' });
      }
      const updatedRider = await rider.update({ name, tel, rating, isActive });
      res.status(200).json(updatedRider);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  deleteRider: async (req, res) => {
    const { id } = req.params;
    try {
      const rider = await Rider.findByPk(id);
      if (!rider) {
        return res.status(404).json({ message: 'Rider not found' });
      }
      await rider.destroy();
      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

module.exports = riderController;
