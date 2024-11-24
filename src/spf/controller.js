
const Currency = require('../models').currency;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const service = require('./service')
module.exports = {
  async findCurrencies(req, res) {
    try {
      const currencies = await Currency.findAll();
      res.status(200).json(currencies);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  async findActiveCurrencies(req, res) {
    try {
      const currencies = await Currency.findAll({
        where: {
          isActive: true
        }
      });
      res.status(200).json(currencies);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async findCurrency(req, res) {
    const { id } = req.params;
    try {
      const currency = await Currency.findByPk(id);
      if (!currency) {
        return res.status(404).json({ error: 'Currency not found' });
      }
      res.status(200).json(currency);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async createCurrency(req, res) {
    const { code, name, rate, isActive } = req.body;
    try {
      const currency = await Currency.create({ code, name, rate, isActive });
      res.status(201).json(currency);
    } catch (error) {
      console.error(error);
      res.status().json({ error: 'Internal server error' });
    }
  },

  async updateCurrency(req, res) {
    const { id } = req.params;
    const { code, name, rate, isActive } = req.body;
    try {
      const currency = await Currency.findByPk(id);
      if (!currency) {
        return res.status(404).json({ error: 'Currency not found' });
      }
      await currency.update({ code, name, rate, isActive });
      res.status(200).json(currency);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async destroyCurrency(req, res) {
    const { id } = req.params;
    try {
      const currency = await Currency.findByPk(id);
      if (!currency) {
        return res.status(404).json({ error: 'Currency not found' });
      }
      await currency.destroy();
      res.status(204).json({});
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  async generate(req, res) {
    await service.createBulk(req, res);
  }
};