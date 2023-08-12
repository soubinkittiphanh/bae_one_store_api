
const TransferHeader = require('../models').transferHeader;
const Line = require('../models').transferLine;
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
    let { bookingDate, remark, isActive, lines, userId, srcLocationId, desLocationId } = req.body;
    const transfer = await TransferHeader.create({ bookingDate, remark, isActive, userId,srcLocationId,desLocationId });
    logger.info('Sale header ' + transfer.id)
    logger.info("===== Create Tranfer Header =====" + req.body)
    // **********************
    //  Line with headerId
    // **********************
    const lockingSessionId = common.generateLockingSessionId()
    try {
      const linesWithHeaderId = await assignHeaderId(lines, transfer.id, lockingSessionId,srcLocationId,desLocationId, false)
      lineService.createBulkTransferLine(res, linesWithHeaderId, lockingSessionId,srcLocationId,desLocationId)
    } catch (error) {
      // ********************************************
      //  Reverse TransferHeader just created
      // ********************************************
      logger.error("Something wrong need to reverse header " + error)
      await headerService.transferHeaderReversal(transfer.id)
      res.status(500).send("Unfortunately " + error)
    }
  } catch (error) {
    res.status(500).send(error)
  }
};

exports.updatetransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, isActive, lines, clientId, paymentId, currencyId, userId,srcLocationId,desLocationId } = req.body;
    const transfer = await TransferHeader.findByPk(id);

    if (!transfer) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info("Updating header")
    const lockingSessionId = common.generateLockingSessionId()
    await assignHeaderId(lines, id, lockingSessionId,srcLocationId,desLocationId, true)
    // ********** Clasify new or old saleLine ********** //
    const saleLineForCreate = lines.filter(el => el['id'] == null)
    logger.warn(`SaleLine for create count is ${saleLineForCreate.length}`)

    if (saleLineForCreate.length > 0) await lineService.createBulkTransferLineWithoutRes(saleLineForCreate, lockingSessionId)

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
const assignHeaderId = async (line, id, lockingSessionId,srcLocationId,desLocationId, isUpdate) => {
  for (const iterator of line) {
    logger.warn(`Check if lineId is null or undifine ${iterator.id}`)
    iterator.headerId = id
    iterator.transferHeaderId = id
    logger.warn("header id ===> " + iterator.headerId)
    try {
      // ********** If it header is fresh record then we directly reserve new card ************ //
      // ********** If not we will have condition ************ //
        const qty = iterator.unitRate * iterator.quantity
        // productService.updateProductCountById(iterator.productId)
        await reserveCard(iterator, lockingSessionId,srcLocationId,desLocationId, qty)
    } catch (error) {
      logger.error(`Stock is not enought for productId ${iterator.productId}`)
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

const reserveCard = async (line,lockingSessionId,srcLocationId,desLocationId,qty) => {
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
      locationId: srcLocationId,
      card_isused: 0,
      isActive: true,
    }

  })
  logger.info("Product Id ===>: " + line.productId)
  logger.info("Cards available len ===>: " + cards.length + " sale qty needed " + qty)
  if (!cards || cards.length < qty) {
    throw new Error(`Stock not enought #${line.productId}`);
  }

  // const thoseFreshLines = cards.filter(el => el.id == null)
  // const thoseOldLines = cards.filter(el => el.id != null)
  let entryOption = {
    locking_session_id: lockingSessionId,
    isActive: false
  }
  // ################ card for Fresh line ################
  logger.info(`Book the cards for Fresh line for ${cards.length} cards`)
  const numRowsUpdatedCardFresh = await Card.update(entryOption, {
    where: {
      id: {
        [Op.in]: cards.map(el => el.id)
      }
    }
  })
  logger.info(`$$$$$$ Update cards for fresh line completed ${numRowsUpdatedCardFresh} records $$$$$`)
}


exports.getTransfers = async (req, res) => {
  try {
    const transfers = await TransferHeader.findAll({ include: ['lines', 'user'], });

    res.status(200).json({ success: true, data: transfers });
  } catch (error) {
    res.status(500).send(error);
  }
};


exports.getTransfersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  try {
    const transfers = await TransferHeader.findAll({
      include: ['user', 'srcLocation', 'desLocation',
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

exports.getTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    const transfer = await TransferHeader.findByPk(id, { include: ['lines', 'user', 'srcLocation','desLocation', {
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

exports.updateTransferPostToInvoice = async (req, res) => {
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

exports.deleteTransfer = async (req, res) => {
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
