
const SaleHeader = require('../models').saleHeader;
const Line = require('../models').saleLine;
const Product = require('../models').product;
const Card = require('../models').card;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const lineService = require("./line/service");
const headerService = require("./service");
const common = require('../common')
const { Op } = require('sequelize');


// 1. 200 OK - The request has succeeded and the server has returned the requested data.

// 2. 201 Created - The request has been fulfilled and a new resource has been created.

// 3. 204 No Content - The server successfully processed the request, but there is no response body to return.

// 4. 400 Bad Request - The server cannot or will not process the request due to an error in the client's request.

// 5. 401 Unauthorized - The client must authenticate itself before it can access the requested resource.

// 6. 403 Forbidden - The server understands the request but refuses to authorize it.

// 7. 404 Not Found - The server cannot find the requested resource.

// 8. 500 Internal Server Error - The server encountered an unexpected condition that prevented it from fulfilling the request.

// 9. 502 Bad Gateway - The server received an invalid response from an upstream server while trying to fulfill the request.
exports.createSaleHeader = async (req, res) => {
  try {
    let { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId } = req.body;
    const saleHeader = await SaleHeader.create({ bookingDate, remark, discount, total, exchangeRate, isActive, clientId, paymentId, currencyId, userId });
    logger.info('Sale header ' + saleHeader.id)
    logger.info("===== Create Sale Header =====" + req.body)
    // **********************
    //  Line with headerId
    // **********************
    const lockingSessionId = common.generateLockingSessionId()
    try {
      const linesWithHeaderId = await assignHeaderId(lines, saleHeader.id, lockingSessionId, false)
      lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId)
    } catch (error) {
      // ********************************************
      //  Reverse SaleHeader just created
      // ********************************************
      logger.error("Something wrong need to reverse header " + error)
      await headerService.saleHeaderReversal(saleHeader.id)
      res.status(500).send("Unfortunately " + error)
    }
  } catch (error) {
    res.status(500).send(error)
  }
};

exports.updateSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId } = req.body;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info("Updating header")
    const lockingSessionId = common.generateLockingSessionId()
    await assignHeaderId(lines, id, lockingSessionId, true)
    // ********** Clasify new or old saleLine ********** //
    const saleLineForCreate = lines.filter(el => el['id'] == null)
    logger.warn(`SaleLine for create count is ${saleLineForCreate.length}`)
    if (saleLineForCreate.length > 0) await lineService.createBulkSaleLineWithoutRes(saleLineForCreate, lockingSessionId)
    await saleHeader.update({ bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId });
    logger.info(`Update transaction completed ${saleHeader}`)
    res.status(200).json(saleHeader);
  } catch (error) {
    logger.error("Cannot update data " + error)
    res.status(500).send(`Cannot update data with ${error}`);
  }
};
const assignHeaderId = async (line, id, lockingSessionId, isUpdate) => {
  for (const iterator of line) {
    logger.warn(`Check if lineId is null or undifine ${iterator.id}`)
    iterator.headerId = id
    iterator.saleHeaderId = id
    logger.warn("header id ===> " + iterator.headerId)
    try {
      // ********** If it header is fresh record then we directly reserve new card ************ //
      // ********** If not we will have condition ************ //
      if (!isUpdate || !iterator.id) {
        const qty = iterator.unitRate * iterator.quantity
        await reserveCard(iterator, lockingSessionId, qty)
      } else {
        // ********** The logic part of update existing card ************ //
        // ********** Reverse all previous cards from this saleLineId and assign new one ************ //
        // await headerService.cardReversal(iterator.productId, iterator.id)
        const previousCards = await Card.findAll({
          order: [['createdAt', 'DESC']],
          where: {
            saleLineId: iterator.id
          }
        })
        const currentRequiredQty = iterator.unitRate * iterator.quantity
        const qty = currentRequiredQty - previousCards.length

        if (previousCards[0]['productId'] == iterator['productId']) {
          logger.info(`*************Previous card productId is the same with current ProductId************`)

          if (currentRequiredQty > previousCards.length) {
            //************ If current require greater than previous cards logic *************/
            await reserveCard(iterator, lockingSessionId, qty)
            logger.info(`********* Immediatly update saleLine after reserved cards *********`)

          } else if (currentRequiredQty == previousCards.length) {
            //************ No need to do anything *************/
          } else {
            //************ Current card less than previous card logic *************/
            //************ and we have to remove some previous card *************/

            try {
              // ********** Update if already exist function ***********// 
              const preCardCount = previousCards.length
              const n = currentRequiredQty - preCardCount
              const cards = previousCards.slice(n)
              logger.warn(`Card previous count #${preCardCount} and cad now count #${currentRequiredQty}`)
              logger.warn(`Card1 count #${cards.length}`)
              for (const iterator of cards) {
                const updatedCard = await iterator.update({
                  card_isused: 0,
                  saleLineId: null,
                  isActive: true
                })
                logger.info(`Reverse over cards succesfully ${updatedCard['card_isused']}`)
              }
            } catch (error) {
              logger.error(`Reverse over cards fail ${error}`)
              throw new Error(`Reverse over cards fail ${error}`)
            }
          }
        } else {
          logger.info(`*************Previous card productId is not the same with current ProductId************`)
          await reserveCard(iterator, lockingSessionId, currentRequiredQty)
          for (const iterator of previousCards) {
            const updatedCard = await iterator.update({
              card_isused: 0,
              saleLineId: null,
              isActive: true
            })
            logger.info(`Reverse over cards succesfully ${updatedCard['card_isused']}`)
          }
        }
        logger.warn(`This saleLineId ${iterator.id} has previous card count ${previousCards.length}`)

        // ************** Update saleLine entry ************** //
        logger.info(`// ************** Update saleLine entry ************** //`)
        await lineService.updateSaleLine(iterator)
      }

    } catch (error) {
      logger.error(`Stock is not enought for productId ${iterator.productId}`)
      if (!isUpdate) await headerService.cardReversalByLockingSessionId(lockingSessionId)
      // await releaseTempCard(lockingSessionId)
      throw new Error(error)
    }
  }
  return line;
}


const reserveCard = async (line, lockingSessionId, qty) => {
  //  *********************************
  //  Assign Card for cost calculation
  //  *********************************
  // const qty = line.unitRate * line.quantity
  const cards = await Card.findAll({
    limit: qty, // limit to n records
    order: [['createdAt', 'DESC']], // order by createdAt column in descending order
    where: {
      productId: line.productId,
      saleLineId: null,
      card_isused: 0,
    }

  })
  logger.info("Product Id ===>: " + line.productId)
  logger.info("Cards available len ===>: " + cards.length + " sale qty needed " + qty)
  if (!cards || cards.length < qty) {
    throw new Error(`Stock not enought #${line.productId}`);
  }
  for (const iterator of cards) {
    let updatedCard = null
    try {
      const entryOption = {
        locking_session_id: lockingSessionId,
        card_isused: true,
        // saleLineId: iterator.id
      }
      if (iterator.id) {
        entryOption.saleLineId = line.id
        logger.warn(`=====> ${JSON.stringify(entryOption)}`)
        updatedCard = await iterator.update(entryOption);
      } else {
        updatedCard = await iterator.update(entryOption);
      }
      logger.info("Reserved card " + updatedCard.id + " succesfully")
    } catch (error) {
      logger.error("Reserved card " + iterator.id + " false with error " + error)
      throw new Error("Card reservation error")
    }
  }
}

//  ******************************************************************
//  TempCard is the card reserved before create the transaction 
//  If any product is out of stock during reserve card
//  We will release all reserve card just created earlier 
//  ******************************************************************
const releaseTempCard = async (lockingSessionId) => {
  const cards = await Card.findAll({
    where: {
      locking_session_id: lockingSessionId,
    }
  })
  logger.warn(`Cards to be released found ${cards.length}`)
  for (const iterator of cards) {
    try {
      const releaseCard = await iterator.update({
        locking_session_id: lockingSessionId,
        card_isused: 0,
        saleLineId: null,
      });
      logger.info("Release card " + releaseCard.id + " succesfully")
    } catch (error) {
      logger.error("Release card " + releaseCard.id + " false with error " + error)
      throw new Error("Card release error")
    }
  }
}

exports.getSaleHeaders = async (req, res) => {
  try {
    const saleHeaders = await SaleHeader.findAll({ include: ['lines', 'user', 'client', 'payment', 'currency'], });

    res.status(200).json({ success: true, data: saleHeaders });
  } catch (error) {
    res.status(500).send(error);
  }
};
exports.getSaleHeadersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency',
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            }
          ]
        }

      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        }
      }
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};

exports.getSaleHeaderById = async (req, res) => {
  try {
    const { id } = req.params;
    const saleHeader = await SaleHeader.findByPk(id, { include: ['lines', 'user', 'client', 'payment', 'currency'], });

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json(saleHeader);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.updateSaleHeaderPostToInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    // const { bookingDate, remark, discount, total, exchangeRate, isActive } = req.body;
    const isActive = true;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await saleHeader.update({ isActive });

    res.status(200).json({ success: true, data: saleHeader });
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.deleteSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await saleHeader.destroy();

    res.status(200).json({ success: true, message: 'Sale header deleted successfully' });
  } catch (error) {
    res.status(500).send(error);
  }
};
