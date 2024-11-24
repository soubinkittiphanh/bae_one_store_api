
const PoHeader = require('../models').poHeader;
const logger = require('../api/logger');
const PoLine = require('../models').poLine;
const headerService = require('./service')
const lineService = require('./line/service')
const { sequelize } = require('../models');
// Create Payment Header
function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}
const PoHeaderController = {
  getAll: async (req, res) => {
    try {
      const poHeaders = await PoHeader.findAll({ include: ['lines', 'currency', 'vendor'] });
      res.json(poHeaders);
    } catch (error) {
      logger.error(error);
      res.status(500).send('Internal Server Error');
    }
  },

  getById: async (req, res) => {
    try {
      const poHeader = await PoHeader.findByPk(req.params.id,
        {
          include: ['currency', 'vendor', {
            model: PoLine,
            as: "lines",
            include: ['product', 'unit'],

          }]
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

  create: async (req, res) => {
    try {
      const result = await sequelize.transaction(async (t) => {
        const newPoHeader = await PoHeader.create(req.body, { transaction: t });
        const polineWithHeader = headerService.assignLineHeaderId(newPoHeader.id, req.body.lines)
        // res.json(newPoHeader);
        const newPoLines = await PoLine.bulkCreate(polineWithHeader, { transaction: t });
        return { newPoHeader, newPoLines };
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
        const poHeader = await PoHeader.findByPk(req.params.id, { transaction: t });
        if (!poHeader) {
          return res.status(404).send('PoHeader not found');
        }
        await poHeader.update(req.body, { transaction: t });
        const newLines = req.body.lines.filter(el => el.id == null)
        let newLineWithHeader = []
        if (newLines) {
          // Assign line header
          newLineWithHeader = headerService.assignLineHeaderId(req.params.id, newLines)
          // const newLineCreated =  await PoLine.bulkCreate(newLineWithHeader, { transaction: t });
        }
        let oldLines = req.body.lines.filter(el => el.id != null)
        const bothLines = oldLines.concat(newLineWithHeader)
        await lineService.simpleUpdateBulk(bothLines, t)
        return await PoHeader.findByPk(req.params.id, {
          include: ['vendor', 'currency', {
            model: PoLine,
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
      const poHeader = await PoHeader.findByPk(req.params.id);
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