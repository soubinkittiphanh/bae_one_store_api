
const RECHeader = require('../models').receivingHeader;
const logger = require('../api/logger');
const RECLine = require('../models').receivingLine;
const headerService = require('./service')
const productService = require('./../product/service')
const cardService = require('./../card/service')
const lineService = require('./line/service')
const { sequelize } = require('../models');
const { error } = require('winston');

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
        const polineWithHeader = headerService.assignLineHeaderId(newPoHeader.id, newPoHeader.currencyId, req.body.lines)
        const newReceiveLineCreated = await RECLine.bulkCreate(polineWithHeader, { transaction: t });
        const cardCreated = await cardUtility(newReceiveLineCreated, locationId, t)
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
        const newLines = req.body.lines.filter(el => el.id == null)
        let newLineWithHeader = []
        if (newLines) {
          // Assign line header
          newLineWithHeader = headerService.assignLineHeaderId(req.params.id, poHeader.currencyId, newLines)
          // const newLineCreated =  await PoLine.bulkCreate(newLineWithHeader, { transaction: t });
        }
        let oldLines = req.body.lines.filter(el => el.id != null)
        const bothLines = oldLines.concat(newLineWithHeader)
        await lineService.simpleUpdateBulk(bothLines, t)
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

const cardUtility = async (receiveLines, locationId, t) => {
  const productIdList = receiveLines.map(el => el.productId);
  const productIdAndCodeList = await productService.findProductCodeFromProductId(productIdList);
  // ----------- Assign productCode to receiving line -----------
  for (const iterator of receiveLines) {
    iterator['productCode'] = productIdAndCodeList.find(el => el.id == iterator['productId'])['pro_id']
  }
  const cardCreated = await cardService.createCardFromReceiving(receiveLines, locationId, t)
  if (!cardCreated) {
    throw new error(`Cannot created cards`)
  }
  return cardCreated;
}
const cardUtilityReceivingLineChangesReflect = async (lines, locationId, t) => {
  const receivingIdList = lines.map(el => el['id'])
  const oldCardList = await cardService.findCardsByReceivingLineIdList(receivingIdList)
  for (const iterator of lines) {
    // ---------- Need to compair if receivingLine qty has change or not, if change i will 
    // ---------- impact card line, so we need to update card line qty base one receiving line
    const newCardCount = iterator['rate'] * iterator['qty']
    const oldCardCountList = oldCardList.filter(el => el.receivingLineId == iterator['id'])
    const oldCardCount = oldCardCountList.length
    const costPerCard = iterator['total'] / (iterator['qty'] * iterator['rate'])
    const currencyId = iterator['currencyId']
    // --------- ReceivingLine qty increase case -----------
    if (newCardCount > oldCardCount) {
      // ------- check if the cost has change 
      // ------- check how many increase
      const additionalUpCount = newCardCount - oldCardCount
      // ------- Update old cards -------//
      const updatedCards = await cardService.updateCardByIdList(costPerCard, locationId, currencyId, oldCardCountList, t)
      logger.info(`Update cards successfully ${JSON.stringify(updatedCards)}`)
      // ------- Create additional cards -------//
      let newRecevingLine = { ...iterator }
      newRecevingLine.qty = additionalUpCount
      newRecevingLine.cost = costPerCard * additionalUpCount
      newRecevingLine.rate = 1 // to ensure that new line card has exact number of new card need
      const createdCards = await cardService.createCardFromReceiving(newRecevingLine, locationId, t)
      logger.info(`Create cards successfully ${JSON.stringify(createdCards)}`)

    }
    else if (newCardCount < oldCardCount) {
      // ------- check if the cost has change 
      // ------- check how many decrease
      const additionalDownCount = oldCardCount - newCardCount
      // ------- the main senerio we have to know is, we cannot delete card already linke with saleLine
      // const myList = []
      // const aaList =  myList.slice(0,)
      const cardTobeDelete = oldCardCountList.filter(el => el['card_isused'] == 0 && el['saleLineId'] == null).slice(0, additionalDownCount)

      if (cardTobeDelete.length >= additionalDownCount) {
        // -------- only this case we expect since all card to be delete not yet linked to saleLine
        await cardService.deleteNotUseByIdList(cardTobeDelete, t)
        // we also need to update cards, since the other field may changes like cost, location, currency
        if (oldCardCount - newCardCount > 0) {
          // -------- that's mean, still some old card available --------//
          // ------- and we will update those cards any way weather any field has change or not
          // now no need to find card to be updated, since the rest of (those to be delete) is only there, we will update them all
          const idsInCardTobeDelete = cardTobeDelete.map(item => item.id);
          const updateCardList = oldCardCountList.filter(oldEl => !idsInCardTobeDelete.includes(oldEl['id']))
          const updatedCard = await cardService.updateCardByIdList(costPerCard, locationId, currencyId, updateCardList, t);
          logger.info(`Card decrease update successfully ${JSON.stringify(updatedCard)}`)
        }
      } else {
        // -------- We cannot delete card which is already sole out, since those will lead error with stock mismatch 
        logger.error(`Cannot delete cards which is already sold out ${JSON.stringify(cardTobeDelete)}`)
        throw new error(`Unable to delete card which already sold out !!!`)

      }

    }
    else { // qty still same, need to check is also the cost has change ?

    }
    // --------- ReceivingLine qty decrease case -----------

  }
}
module.exports = PoHeaderController;