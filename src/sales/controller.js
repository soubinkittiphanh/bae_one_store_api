
const SaleHeader = require('../models').saleHeader;
const Customer = require('../models').customer;
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
const productService = require('../product/service');
const { sequelize } = require('../models');

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
    // try {
    //   const { customerData, orderData } = req.body;

    //   const result = await sequelize.transaction(async (t) => {
    //     const customer = await Customer.create(customerData, { transaction: t });
    //     const order = await Order.create(
    //       { ...orderData, customerId: customer.id },
    //       { transaction: t }
    //     );

    //     return { customer, order };
    //   });

    //   return res.status(201).json(result);
    // } catch (error) {
    //   console.error(error);
    //   return res.status(500).json({ message: 'Internal server error' });
    // }
    let { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId, referenceNo, locationId, customerForm } = req.body;
    logger.info("===== Create Sale Header =====" + req.body)
    const result = await sequelize.transaction(async (t) => {
      const saleHeader = await SaleHeader.create({ bookingDate, remark, discount, total, exchangeRate, isActive, clientId, paymentId, currencyId, userId, referenceNo, locationId }, { transaction: t });
      let customer = null

      if (customerForm) {
        logger.info(`********** Customer form ${customerForm}***********`)
        logger.info(`********** Customer form ${customerForm.name}***********`)
        delete customerForm.discount
        customerForm.saleHeaderId = saleHeader.id
        customer = await Customer.create(customerForm, { transaction: t })

      }
      logger.info(`*************Sale header ${saleHeader.id} *************`)
      // **********************
      //  Line with headerId
      // **********************
      const lockingSessionId = common.generateLockingSessionId()
      try {
        const linesWithHeaderId = await assignHeaderId(lines, saleHeader.id, lockingSessionId, false, locationId)
        lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId)
      } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created
        // ********************************************
        logger.error("Something wrong need to reverse header " + error)
        await headerService.saleHeaderReversal(saleHeader.id)
        res.status(500).send("Unfortunately " + error)
      }
      return { customer, saleHeader };
    })
    logger.info(`Transaction compleate ${result}`)
  } catch (error) {
    logger.error(`Error occurs ${error}`)
    res.status(500).send(error)
  }
};

exports.updateSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId, locationId } = req.body;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info("Updating header")
    const lockingSessionId = common.generateLockingSessionId()
    await assignHeaderId(lines, id, lockingSessionId, true, locationId)
    // ********** Clasify new or old saleLine ********** //
    const saleLineForCreate = lines.filter(el => el['id'] == null)
    logger.warn(`SaleLine for create count is ${saleLineForCreate.length}`)

    if (saleLineForCreate.length > 0) await lineService.createBulkSaleLineWithoutRes(saleLineForCreate, lockingSessionId)

    await saleHeader.update({ bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId });
    logger.info(`Update transaction completed ${saleHeader}`)

    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
    updateProductStockCount(lines)
    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//

    res.status(200).json(saleHeader);
  } catch (error) {
    logger.error("Cannot update data " + error)
    res.status(500).send(`Cannot update data with ${error}`);
  }
};
const assignHeaderId = async (line, id, lockingSessionId, isUpdate, locationId) => {
  for (const iterator of line) {
    logger.warn(`Check if lineId is null or undifine ${iterator.id}`)
    iterator.headerId = id
    iterator.saleHeaderId = id
    logger.warn("header id ===> " + iterator.headerId)
    try {
      // ********** If it header is fresh record then we directly reserve new card ************ //
      // ********** If not we will have condition ************ //
      if (!isUpdate || !iterator.id) {
        // ********** Sale Create Handler ************ //
        const qty = iterator.unitRate * iterator.quantity
        await reserveCard(iterator, lockingSessionId, qty, locationId)
      } else {
        // ********** Sale Update Handler ************ //
        // ********** The logic part of update existing card ************ //
        const previousCards = await Card.findAll({
          order: [['createdAt', 'DESC']],
          where: {
            saleLineId: iterator.id
          }
        })
        const currentRequiredQty = iterator.unitRate * iterator.quantity
        const qty = currentRequiredQty - previousCards.length
        // ********** Check if product has changed ********** //
        if (previousCards[0]['productId'] == iterator['productId']) {
          // ********** Same product handler ************ //
          logger.info(`*************Previous card productId is the same with current ProductId************`)
          if (currentRequiredQty > previousCards.length) {
            //************ More product card qty need handler *************/
            await reserveCard(iterator, lockingSessionId, qty, locationId)
            logger.info(`********* Immediatly update saleLine after reserved cards *********`)
          } else if (currentRequiredQty == previousCards.length) {
            //************ No need to do anything *************/
          } else {
            //************ Product card reduce handler *************/
            //************ and we have to remove some previous card *************/
            try {
              const preCardCount = previousCards.length
              const numberOfLastCardForPuttingBackToInventory = currentRequiredQty - preCardCount
              const cardsForReversBack = previousCards.slice(numberOfLastCardForPuttingBackToInventory)
              logger.warn(`Card previous count #${preCardCount} and cad now count #${currentRequiredQty}`)
              logger.warn(`cardsForReversBack count #${cardsForReversBack.length}`)

              // ********** reduce previous cards ***********// 
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
          // ********** Different product handler ***********// 
          logger.warn(`*************Previous card productId is not the same with current ProductId************`)
          await reserveCard(iterator, lockingSessionId, currentRequiredQty, locationId)

          // ********** Reverse all previous cards from this sale line ***********// 
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

const reserveCard = async (line, lockingSessionId, qty, locationId) => {
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
      locationId
    }

  })
  logger.info("Product Id ===>: " + line.productId)
  logger.info("Cards available len ===>: " + cards.length + " sale qty needed " + qty)
  if (!cards || cards.length < qty) {
    throw new Error(`Stock not enought #${line.productId}`);
  }
  let entryOption = {
    locking_session_id: lockingSessionId,
    card_isused: true,
  }

  if (line.id) {
    // ************ Line already has id (Old line) ************
    entryOption.saleLineId = line.id
  }

  const cardreserved = await Card.update(entryOption, {
    where: {
      id: {
        [Op.in]: cards.map(el => el.id)
      }
    }
  })
  logger.info(`$$$$$$ Reserve cards completed ${cardreserved} records $$$$$`)
}


exports.getSaleHeaders = async (req, res) => {
  try {
    const saleHeaders = await SaleHeader.findAll({ include: ['lines', 'user', 'client', 'payment', 'currency', 'location',Customer], });

    res.status(200).json({ success: true, data: saleHeaders });
  } catch (error) {
    res.status(500).send(error);
  }
};


exports.getSaleHeadersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', 'location',Customer,
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
        },
        // isActive:false
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
    const saleHeader = await SaleHeader.findByPk(id, {
      include: ['lines', 'user', 'location', 'client', 'payment', 'currency', 'location', Customer, {
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
      }],
    });

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json(saleHeader);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.getSaleHeaderByPaymentType = async (req, res) => {

  try {
    const { clientId, paymentId, date } = req.body;
    const saleHeaders = await SaleHeader.findAll({
      include: ['lines', 'user', 'location', 'client', 'payment', 'currency', 'location', {
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
      }],
      where: {
        paymentId,
        clientId,
        isActive: true,
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
      }
    },

    );

    if (!saleHeaders) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json(saleHeaders);
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
    const saleHeader = await SaleHeader.findAll({
      attributes: ['total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        }
      }

    })
    res.send(saleHeader)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }

  // attributes: ['id', 'name'],
  // SaleHeader.sum(literal('total - discount'), {
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
    const saleHeader = await SaleHeader.findAll({
      attributes: ['total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        }
      }

    })
    res.send(saleHeader)
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
    const saleHeader = await SaleHeader.findAll({
      attributes: ['bookingDate', 'total', 'discount'],
      where: {
        bookingDate: {
          [Op.between]: [startDate, endDate]
        },
        isActive: true,
      }

    })
    res.send(saleHeader)
  } catch (error) {
    logger.error(`Something went wrong with error ${error}`)
    res.send(`Something went wrong with error ${error}`)
  }
};
