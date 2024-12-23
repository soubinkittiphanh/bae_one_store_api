
const SaleHeader = require('../models').saleHeader;
const SaleLine = require('../models').saleLine;
const Customer = require('../models').customer;
const Line = require('../models').saleLine;
const Shipping = require('../models').shipping;
const Geo = require('../models').geography;
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
      logger.warn(`SALE HEADER: ${JSON.stringify(req.body)}`)
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
      const errorList = []
      try {
        const linesWithHeaderId = await assignHeaderId(lines, saleHeader.id, lockingSessionId, false, locationId)
        lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId)
      } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created
        // ********************************************
        logger.error("Something wrong need to reverse header " + error)
        res.status(500).send("Unfortunately " + error)
        // throw new Error(error)
        errorList.push(error)
      }
      const reversalRequire = errorList.length > 0 ? true : false
      return { customer, saleHeader, reversalRequire };
    })
    if (result.reversalRequire) {
      await headerService.saleHeaderReversal(result.saleHeader.id)
      return logger.warn(`Transaction reversed`)
    }
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
exports.settlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentId, codFee, customerId } = req.body;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info("Updating header")
    await saleHeader.update({ paymentId, });
    logger.info(`Update transaction completed ${saleHeader}`)
    // ******* IF COD FEE IS THERE NEED TO UPDATE DY-CUS ********
    const customer = await Customer.findByPk(customerId)
    await customer.update({ cod_fee: codFee })
    res.status(200).json(saleHeader);
  } catch (error) {
    logger.error("Cannot update data " + error)
    res.status(500).send(`Cannot update data with ${error}`);
  }
};
exports.reverseSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, remark, cancel_fee, customerId } = req.body;
    const saleHeader = await SaleHeader.findByPk(id, {
      include: [{
        model: Line,
        as: "lines",
        include: [
          {
            model: Product,
            as: "product"
          },
          'cards'
        ]
      }]
    });
    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info(`SaleLine len: ${saleHeader['lines'].length}`)
    logger.info(`SaleLine product len: ${saleHeader['lines'].length}`)
    // Collect card id to reverse back
    // const cardIds = [];
    // for (const iterator of saleHeader['lines']) {
    //   logger.info(`product id ${iterator['product']['id']}`)
    //   cardIds.concat(iterator['cards'].map(card => card['id']))
    // }
    const cardIds = saleHeader['lines'].flatMap(iterator => iterator['cards'].map(card => card['id']));
    const lineIds = saleHeader['lines'].map(line => line.id)
    const result = await sequelize.transaction(async (t) => {
      const updatedRecord = await saleHeader.update({ isActive, remark }, { transaction: t });
      const updatedSaleLineRecord = await SaleLine.update({ isActive }, { where: { 'id': { [Op.in]: lineIds } } }, { transaction: t });
      const [numUpdated] = await Card.update(
        {
          card_isused: 0,
          saleLineId: null,
          isActive: true,
        },
        {
          where: {
            id: {
              [Op.in]: cardIds,
            },
          },
        }, { transaction: t }
      );
      return { updatedRecord, numUpdated };
    })




    logger.info("Reversal is on going...")
    // ********** Clasify new or old saleLine ********** //
    logger.info(`Reversal transaction completed ${saleHeader}`)

    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
    updateProductStockCount(saleHeader['lines'])
    // ************* TAKE THE PRODUC ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
    // *********** SET CANCELATION CHARGE ***********
    if (cancel_fee > 0) {
      logger.info(`CANCEL FEE SET ${cancel_fee} | ${customerId}`)
      const customer = await Customer.findByPk(customerId)
      await customer.update({ cancel_fee: cancel_fee })
    }
    res.status(200).json(saleHeader);
  } catch (error) {
    logger.error("Cannot reverse data " + error)
    res.status(500).send(`Cannot reverse data with ${error}`);
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
    const saleHeaders = await SaleHeader.findAll({ include: ['lines', 'user', 'client', 'payment', 'currency', 'location', Customer], });

    res.status(200).json({ success: true, data: saleHeaders });
  } catch (error) {
    res.status(500).send(error);
  }
};


exports.getSaleHeadersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  logger.warn(`Request date ${date.startDate} userId ${req.user.id}`)
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', 'location',
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            }
          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping', 'rider']
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
exports.getSaleHeadersDetailByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  logger.warn(`Request date ${date.startDate} userId ${req.user.id}`)
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', 'location',
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            },
            'cards'
          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping', 'rider']
        }

      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        // isActive:true
      }
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};

exports.getSaleHeadersByDateAndUser = async (req, res) => {
  logger.warn("=============Loading saleHeader data=============")
  const date = JSON.parse(req.query.date);
  logger.warn(`Request date ${date.startDate} userId ${date.userId}`)
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', 'location', Customer,
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            },
            {
              model: SaleHeader,
              as: "header"
            },

          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping']
        }

      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        userId: {
          [date.userId < 1 ? Op.ne : Op.eq]: date.userId,
        }
      }
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};
exports.getSaleHeadersByDateAndCustomer = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn(`Request date ${date.startDate} customerId ${date.clientId}`)
  try {
    const saleHeaders = await SaleHeader.findAll({
      include: ['user', 'client', 'payment', 'currency', 'location', Customer,
        {
          model: Line,
          as: "lines",
          include: [
            {
              model: Product,
              as: "product"
            },
            {
              model: SaleHeader,
              as: "header"
            }
          ]
        }

      ],
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
        clientId: {
          [date.clientId < 1 ? Op.ne : Op.eq]: date.clientId,
        }
      }
    });

    res.status(200).send(saleHeaders);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};
exports.getSaleHeadersByDateAndProduct = async (req, res) => {
  const date = JSON.parse(req.query.date);
  const productId = date.productId;
  logger.warn(`Request date ${date.startDate} customerId ${date.productId}`)
  try {
    const saleLines = await Line.findAll({
      attributes: [
        ['productId', 'product_id'], // Aliasing product.id as product_id
        ['headerId', 'header_id'],   // Aliasing header.id as header_id
        [sequelize.fn('SUM', sequelize.col('price')), 'totalPrice'],
        [sequelize.fn('SUM', sequelize.col('saleLine.total')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQTY'],
        [sequelize.fn('SUM', sequelize.col('header.discount')), 'totalDiscount'],
      ],
      group: ['productId'],
      include: [
        {
          model: Product,
          as: "product"
        },
        {
          model: SaleHeader,
          as: "header",
          include: ['user', 'client', 'payment', 'currency', 'location', Customer],
          where: {
            '$header.bookingDate$': {
              [Op.between]: [date.startDate, date.endDate]
            },
            '$saleLine.productId$': { // Assuming `productId` is the correct field name
              [productId < 1 ? Op.ne : Op.eq]: productId,
            },
          },
        }
      ],
      where: {
        "isActive": true,
      }
    });

    res.status(200).send(saleLines);
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
      include: [Customer],
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
