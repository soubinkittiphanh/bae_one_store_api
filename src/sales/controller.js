
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
    let { bookingDate, remark, discount, total, exchangeRate, isActive, line, clientId, paymentId, currencyId, userId } = req.body;
    const saleHeader = await SaleHeader.create({ bookingDate, remark, discount, total, exchangeRate, isActive, clientId, paymentId, currencyId, userId });
    logger.info('Sale header ' + saleHeader.id)
    logger.info("===== Create Sale Header =====" + req.body)
    // **********************
    //  Line with headerId
    // **********************
    const lockingSessionId = common.generateLockingSessionId()
    try {
      const linesWithHeaderId = await assignHeaderId(line, saleHeader.id, lockingSessionId)
      lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId)
    } catch (error) {
      // ********************************************
      //  Reverse SaleHeader just created
      // ********************************************
      logger.error("Something wrong need to reverse header "+error)
      await headerService.saleHeaderReversal(saleHeader.id)
      res.status(500).send("Unfortunately " + error)
    }
  } catch (error) {
    res.status(500).send(error)
  }
};
const assignHeaderId = async (line, id, lockingSessionId) => {

  for (const iterator of line) {
    iterator.headerId = id
    iterator.saleHeaderId = id
    logger.warn("header id ===> " + iterator.headerId)
    try {
      await reserveCard(iterator, lockingSessionId)

    } catch (error) {
      throw new Error(error)
    }
  }
  return line;
}

const reserveCard = async (line, lockingSessionId) => {
  //  *********************************
  //  Assign Card for cost calculation
  //  *********************************
  const qty = line.unitRate * line.quantity
  const cards = await Card.findAll({
    limit: qty, // limit to n records
    order: [['createdAt', 'DESC']], // order by createdAt column in descending order
    where: {
      productId: line.productKey,
      saleLineId: null,
      card_isused: 0,
    }

  })
  logger.info("Product Id ===>: " + line.productKey)
  logger.info("Cards available len ===>: " + cards.length + " sale qty needed " + qty)
  if (!cards || cards.length < qty) {
    throw new Error('Stock not enought');
  }
  for (const iterator of cards) {
    try {

      const updatedCard = await iterator.update({
        locking_session_id: lockingSessionId,
        card_isused: true,
        productId: line.productKey,
      });
      logger.info("Reserved card " + updatedCard.id + " succesfully")
    } catch (error) {
      logger.error("Reserved card " + updatedCard.id + " false with error " + error)
      throw new Error("Card reservation error")
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
  logger.error(date)
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
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json({ success: true, data: saleHeader });
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.updateSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, discount, total, exchangeRate, isActive } = req.body;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await saleHeader.update({ bookingDate, remark, discount, total, exchangeRate, isActive });

    res.status(200).json({ success: true, data: saleHeader });
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
