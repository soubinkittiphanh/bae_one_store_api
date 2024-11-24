const logger = require('../api/logger');
const Shipping = require('../models').shipping;

module.exports = {
  async create(req, res) {
    try {
      const { name, code, tel, rating, isActive } = req.body;

      const shipping = await Shipping.create({
        name,
        code,
        tel,
        rating,
        isActive,
      });

      return res.status(201).json(shipping);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async findAll(req, res) {
    try {
      const shippings = await Shipping.findAll();
      return res.status(200).json(shippings);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
  async findAllActive(req, res) {
    try {
      const shippings = await Shipping.findAll({
        where: {
          isActive: true
        }
      });
      return res.status(200).json(shippings);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async findById(req, res) {
    try {
      const { id } = req.params;
      const shipping = await Shipping.findByPk(id);

      if (!shipping) {
        return res.status(404).json({ message: 'Shipping not found' });
      }

      return res.status(200).json(shipping);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, code, tel, rating, isActive } = req.body;

      const shipping = await Shipping.findByPk(id);

      if (!shipping) {
        return res.status(404).json({ message: 'Shipping not found' });
      }

      shipping.name = name;
      shipping.code = code;
      shipping.tel = tel;
      shipping.rating = rating;
      shipping.isActive = isActive;

      await shipping.save();

      return res.status(200).json(shipping);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;

      const shipping = await Shipping.findByPk(id);

      if (!shipping) {
        return res.status(404).json({ message: 'Shipping not found' });
      }

      await shipping.destroy();

      return res.status(204).json();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
};
