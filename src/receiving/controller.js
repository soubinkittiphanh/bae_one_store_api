
const RECHeader = require('../models').receivingHeader;
const logger = require('../api/logger');
const RECLine = require('../models').receivingLine;
const headerService = require('./service')
// const productService = require('./../product/service')
const cardService = require('./../card/service')
const lineService = require('./line/service')
const { sequelize } = require('../models');
const { error } = require('winston');
const { Op } = require('sequelize');

// Create Payment Header
function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}
const PoHeaderController = {
  getAll: async (req, res) => {
    try {
      const poHeaders = await RECHeader.findAll({ include: ['lines', 'currency', 'vendor', 'poHeader'] });
      res.json(poHeaders);
    } catch (error) {
      logger.error(error);
      res.status(500).send('Internal Server Error');
    }
  },
  getAllByDate: async (req, res) => {
    const date = JSON.parse(req.query.date)
    try {
      const poHeaders = await RECHeader.findAll({
        where: {
          bookingDate: {
            [Op.between]: [date.startDate, date.endDate]
          }
        }, include: ['lines', 'currency', 'vendor', 'poHeader']
      });
      res.json(poHeaders);
    } catch (error) {
      logger.error(error);
      res.status(500).send('Internal Server Error');
    }
  },

  getById: async (req, res) => {
    try {
      const poHeader = await RECHeader.findByPk(req.params.id,
        {
          include: ['currency', 'vendor', {
            model: RECLine,
            as: "lines",
            include: ['product', 'unit'],

          }, "poHeader"]
        }
      );
      if (!poHeader) {
        return res.status(404).send('PoHeader not found');
      }
      res.json(poHeader);
    } catch (error) {
      logger.error(`Cannot load data with error ${error}`);
      res.status(500).send(`Cannot load data with error ${error}`);
    }
  },
  getByPOId: async (req, res) => {
    try {
      const poHeader = await RECHeader.findOne({
        where: { "poHeaderId": req.params.id },
        include: ['currency', 'vendor', {
          model: RECLine,
          as: "lines",
          include: ['product', 'unit'],

        }, "poHeader"]
      });
      if (!poHeader) {
        return res.status(401).send('PoHeader not found');
      }
      res.json(poHeader);
    } catch (error) {
      logger.error(`Cannot load data with error ${error}`);
      res.status(500).send(`Cannot load data with error ${error}`);
    }
  },

  create: async (req, res) => {
    try {
      const result = await sequelize.transaction(async (t) => {
        const locationId = req.body.locationId
        const newPoHeader = await RECHeader.create(req.body, { transaction: t });
        const polineWithHeader = headerService.assignLineHeaderId(newPoHeader.id, req.body.lines)
        const currencyId = newPoHeader.currencyId
        const newReceiveLineCreated = await RECLine.bulkCreate(polineWithHeader, { transaction: t });
        // -------- create card for receiving line
        const cardCreated = await cardService.cardUtility(newReceiveLineCreated, locationId, currencyId, t)
        logger.info(`Create card completed ${cardCreated.length}`)
        return { newPoHeader, newReceiveLineCreated };
      });
      return res.status(201).json(result)
    } catch (error) {
      logger.error(`Cannot create purchase order with error ${error}`);
      res.status(500).send('Internal Server Error');
    }
  },

  updateById: async (req, res) => {
    try {
      const result = await sequelize.transaction(async (t) => {
        const poHeader = await RECHeader.findByPk(req.params.id, { transaction: t });
        if (!poHeader) {
          // return res.status(404).send('PoHeader not found');
          throw new Error(`Receiving header ${req.params.id} not found `);
        }
        await poHeader.update(req.body, { transaction: t });
        const locationId = poHeader['locationId']
        const currencyId = poHeader['currencyId']
        const newLines = req.body.lines.filter(el => el.id == null)
        let newLineWithHeader = []
        if (newLines) {
          // Assign line header
          newLineWithHeader = headerService.assignLineHeaderId(req.params.id, newLines)
          // const newLineCreated =  await PoLine.bulkCreate(newLineWithHeader, { transaction: t });
        }
        let oldLines = req.body.lines.filter(el => el.id != null)
        const bothLines = oldLines.concat(newLineWithHeader)
        await lineService.simpleUpdateBulk(bothLines, locationId, currencyId, t)
        return await RECHeader.findByPk(req.params.id, {
          include: ['vendor', 'currency', {
            model: RECLine,
            as: "lines",
            include: ['product', 'unit'],
          }]
        })
      })
      res.status(200).json(result)
    } catch (error) {
      logger.error(`Cannot update PO Header with error ${error}`);
      res.status(500).send('Internal Server Error');
    }
  },

  deleteById: async (req, res) => {
    try {
      const poHeader = await RECHeader.findByPk(req.params.id);
      if (!poHeader) {
        return res.status(404).send('PoHeader not found');
      }

      await poHeader.destroy();
      res.json({ message: 'PoHeader deleted successfully' });
    } catch (error) {
      logger.error(error);
      res.status(500).send('Internal Server Error');
    }
  },
};


module.exports = PoHeaderController;