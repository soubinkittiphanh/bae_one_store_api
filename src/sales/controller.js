
const SaleHeader = require('../models').saleHeader;
const SalePayment = require('../models').salePayment;
const Payment = require('../models').payment;
const SaleLine = require('../models').saleLine;
const Customer = require('../models').customer;
const Category = require('../models').category;
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
const { sequelize, location, company } = require('../models');
const spfService = require('../spf/service')
const cardService = require('../card/service')
const WashJob = require('../models').washjob;
// 1. 200 OK - The request has succeeded and the server has returned the requested data.

// 2. 201 Created - The request has been fulfilled and a new resource has been created.

// 3. 204 No Content - The server successfully processed the request, but there is no response body to return.

// 4. 400 Bad Request - The server cannot or will not process the request due to an error in the client's request.

// 5. 401 Unauthorized - The client must authenticate itself before it can access the requested resource.

// 6. 403 Forbidden - The server understands the request but refuses to authorize it.

// 7. 404 Not Found - The server cannot find the requested resource.

// 8. 500 Internal Server Error - The server encountered an unexpected condition that prevented it from fulfilling the request.

// 9. 502 Bad Gateway - The server received an invalid response from an upstream server while trying to fulfill the request.

const validateStockForLines = async (lines, locationId) => {
  logger.info(`Starting stock validation for ${lines.length} lines`);
  
  const stockValidationErrors = [];
  
  for (const line of lines) {
    // Check if this line requires stock validation
    if (line.validateStockOnSale === 1) {
      logger.info(`Validating stock for line with productId: ${line.productId}`);
      
      const requiredQty = line.unitRate * line.quantity;
      
      // Check available cards/stock for this product at this location
      const availableCards = await Card.findAll({
        where: {
          productId: line.productId,
          saleLineId: null,
          card_isused: 0,
          locationId: locationId,
          isActive: true
        },
        order: [['createdAt', 'DESC']]
      });
      
      logger.info(`Product ${line.productId} requires ${requiredQty} units, available: ${availableCards.length}`);
      
      if (availableCards.length < requiredQty) {
        stockValidationErrors.push({
          productId: line.productId,
          required: requiredQty,
          available: availableCards.length,
          shortage: requiredQty - availableCards.length
        });
      }
    } else {
      logger.info(`Skipping stock validation for line with productId: ${line.productId} (validateStockOnSale: ${line.validateStockOnSale})`);
    }
  }
  
  return stockValidationErrors;
};


const autoCreateStock = async (lines, locationId) => {
  const spfStockCheckParam = await spfService.getSPFByCode('STOCK.VAL');
  logger.warn(`PARAMETER CHECK SPF: ${JSON.stringify(spfStockCheckParam)}`);
  logger.warn(`LINE HERE: ${JSON.stringify(lines)}`);
  logger.warn(`LINE LEN: ${lines.length}`);

  if (spfStockCheckParam) {
    if (spfStockCheckParam.value == 'N') {
      for (const line of lines) {
        // Only auto-create stock for lines that require stock validation
        if (line.validateStockOnSale === 1) {
          logger.info(`LINE OBJECT DATA ${JSON.stringify(line)}`);
          const cardTemp = {
            inputter: 1,
            product_id: line.productId,
            totalCost: 0,
            stockCardQty: line.quantity,
            productId: line.productId,
            srcLocationId: locationId
          };
          const autoCardCreate = await cardService.createAutoHulkStockCard(cardTemp);
          logger.info(`CARD HAS BEEN CREATED :${autoCardCreate.length} || ${JSON.stringify(autoCardCreate)}`);
        }
      }
    }
  }
};

// Add this function to your controller.js file
// Add this function to your controller.js file

exports.createSaleHeaderOnly = async (req, res) => {
  try {
    let { 
      bookingDate, 
      remark, 
      discount, 
      total, 
      exchangeRate, 
      isActive, 
      clientId, 
      paymentId, 
      currencyId, 
      userId, 
      referenceNo, 
      locationId,
      lines // Added lines parameter for stock validation
    } = req.body;

    logger.info("===== Create Sale Header Only (Multi-Payment) =====" + JSON.stringify(req.body));

    // Validate stock for lines if lines are provided
    if (lines && lines.length > 0) {
      logger.info("Validating stock for provided lines before creating sale header");
      
      // Check if auto stock creation is needed
      // await autoCreateStock(lines, locationId);
      
      // Validate stock for lines that require validation
      const stockValidationErrors = await validateStockForLines(lines, locationId);
      
      if (stockValidationErrors.length > 0) {
        logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for some items',
          stockErrors: stockValidationErrors,
          details: stockValidationErrors.map(err => 
            `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
          )
        });
      }
      
      logger.info("Stock validation passed for all lines requiring validation");
    }

    // Set default remark for multi-payment transactions
    if (!remark) {
      remark = 'Multi-payment transaction - pending payment completion';
    }

    // For multi-payment, we need to either:
    // 1. Use a valid default payment ID, or 
    // 2. Set paymentId to null (if your DB allows it)
    
    // Option 1: Find the first available payment method as temporary
    let tempPaymentId = paymentId;
    if (!tempPaymentId) {
      const firstPayment = await sequelize.models.payment.findOne({
        where: { isActive: true },
        order: [['id', 'ASC']]
      });
      
      if (firstPayment) {
        tempPaymentId = firstPayment.id;
        logger.info(`Using temporary payment ID: ${tempPaymentId}`);
      } else {
        return res.status(400).json({
          success: false,
          message: 'No valid payment methods found in system',
          error: 'Payment setup required'
        });
      }
    }

    // Validate that the payment ID exists
    const paymentExists = await sequelize.models.payment.findByPk(tempPaymentId);
    if (!paymentExists) {
      return res.status(400).json({
        success: false,
        message: `Payment method with ID ${tempPaymentId} not found`,
        error: 'Invalid payment ID'
      });
    }

    // Create sale header with valid payment ID
    const saleHeader = await SaleHeader.create({ 
      bookingDate, 
      remark, 
      discount, 
      total, 
      exchangeRate, 
      isActive, 
      clientId, 
      paymentId: null, // Set to null as discussed
      currencyId, 
      userId, 
      referenceNo, 
      locationId 
    });

    logger.info(`Sale header created successfully with ID: ${saleHeader.id}`);

    // Return the created sale header with ID
    res.status(201).json({
      success: true,
      saleHeaderId: saleHeader.id,
      message: 'Sale header created successfully - ready for payment processing',
      data: saleHeader,
      stockValidationPassed: lines ? true : 'No lines provided for validation'
    });

  } catch (error) {
    logger.error(`Error creating sale header only: ${error}`);
    res.status(500).json({
      success: false,
      message: `Failed to create sale header: ${error.message}`,
      error: error.message
    });
  }
};
exports.createSaleLineOnly = async (req, res) => {
  try {
    let { 
      id,
      lines,
      locationId,
      validateStock = true // Optional flag to control stock validation
    } = req.body;

    logger.info("===== Create Sale Line Only =====" + JSON.stringify(req.body));

    // Validate required parameters
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Sale Header ID is required',
        error: 'Missing saleHeaderId parameter'
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lines array is required and cannot be empty',
        error: 'Invalid or missing lines parameter'
      });
    }

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'Location ID is required',
        error: 'Missing locationId parameter'
      });
    }

    // Verify that the sale header exists
    const saleHeaderExists = await SaleHeader.findByPk(id);
    if (!saleHeaderExists) {
      return res.status(404).json({
        success: false,
        message: `Sale Header with ID ${id} not found`,
        error: 'Invalid sale header ID'
      });
    }

    logger.warn(`====>  lines for header ${id}: ${JSON.stringify(lines)}`);

    // Validate stock if required
    if (validateStock) {
      const stockValidationErrors = await validateStockForLines(lines, locationId);
      if (stockValidationErrors.length > 0) {
        logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for some items',
          stockErrors: stockValidationErrors,
          details: stockValidationErrors.map(err => 
            `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
          )
        });
      }

      // Auto create stock if needed
      // const checking = await autoCreateStock(lines, locationId);
      logger.info("Stock validation passed and auto-stock creation completed");
    }

    // Use transaction for consistency
    const result = await sequelize.transaction(async (t) => {
      const lockingSessionId = common.generateLockingSessionId();
      const errorList = [];
      let linesCreated = false;

      try {
        // Assign header ID to lines
        const linesWithHeaderId = await assignHeaderId(lines, id, lockingSessionId, false, locationId);
        
        // Create bulk sale lines - DON'T pass res to avoid double response
        await lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId);
        linesCreated = true;
        
        logger.info(`Sale lines created successfully for header ID: ${id}`);
        
      } catch (error) {
        logger.error("Error creating sale lines: " + error);
        errorList.push(error);
        throw error; // Re-throw to trigger transaction rollback
      }

      return { 
        id, 
        linesCreated, 
        linesCount: lines.length,
        lockingSessionId 
      };
    });

    logger.info(`Sale lines creation transaction complete for header ${id}`);
    logger.info(`Saleline only create result ${JSON.stringify(result)}`)
    // Return success response
    // res.status(201).json({
    //   success: true,
    //   message: 'Sale lines created successfully',
    //   data: {
    //     saleHeaderId: result.id, // Fixed: was result.saleHeaderId
    //     linesCreated: result.linesCreated,
    //     linesCount: result.linesCount,
    //     lockingSessionId: result.lockingSessionId,
    //     stockValidationPerformed: validateStock
    //   }
    // });

  } catch (error) {
    logger.error(`Error creating sale lines only: ${error}`);
    
    // Check if response was already sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: `Failed to create sale lines: ${error.message}`,
        error: error.message
      });
    }
  }
};
// Optional: Add a function to complete the sale after payments are processed
exports.completeSaleWithLines = async (req, res) => {
  try {
    const { saleHeaderId } = req.params;
    const { lines, locationId } = req.body;

    logger.info(`Completing sale ${saleHeaderId} with lines: ${JSON.stringify(lines)}`);

    // Find the existing sale header
    const saleHeader = await SaleHeader.findByPk(saleHeaderId);
    
    if (!saleHeader) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sale header not found' 
      });
    }

    // Validate stock for lines that require validation
    const stockValidationErrors = await validateStockForLines(lines, locationId);
    
    if (stockValidationErrors.length > 0) {
      logger.error(`Stock validation failed during sale completion: ${JSON.stringify(stockValidationErrors)}`);
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for some items during completion',
        stockErrors: stockValidationErrors,
        details: stockValidationErrors.map(err => 
          `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
        )
      });
    }

    // Check if stock check is required before sale process
    const checking = await autoCreateStock(lines, locationId);

    const result = await sequelize.transaction(async (t) => {
      // Process the lines for this sale header
      const lockingSessionId = common.generateLockingSessionId();
      const errorList = [];

      try {
        const linesWithHeaderId = await assignHeaderId(lines, saleHeaderId, lockingSessionId, false, locationId);
        await lineService.createBulkSaleLineWithoutRes(linesWithHeaderId, lockingSessionId);
        
        // Update sale header to mark as completed
        await saleHeader.update({ 
          remark: 'Multi-payment transaction completed',
          isActive: true 
        }, { transaction: t });

      } catch (error) {
        logger.error("Something wrong need to reverse header " + error);
        errorList.push(error);
        throw new Error(error);
      }

      return { saleHeader, errorList };
    });

    // Update product stock counts
    await updateProductStockCount(lines);

    logger.info(`Sale completion transaction successful for ${saleHeaderId}`);
    
    res.status(200).json({
      success: true,
      message: 'Sale completed successfully with payment processing',
      saleHeaderId: saleHeaderId,
      data: result.saleHeader
    });

  } catch (error) {
    logger.error(`Error completing sale: ${error}`);
    
    // If there was an error, mark the sale header for review
    try {
      await SaleHeader.update(
        { remark: `Multi-payment transaction failed: ${error.message}` },
        { where: { id: req.params.saleHeaderId } }
      );
    } catch (updateError) {
      logger.error(`Failed to update error status: ${updateError}`);
    }

    res.status(500).json({
      success: false,
      message: `Failed to complete sale: ${error.message}`,
      error: error.message
    });
  }
};


exports.createSaleHeader = async (req, res) => {
  try {
    let { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId, referenceNo, locationId, customerForm } = req.body;
    logger.info("===== Create Sale Header =====" + req.body);
    
    //------------ Check if stock check is require before sale process
    logger.warn(`====>  lines     ${JSON.stringify(lines)}`);
    
    // Validate stock using the new approach
    const stockValidationErrors = await validateStockForLines(lines, locationId);
    
    if (stockValidationErrors.length > 0) {
      logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for some items',
        stockErrors: stockValidationErrors,
        details: stockValidationErrors.map(err => 
          `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
        )
      });
    }
    
    const checking = await autoCreateStock(lines, locationId);
    
    const result = await sequelize.transaction(async (t) => {
      logger.warn(`SALE HEADER: ${JSON.stringify(req.body)}`);
      const saleHeader = await SaleHeader.create({ bookingDate, remark, discount, total, exchangeRate, isActive, clientId, paymentId, currencyId, userId, referenceNo, locationId }, { transaction: t });
      let customer = null;

      if (customerForm) {
        logger.info(`********** Customer form ${customerForm}***********`);
        logger.info(`********** Customer form ${customerForm.name}***********`);
        delete customerForm.discount;
        customerForm.saleHeaderId = saleHeader.id;
        customer = await Customer.create(customerForm, { transaction: t });
      }
      
      logger.info(`*************Sale header ${saleHeader.id} *************`);
      // **********************
      //  Line with headerId
      // **********************
      const lockingSessionId = common.generateLockingSessionId();
      const errorList = [];
      
      try {
        const linesWithHeaderId = await assignHeaderId(lines, saleHeader.id, lockingSessionId, false, locationId);
        lineService.createBulkSaleLine(res, linesWithHeaderId, lockingSessionId);
      } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created
        // ********************************************
        logger.error("Something wrong need to reverse header " + error);
        res.status(500).send("Unfortunately " + error);
        errorList.push(error);
      }
      
      const reversalRequire = errorList.length > 0 ? true : false;
      return { customer, saleHeader, reversalRequire };
    });
    
    if (result.reversalRequire) {
      await headerService.saleHeaderReversal(result.saleHeader.id);
      return logger.warn(`Transaction reversed`);
    }
    
    logger.info(`Transaction complete ${result}`);
  } catch (error) {
    logger.error(`Error occurs ${error}`);
    res.status(500).send(error);
  }
};

exports.updateSaleHeaderV2 = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, discount, total, exchangeRate, isActive, lines, clientId, paymentId, currencyId, userId, locationId } = req.body;
    
    const saleHeader = await SaleHeader.findByPk(id);
    if (!saleHeader) {
      logger.error("Order Id " + id + ' is not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Sale header not found' 
      });
    }

    logger.info("===== Update Sale Header ===== ID: " + id);
    logger.warn(`====>  lines     ${JSON.stringify(lines)}`);

    // Validate stock using the same approach as create function
    const stockValidationErrors = await validateStockForLines(lines, locationId);
    if (stockValidationErrors.length > 0) {
      logger.error(`Stock validation failed: ${JSON.stringify(stockValidationErrors)}`);
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for some items',
        stockErrors: stockValidationErrors,
        details: stockValidationErrors.map(err => 
          `Product ${err.productId}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
        )
      });
    }

    const checking = await autoCreateStock(lines, locationId);
    
    const result = await sequelize.transaction(async (t) => {
      logger.info("Updating header");
      const lockingSessionId = common.generateLockingSessionId();
      await assignHeaderId(lines, id, lockingSessionId, true, locationId);
      
      // ********** Classify new or old saleLine ********** //
      const saleLineForCreate = lines.filter(el => el['id'] == null);
      logger.warn(`SaleLine for create count is ${saleLineForCreate.length}`);
      
      if (saleLineForCreate.length > 0) {
        await lineService.createBulkSaleLineWithoutRes(saleLineForCreate, lockingSessionId);
      }
      
      const updatedSaleHeader = await saleHeader.update({ 
        bookingDate, 
        remark, 
        discount, 
        total, 
        exchangeRate, 
        isActive, 
        lines, 
        clientId, 
        paymentId, 
        currencyId, 
        userId 
      }, { transaction: t });
      
      logger.info(`Update transaction completed ${updatedSaleHeader}`);
      
      // ************* UPDATE PRODUCT STOCK COUNT *************//
      updateProductStockCount(lines);
      
      return { saleHeader: updatedSaleHeader };
    });

    // Send success response in the same format as create function
    logger.info(`Transaction complete ${result}`);
    
    // Format response similar to create function success message
    const successMessage = `Successfully updated sale header - ${result.saleHeader.id}`;
    res.status(200).send(`${successMessage} - ${result.saleHeader.id}`);
    
  } catch (error) {
    logger.error("Cannot update data " + error);
    
    // Handle different error types similar to create function
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.errors.map(err => err.message)
      });
    }
    
    // Send error response in consistent format
    res.status(500).json({
      success: false,
      message: `Cannot update data: ${error.message || error}`,
      error: error.message || error
    });
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
    logger.info(`Sale header ${JSON.stringify(saleHeader)}`)
    // Reverse external transaction 
    if (saleHeader.washJobId) {
      logger.info(`Reversing the washJob ${saleHeader.washJobId}`)
      const washJob = await WashJob.findByPk(saleHeader.washJobId)
      await washJob.update({
        status: 'CANCELLED',
      });
      logger.info(`Currency wash job version ${JSON.stringify(washJob)}`)
    }
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
    logger.warn(`Check if lineId is null or undefined ${iterator.id}`);
    iterator.headerId = id;
    iterator.saleHeaderId = id;
    logger.warn("header id ===> " + iterator.headerId);
    
    try {
      // ********** If it header is fresh record then we directly reserve new card ************ //
      // ********** If not we will have condition ************ //
      if (!isUpdate || !iterator.id) {
        // ********** Sale Create Handler ************ //
        const qty = iterator.unitRate * iterator.quantity;
        
        // Only reserve cards for lines that require stock validation
        if (iterator.validateStockOnSale === 1) {
          await reserveCard(iterator, lockingSessionId, qty, locationId);
        }
      } else {
        // ********** Sale Update Handler ************ //
        // ********** The logic part of update existing card ************ //
        if (iterator.validateStockOnSale === 1) {
          const previousCards = await Card.findAll({
            order: [['createdAt', 'DESC']],
            where: {
              saleLineId: iterator.id
            }
          });
          
          const currentRequiredQty = iterator.unitRate * iterator.quantity;
          const qty = currentRequiredQty - previousCards.length;
          
          // ********** Check if product has changed ********** //
          if (previousCards[0]['productId'] == iterator['productId']) {
            // ********** Same product handler ************ //
            logger.info(`*************Previous card productId is the same with current ProductId************`);
            if (currentRequiredQty > previousCards.length) {
              //************ More product card qty need handler *************/
              await reserveCard(iterator, lockingSessionId, qty, locationId);
              logger.info(`********* Immediately update saleLine after reserved cards *********`);
            } else if (currentRequiredQty == previousCards.length) {
              //************ No need to do anything *************/
            } else {
              //************ Product card reduce handler *************/
              //************ and we have to remove some previous card *************/
              try {
                const preCardCount = previousCards.length;
                const numberOfLastCardForPuttingBackToInventory = currentRequiredQty - preCardCount;
                const cardsForReversBack = previousCards.slice(numberOfLastCardForPuttingBackToInventory);
                logger.warn(`Card previous count #${preCardCount} and card now count #${currentRequiredQty}`);
                logger.warn(`cardsForReversBack count #${cardsForReversBack.length}`);

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
                });
              } catch (error) {
                logger.error(`Reverse over cards fail ${error}`);
                throw new Error(`Reverse over cards fail ${error}`);
              }
            }
          } else {
            // ********** Different product handler ***********// 
            logger.warn(`*************Previous card productId is not the same with current ProductId************`);
            await reserveCard(iterator, lockingSessionId, currentRequiredQty, locationId);

            // ********** Reverse all previous cards from this sale line ***********// 
            logger.info(`************* Send previous use cards back to inventory *************`);
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
            });

            //**************** Update previous card make it back available in inventory ****************/
            logger.info(`//**************** Update previous card make it back available in inventory ****************/`);
            productService.updateProductCountById(previousCards[0]['productId']);
          }
          
          logger.warn(`This saleLineId ${iterator.id} has previous card count ${previousCards.length}`);

          // ************** Update saleLine entry ************** //
          logger.info(`// ************** Update saleLine entry ************** //`);
          await lineService.updateSaleLine(iterator);
        }
      }
    } catch (error) {
      logger.error(`Stock is not enough for productId ${iterator.productId}`);
      if (!isUpdate) await headerService.cardReversalByLockingSessionId(lockingSessionId);
      throw new Error(error);
    }
  }
  return line;
};


const updateProductStockCount = async (lines) => {
  // ************* TAKE THE PRODUCT ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
  const productIdList = lines.map((item) => {
    return item.productId;
  });
  await productService.updateProductCountGroup(productIdList);
  // ************* TAKE THE PRODUCT ID FOR UPDATE STOCK COUNT IN PRODUCT TABLE *************//
};

const reserveCard = async (line, lockingSessionId, qty, locationId) => {
  //  *********************************
  //  Assign Card for cost calculation
  //  *********************************
  const cards = await Card.findAll({
    limit: qty, // limit to n records
    order: [['createdAt', 'DESC']], // order by createdAt column in descending order
    where: {
      productId: line.productId,
      saleLineId: null,
      card_isused: 0,
      locationId
    }
  });
  
  logger.info("Product Id ===>: " + line.productId + " location id: " + locationId);
  logger.info("Cards available len ===>: " + cards.length + " sale qty needed " + qty);
  
  if (!cards || cards.length < qty) {
    throw new Error(`Stock not enough #${line.productId}`);
  }
  
  let entryOption = {
    locking_session_id: lockingSessionId,
    card_isused: true,
  };

  if (line.id) {
    // ************ Line already has id (Old line) ************
    entryOption.saleLineId = line.id;
  }

  const cardreserved = await Card.update(entryOption, {
    where: {
      id: {
        [Op.in]: cards.map(el => el.id)
      }
    }
  });
  
  logger.info(`$$$$$$ Reserve cards completed ${cardreserved} records $$$$$`);
};


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
        },
        {
          model: SalePayment,
          as: 'payments',
          include:[
            {
              model: Payment,
              as:'paymentMethod'
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
      include: ['user', 'client', 'payment', 'currency', Customer,
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
              as: "header",
            },
            {
              model: Card,
              as: "cards",
            },

          ]
        },
        {
          model: Customer,
          include: ['geography', 'shipping']
        },

        {
          model: location,
          as: "location",
          include: [
            {
              model: company,
              as: "company"
            },]
        },


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
              model: Card,
              as: "cards"
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
          as: "product",
          include: [{
            model: Category,
            as: "category",
          }]
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
            'locationId': date.locationId,

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
  // TODO: This query impact performance please review and optimize
  // Calculate the sum of total - discount for products between two dates
  const date = JSON.parse(req.query.date);
  logger.warn("Date " + date.startDate + " " + date.endDate)
  //   const startDate = new Date('2023-07-01');
  // const endDate = new Date('2023-12-31');
  const { startDate, endDate } = date // new Date('2022-01-01');
  try {
    const saleHeader = await SaleHeader.findAll({
      include: [Customer, 'payment', 'lines', {
        model: SaleLine,
        as: "lines",
        include: ['cards']
      },],
      attributes: ['id', 'discount', 'total', 'bookingDate'],
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
