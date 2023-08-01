
const QuotationHeader = require('../models').quotationHeader;
const Line = require('../models').quotationLine;
const Product = require('../models').product;
const Unit = require('../models').unit;
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
exports.createQuotationHeader = async (req, res) => {
  try {
    let { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId } = req.body;
    const quotationHeader = await QuotationHeader.create({ bookingDate, remark, discount, total, exchangeRate, isActive, clientId, paymentId, currencyId, userId });
    logger.info('Sale header ' + QuotationHeader.id)
    logger.info("===== Create Sale Header =====" + req.body)
    // **********************
    //  Line with headerId
    // **********************
    try {
      const linesWithHeaderId = await assignHeaderId(lines, quotationHeader.id, false)
      lineService.createBulkQuotationLine(res, linesWithHeaderId)
    } catch (error) {
      // ********************************************
      //  Reverse QuotationHeaderjust created
      // ********************************************
      logger.error("Something wrong need to reverse header " + error)
      await headerService.quotationHeaderReversal(QuotationHeader.id)
      res.status(500).send("Unfortunately " + error)
    }
  } catch (error) {
    res.status(500).send(error)
  }
};

exports.updateQuotationHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId } = req.body;
    const quotationHeader = await QuotationHeader.findByPk(id);

    if (!quotationHeader) {
      logger.error("Order Id " + id + ' is not found')
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }
    logger.info("Updating header")
    await assignHeaderId(lines, id, true)
    // ********** Clasify new or old saleLine ********** //
    const quotationLineForCreate = lines.filter(el => el['id'] == null)
    logger.warn(`SaleLine for create count is ${quotationLineForCreate.length}`)
    if (quotationLineForCreate.length > 0) await lineService.createBulkQuotationLineWithoutRes(quotationLineForCreate)
    await quotationHeader.update({ bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId });
    logger.info(`Update transaction completed ${quotationHeader}`)
    res.status(200).json(quotationHeader);
  } catch (error) {
    logger.error("Cannot update data " + error)
    res.status(500).send(`Cannot update data with ${error}`);
  }
};
const assignHeaderId = async (line, id, isUpdate) => {
  for (const iterator of line) {
    logger.warn(`Check if lineId is null or undifine ${iterator.id}`)
    iterator.headerId = id
    iterator.quotationHeaderId = id
    logger.warn("header id ===> " + iterator.headerId)
    try {
      if (iterator.id) await lineService.updateQuotationLine(iterator)

    } catch (error) {
      throw new Error(error)
    }
  }
  return line;
}



//  ******************************************************************
//  TempCard is the card reserved before create the transaction 
//  If any product is out of stock during reserve card
//  We will release all reserve card just created earlier 
//  ******************************************************************

exports.getQuotationHeaders = async (req, res) => {
  try {
    const quotationHeader = await QuotationHeader.findAll({ include: ['lines', 'user', 'client', 'payment', 'currency'], });

    res.status(200).json(quotationHeader);
  } catch (error) {
    res.status(500).send(error);
  }
};
exports.getQuotationHeadersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  try {
    const quotationHeader = await QuotationHeader.findAll({
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

    res.status(200).send(quotationHeader);
  } catch (error) {
    logger.error("===> Filter by date error: " + error)
    res.status(500).send(error);
  }
};

exports.getQuotationHeaderById = async (req, res) => {
  try {
    const { id } = req.params;
    const quotationHeader = await QuotationHeader.findByPk(id, {
      include: ['lines', 'user', 'client', 'payment', 'currency', {
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

    if (!quotationHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json(quotationHeader);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.updateQuotationHeaderPostToInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    // const { bookingDate, remark, discount, total, exchangeRate, isActive } = req.body;
    const isActive = true;
    const quotationHeader = await QuotationHeader.findByPk(id);

    if (!quotationHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await quotationHeader.update({ isActive });

    res.status(200).json(quotationHeader);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.deleteQuotationHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const quotationHeader = await QuotationHeader.findByPk(id);

    if (!quotationHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await quotationHeader.destroy();

    res.status(200).json({ success: true, message: 'Sale header deleted successfully' });
  } catch (error) {
    res.status(500).send(error);
  }
};
