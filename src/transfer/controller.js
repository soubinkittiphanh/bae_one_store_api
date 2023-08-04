
const TransferHeader = require('../models').transfer;
const Line = require('../models').saleLine;
const Product = require('../models').product;
const Card = require('../models').card;
const Unit = require('../models').unit;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const lineService = require("./line/service");
const headerService = require("./service");
const common = require('../common')
const { Op, where, literal } = require('sequelize');
const productService = require('../product/service')

// 1. 200 OK - The request has succeeded and the server has returned the requested data.

// 2. 201 Created - The request has been fulfilled and a new resource has been created.

// 3. 204 No Content - The server successfully processed the request, but there is no response body to return.

// 4. 400 Bad Request - The server cannot or will not process the request due to an error in the client's request.

// 5. 401 Unauthorized - The client must authenticate itself before it can access the requested resource.

// 6. 403 Forbidden - The server understands the request but refuses to authorize it.

// 7. 404 Not Found - The server cannot find the requested resource.

// 8. 500 Internal Server Error - The server encountered an unexpected condition that prevented it from fulfilling the request.

// 9. 502 Bad Gateway - The server received an invalid response from an upstream server while trying to fulfill the request.
exports.createTransferHeader = async (req, res) => {
  try {
    let { bookingDate, remark,isActive, lines, userId,srcLocationId,dstLocationId } = req.body;
    const transfer = await TransferHeader.create({ bookingDate, remark, isActive, userId,srcLocationId,dstLocationId });
    logger.info('Sale header ' + transfer.id)
    logger.info("===== Create Tranfer Header =====" + req.body)
    // **********************
    //  Line with headerId
    // **********************
    const lockingSessionId = common.generateLockingSessionId()
    try {
      const linesWithHeaderId = await assignHeaderId(lines, transfer.id, lockingSessionId, false)
      lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId)
    } catch (error) {
      // ********************************************
      //  Reverse TransferHeader just created
      // ********************************************
      logger.error("Something wrong need to reverse header " + error)
      await headerService.transferReversal(transfer.id)
      res.status(500).send("Unfortunately " + error)
    }
  } catch (error) {
    res.status(500).send(error)
  }
};

exports.updatetransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, isActive, lines, clientId, paymentId, currencyId, userId } = req.body;
    const transfer = await TransferHeader.findByPk(id);

    if (!transfer) {
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

    await transfer.update({ bookingDate, remark, isActive, lines, clientId, paymentId, currencyId, userId });
    logger.info(`Update transaction completed ${transfer}`)

    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
    updateProductStockCount(lines)
    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//

    res.status(200).json(transfer);
  } catch (error) {
    logger.error("Cannot update data " + error)
    res.status(500).send(`Cannot update data with ${error}`);
  }
};
const assignHeaderId = async (line, id, lockingSessionId, isUpdate) => {
  for (const iterator of line) {
    logger.warn(`Check if lineId is null or undifine ${iterator.id}`)
    iterator.headerId = id
    iterator.transferId = id
    logger.warn("header id ===> " + iterator.headerId)
    try {
      // ********** If it header is fresh record then we directly reserve new card ************ //
      // ********** If not we will have condition ************ //
      if (!isUpdate || !iterator.id) {
        const qty = iterator.unitRate * iterator.quantity
        // productService.updateProductCountById(iterator.productId)
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
        // ********** Check if the previous card productId is the same or not ********** //
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
              const numberOfLastCardForPuttingBackToInventory = currentRequiredQty - preCardCount
              const cardsForReversBack = previousCards.slice(numberOfLastCardForPuttingBackToInventory)
              logger.warn(`Card previous count #${preCardCount} and cad now count #${currentRequiredQty}`)
              logger.warn(`cardsForReversBack count #${cardsForReversBack.length}`)
              const updatedCard = await Card.update({
                card_isused: 0,
                saleLineId: null,
                isActive: true
              }, {
                where: {
                  id: {
                    [Op.in]: cardsForReversBack.map(el => el.id)
                  }
                }
              }
              )
            } catch (error) {
              logger.error(`Reverse over cards fail ${error}`)
              throw new Error(`Reverse over cards fail ${error}`)
            }
          }
        } else {
          logger.warn(`*************Previous card productId is not the same with current ProductId************`)
          await reserveCard(iterator, lockingSessionId, currentRequiredQty)
          logger.info(`************* Send previous use cards back to inventory *************`)
          const updatedCard = await Card.update({
            card_isused: 0,
            saleLineId: null,
            isActive: true
          }, {
            where: {
              id: {
                [Op.in]: previousCards.map(el => el.id)
              }
            }
          })
          //**************** Update previous card make it back available in inventory ****************/
          logger.info(`//**************** Update previous card make it back available in inventory ****************/`)
          productService.updateProductCountById(previousCards[0]['productId'])
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

const updateProductStockCount = async (lines) => {
  // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
  const productIdList = lines.map((item) => {
    return item.productId
  });
  await productService.updateProductCountGroup(productIdList)
  // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
}

const reserveCard = async (line,lockingSessionId,srcLocationId,qty) => {
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
      srcLocationId: srcLocationId,
      card_isused: 0,
    }

  })
  logger.info("Product Id ===>: " + line.productId)
  logger.info("Cards available len ===>: " + cards.length + " sale qty needed " + qty)
  if (!cards || cards.length < qty) {
    throw new Error(`Stock not enought #${line.productId}`);
  }

  const thoseFreshLines = cards.filter(el => el.id == null)
  const thoseOldLines = cards.filter(el => el.id != null)
  let entryOption = {
    locking_session_id: lockingSessionId,
    card_isused: true,
  }
  // ################ card for Fresh line ################
  logger.info(`Book the cards for Fresh line for ${thoseFreshLines.length} cards`)
  const numRowsUpdatedCardFresh = await Card.update(entryOption, {
    where: {
      id: {
        [Op.in]: thoseFreshLines.map(el => el.id)
      }
    }
  })
  logger.info(`$$$$$$ Update cards for fresh line completed ${numRowsUpdatedCardFresh} records $$$$$`)
  // ################ card for Old line ################
  logger.info(`Book the cards for Old line for ${thoseOldLines.length} cards`)
  entryOption.saleLineId = line.id
  const numRowsUpdatedCardOld = await Card.update(entryOption, {
    where: {
      id: {
        [Op.in]: thoseOldLines.map(el => el.id)
      }
    }
  })
  logger.info(`$$$$$$ Update cards for old line completed ${numRowsUpdatedCardOld} records $$$$$`)
  
}


exports.gettransfers = async (req, res) => {
  try {
    const transfers = await TransferHeader.findAll({ include: ['lines', 'user', 'client', 'payment', 'currency'], });

    res.status(200).json({ success: true, data: transfers });
  } catch (error) {
    res.status(500).send(error);
  }
};


exports.gettransfersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  try {
    const transfers = await TransferHeader.findAll({
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

    res.status(200).send(transfers);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};

exports.gettransferById = async (req, res) => {
  try {
    const { id } = req.params;
    const transfer = await TransferHeader.findByPk(id, { include: ['lines', 'user', 'client', 'payment', 'currency', {
      model: Line,
      as: "lines",
      include: [
        {
          model: Product,
          as: "product"
        },
        {
          model: Unit,
          as: "unit"
        },
      ]
    }], });

    if (!transfer) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json(transfer);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.updatetransferPostToInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    // const { bookingDate, remark, isActive } = req.body;
    const isActive = true;
    const transfer = await TransferHeader.findByPk(id);

    if (!transfer) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await transfer.update({ isActive });

    res.status(200).json({ success: true, data: transfer });
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.deletetransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const transfer = await TransferHeader.findByPk(id);

    if (!transfer) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await transfer.destroy();

    res.status(200).json({ success: true, message: 'Sale header deleted successfully' });
  } catch (error) {
    res.status(500).send(error);
  }
};


// const products = await Product.findAll({
//   where: {
//     [Op.and]: Sequelize.literal('(price * quantity) > 100')
//   }
// });
exports.sumSaleToday = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  const { startDate, endDate } = date // new Date('2022-01-01');
  try {
    const transfer = await TransferHeader.findAll({
      attributes: ['total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        }
      }

    })
    res.send(transfer)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }

  // attributes: ['id', 'name'],
  // TransferHeader.sum(literal('total - discount'), {
  //   where: {
  //     bookingDate: {
  //       [Op.between]: [startDate, endDate]
  //     }
  //   }
  // })
  //   .then(total => {
  //     console.log(`Total price after discounts between ${startDate} and ${endDate}: ${total}`);
  //     res.send(total)
  //   })
  //   .catch(err => {
  //     logger.error(`Error cannot retreive data ${err}`)
  //     res.status(503).send(`error ${err}`)
  //   });
};

exports.sumSaleCurrentMonth = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  const { startDate, endDate } = date // new Date('2022-01-01');
  try {
    const transfer = await TransferHeader.findAll({
      attributes: ['total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        }
      }

    })
    res.send(transfer)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }
};
exports.sumSaleCurrentYear = async (req, res) => {
  // Calculate the sum of total - discount for products between two dates
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  const { startDate, endDate } = date // new Date('2022-01-01');
  try {
    const transfer = await TransferHeader.findAll({
      attributes: ['bookingDate','total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        }
      }

    })
    res.send(transfer)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }
};