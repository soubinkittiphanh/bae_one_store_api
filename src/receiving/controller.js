
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
const ReceivingController = {
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
            include: [
              {
                association: 'product',
                include: ['images']
              },
              'unit'
            ],

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
        const locationId = req.body.locationId
        const newPoHeader = await RECHeader.create(req.body, { transaction: t });
        const polineWithHeader = headerService.assignLineHeaderId(newPoHeader.id, req.body.lines)
        const currencyId = newPoHeader.currencyId
        const newReceiveLineCreated = await RECLine.bulkCreate(polineWithHeader, { transaction: t });
        // -------- create card for receiving line
        const cardCreated = await cardService.cardUtility(newReceiveLineCreated, locationId, currencyId, t)
        logger.info(`Create card completed ${cardCreated.length}`)

        // Automatically update Purchase Order status if linked
        if (req.body.poHeaderId) {
          const purchasingService = require('../purchasing/service');
          await purchasingService.updatePoStatus(req.body.poHeaderId, t);
        }

        // POST STOCK TOPUP JOURNAL ENTRY TO GL
        try {
          const AccountingPostingService = require('../GL/accountingPostingService');
          await AccountingPostingService.postStockTopupEntry(newPoHeader, req.body.lines || [], t);
        } catch (glError) {
          logger.error('Failed to post stock topup GL entry: ' + glError.message);
          throw glError;
        }

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

        // Automatically update Purchase Order status if linked
        if (poHeader.poHeaderId || req.body.poHeaderId) {
          const purchasingService = require('../purchasing/service');
          await purchasingService.updatePoStatus(poHeader.poHeaderId || req.body.poHeaderId, t);
        }

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
      const poHeader = await RECHeader.findByPk(req.params.id, { include: ['lines'] });
      if (!poHeader) {
        return res.status(404).send('PoHeader not found');
      }

      const Card = require('../models').card;
      const lineIds = (poHeader.lines || []).map(l => l.id);
      const cards = await Card.findAll({
        where: {
          receivingLineId: {
            [Op.in]: lineIds
          }
        }
      });

      const soldOutCards = cards.filter(c => c.card_isused === 1 || c.saleLineId !== null);
      if (soldOutCards.length > 0) {
        return res.status(400).send("ບໍ່ສາມາດຍົກເລີກໄດ້ ເນື່ອງຈາກມີບາງສິນຄ້າຖືກຂາຍອອກໄປແລ້ວ / Unable to cancel because some items are already sold out");
      }

      await sequelize.transaction(async (t) => {
        // Deactivate/soft-delete cards created by this receiving transaction
        if (cards.length > 0) {
          const cardIds = cards.map(c => c.id);
          await Card.update({
            isActive: false,
            card_isused: 2, // Adjusted/deleted
            update_user: req.user?.id || req.body.userId || 1,
            update_time: new Date()
          }, {
            where: {
              id: {
                [Op.in]: cardIds
              }
            },
            transaction: t,
            individualHooks: true
          });
        }

        // POST REVERSAL JOURNAL ENTRY TO GL (Before destroying records)
        try {
          const AccountingPostingService = require('../GL/accountingPostingService');
          await AccountingPostingService.postStockDeletionEntry(poHeader, poHeader.lines || [], t);
        } catch (glError) {
          logger.error('Failed to post stock deletion GL entry: ' + glError.message);
          throw glError;
        }

        await poHeader.destroy({ transaction: t });
        if (poHeader.poHeaderId) {
          const purchasingService = require('../purchasing/service');
          await purchasingService.updatePoStatus(poHeader.poHeaderId, t);
        }
      });

      // Update product stock count in database
      const productService = require('../product/service');
      const uniqueProductIds = [...new Set(cards.map(c => c.productId))];
      for (const prodId of uniqueProductIds) {
        try {
          await productService.updateProductCountById(prodId);
        } catch (cntError) {
          logger.error(`Error updating product count for productId: ${prodId}`, cntError);
        }
      }

      res.json({ message: 'PoHeader deleted successfully' });
    } catch (error) {
      logger.error(error);
      res.status(500).send('Internal Server Error');
    }
  },
};


module.exports = ReceivingController;