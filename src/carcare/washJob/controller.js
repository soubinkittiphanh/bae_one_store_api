// const WashJob = require('../models').washJob;
// const { body, validationResult } = require('express-validator');
// const logger = require('../../api/logger');
// const WashJob = require('../../models').washjob;
// const WashJobHistory = require('../../models').washjobHis;
// const WashJobLine = require('../../models').washjobline;
// const Product = require('../../models').product;
// const SaleHeader = require('../../models').saleHeader;
// const SaleLine = require('../../models').saleLine;
// const Currency = require('../../models').currency;
// const Location = require('../../models').location;
// const Payment = require('../../models').payment;
// const Unit = require('../../models').unit;
// const { sequelize, priceList } = require('../../models');
// const { Op } = require('sequelize');
// const PriceList = require('../../models').priceList;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const WashJob = require('../../models').washjob;
const WashJobHistory = require('../../models').washjobHis;
const WashJobLine = require('../../models').washjobline;
const Product = require('../../models').product;
const SaleHeader = require('../../models').saleHeader;
const SaleLine = require('../../models').saleLine;
const Currency = require('../../models').currency;
const Location = require('../../models').location;
const Payment = require('../../models').payment;
const Unit = require('../../models').unit;
const Card = require('../../models').card;
const { sequelize, priceList } = require('../../models');
const { Op } = require('sequelize');
const PriceList = require('../../models').priceList;
const spfService = require('../../spf/service');
const cardService = require('../../card/service');
const productService = require('../../product/service');
const common = require('../../common');



const validateStockForWashJobLines = async (lines, locationId) => {
  logger.info(`Starting stock validation for WashJob with ${lines.length} lines`);
  
  const stockValidationErrors = [];
  
  for (const line of lines) {
    const product = await Product.findByPk(line.productId);
    
    if (!product) {
      stockValidationErrors.push({
        productId: line.productId,
        error: `Product with ID ${line.productId} not found`
      });
      continue;
    }
    
    if (product.validateStockOnSale) {
      logger.info(`Validating stock for WashJob line with productId: ${line.productId}`);
      
      const requiredQty = line.quantity || 1;
      
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
          shortage: requiredQty - availableCards.length,
          productName: product.name || `Product ${line.productId}`
        });
      }
    } else {
      logger.info(`Skipping stock validation for WashJob line with productId: ${line.productId} (validateStockOnSale: ${product.validateStockOnSale})`);
    }
  }
  
  return stockValidationErrors;
};

const autoCreateStockForWashJob = async (lines, locationId) => {
  const spfStockCheckParam = await spfService.getSPFByCode('STOCK.VAL');
  logger.warn(`PARAMETER CHECK SPF: ${JSON.stringify(spfStockCheckParam)}`);

  if (spfStockCheckParam && spfStockCheckParam.value == 'N') {
    for (const line of lines) {
      const product = await Product.findByPk(line.productId);
      
      if (product && product.validateStockOnSale) {
        logger.info(`WASHJOB AUTO-CREATE STOCK FOR LINE: ${JSON.stringify(line)}`);
        const cardTemp = {
          inputter: 1,
          product_id: line.productId,
          totalCost: 0,
          stockCardQty: line.quantity || 1,
          productId: line.productId,
          srcLocationId: locationId
        };
        const autoCardCreate = await cardService.createAutoHulkStockCard(cardTemp);
        logger.info(`CARD CREATED FOR WASHJOB: ${autoCardCreate.length}`);
      }
    }
  }
};

// ============================================================================
// FIXED CARD RESERVATION WITH PROPER LOCKING
// ============================================================================

const reserveCardsForWashJobLines = async (washJobLines, locationId, transaction) => {
  logger.info(`========== BATCH CARD RESERVATION START ==========`);
  logger.info(`Reserving cards for ${washJobLines.length} WashJob lines`);
  
  const lockingSessionId = common.generateLockingSessionId();
  const reservationResults = [];
  
  // Process each line sequentially to avoid race conditions
  for (const lineData of washJobLines) {
    const { line, saleLineId } = lineData;
    
    logger.info(`Processing line - ProductId: ${line.productId}, Quantity: ${line.quantity}, SaleLineId: ${saleLineId}`);
    
    // Get product details
    const product = await Product.findByPk(line.productId, { transaction });
    
    if (!product || !product.validateStockOnSale) {
      logger.info(`Skipping card reservation for productId ${line.productId} - no stock validation required`);
      reservationResults.push({
        saleLineId,
        productId: line.productId,
        reserved: false,
        reason: 'No stock validation required'
      });
      continue;
    }
    
    const requiredQty = line.quantity || 1;
    
    try {
      // STEP 1: Lock and reserve cards in a single atomic operation
      logger.info(`Attempting to reserve ${requiredQty} cards for product ${line.productId}`);
      
      // First, mark cards with locking session ID (without saleLineId yet)
      const [updatedCount] = await Card.update(
        {
          locking_session_id: lockingSessionId,
          card_isused: 1
        },
        {
          where: {
            productId: line.productId,
            saleLineId: null,
            card_isused: 0,
            locationId: locationId,
            isActive: true
          },
          limit: requiredQty,
          transaction: transaction
        }
      );
      
      logger.info(`Locked ${updatedCount} cards with session ${lockingSessionId}`);
      
      if (updatedCount < requiredQty) {
        // Rollback the locking for this product
        await Card.update(
          {
            locking_session_id: null,
            card_isused: 0
          },
          {
            where: {
              locking_session_id: lockingSessionId,
              productId: line.productId
            },
            transaction: transaction
          }
        );
        
        throw new Error(`Insufficient stock: only ${updatedCount} available, ${requiredQty} required for product ${line.productId}`);
      }
      
      // STEP 2: Now assign the locked cards to the specific sale line
      const [assignedCount] = await Card.update(
        {
          saleLineId: saleLineId
        },
        {
          where: {
            locking_session_id: lockingSessionId,
            productId: line.productId,
            card_isused: 1
          },
          transaction: transaction
        }
      );
      
      logger.info(`Assigned ${assignedCount} cards to SaleLineId: ${saleLineId}`);
      
      reservationResults.push({
        saleLineId,
        productId: line.productId,
        reserved: true,
        cardsReserved: assignedCount,
        lockingSessionId
      });
      
    } catch (error) {
      logger.error(`Failed to reserve cards for ProductId ${line.productId}, SaleLineId ${saleLineId}: ${error.message}`);
      
      // Clean up any partial reservations for this line
      await Card.update(
        {
          locking_session_id: null,
          card_isused: 0,
          saleLineId: null
        },
        {
          where: {
            locking_session_id: lockingSessionId,
            productId: line.productId
          },
          transaction: transaction
        }
      );
      
      throw error; // Re-throw to trigger transaction rollback
    }
  }
  
  logger.info(`========== BATCH CARD RESERVATION COMPLETE ==========`);
  return reservationResults;
};

const updateProductStockCountForWashJob = async (lines) => {
  const productIdList = lines.map((item) => item.productId);
  await productService.updateProductCountGroup(productIdList);
};


// Create a new wash job with products and services
exports.createWashJob = async (req, res) => {
  logger.info(`Request creating washJob body ${JSON.stringify(req.body)}`);
  try {
    const {
      status,
      notes,
      totalAmount,
      startedAt,
      completedAt,
      manualDiscountAmount,
      manualExtraChargeAmount,
      lines // <-- use this key from frontend
    } = req.body;

    const washJob = await WashJob.create(
      {
        status,
        notes,
        totalAmount,
        startedAt,
        completedAt,
        manualDiscountAmount,
        manualExtraChargeAmount,
        lines // <-- use the same alias as defined in association
      },
      {
        include: [{ model: WashJobLine, as: 'lines' }]
      }
    );

    res.status(201).json({ message: 'WashJob created successfully', data: washJob });
  } catch (err) {
    logger.error(`Error occurred create washJob ${err}`);
    res.status(400).json({ error: err.message });
  }
};


// Get all wash jobs with associated products and services
exports.getAllWashJobs = async (req, res) => {
  try {
    const washJobs = await WashJob.findAll({
      include: [
        {
          model: WashJobLine,
          as: 'lines',
          include: [
            {
              model: Product,
              as: 'product',
              include: [
                {
                  model: PriceList,
                  as: 'priceLists'
                },
                {
                  model: Currency,
                  as: 'saleCurrency'
                }
              ]
            },
            {
              model: PriceList,
              as: 'priceList'
            }
          ]
        },
        {
          model: SaleHeader,
          as: 'saleHeader',
          attributes: ['id', 'total'],
          include: [
            {
              model: Payment,
              as: 'payment',
              attributes: ['id', 'payment_code','payment_name'],
            }
          ]
        }
      ]
    });

    logger.info(`Fetched WashJob data ${washJobs}`);
    res.status(200).json(washJobs);
  } catch (err) {
    logger.error(`Fail to fetch washJob: ${err}`);
    res.status(500).json({ error: err.message });
  }
};

exports.getRecentWashJobs = async (req, res) => {
  try {
    // Get current date and yesterday's date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1); // Start of yesterday
    
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999); // End of today
    logger.info(`RECENTLY DATE ${today} YESTERDAY ${yesterday} end of day ${endOfToday}`)
    const washJobs = await WashJob.findAll({
      where: {
        createdAt: {
          [Op.gte]: yesterday, // Greater than or equal to start of yesterday
          [Op.lte]: endOfToday  // Less than or equal to end of today
        }
      },
      include: [
        {
          model: WashJobLine,
          as: 'lines',
          include: [
            {
              model: Product,
              as: 'product',
              include: [
                {
                  model: PriceList,
                  as: 'priceLists'
                },
                {
                  model: Currency,
                  as: 'saleCurrency'
                }
              ]
            },
            {
              model: PriceList,
              as: 'priceList'
            }
          ]
        },
        {
          model: SaleHeader,
          as: 'saleHeader',
          attributes: ['id', 'total'],
          include: [
            {
              model: Payment,
              as: 'payment',
              attributes: ['id', 'payment_code', 'payment_name']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']] // Order by most recent first
    });

    logger.info(`Fetched ${washJobs.length} recent WashJob records (today & yesterday)`);
    res.status(200).json(washJobs);
  } catch (err) {
    logger.error(`Failed to fetch recent washJobs: ${err}`);
    res.status(500).json({ error: err.message });
  }
};

exports.getAllWashJobsByDate = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    // Build date filter condition
    const whereCondition = {};
    if (fromDate && toDate) {
      whereCondition.startedAt = {
        [Op.between]: [new Date(fromDate), new Date(toDate)]
      };
    } else if (fromDate) {
      whereCondition.startedAt = {
        [Op.gte]: new Date(fromDate)
      };
    } else if (toDate) {
      whereCondition.startedAt = {
        [Op.lte]: new Date(toDate)
      };
    }

    const washJobs = await WashJob.findAll({
      where: whereCondition,
      include: [
         {
          model: WashJobLine,
          as: 'lines',
          include: [
            {
              model: Product,
              as: 'product',
              include: [
                {
                  model: PriceList,
                  as: 'priceLists'
                },
                {
                  model: Currency,
                  as: 'saleCurrency'
                }
              ]
            },
            {
              model: PriceList,
              as: 'priceList'
            }
          ]
        },
        {
          model: SaleHeader,
          as: 'saleHeader',
          attributes: ['id', 'total'],
          include: [
            {
              model: Payment,
              as: 'payment',
              attributes: ['id', 'payment_code','payment_name'],
            }
          ]
        }
      ],
      order: [['startedAt', 'DESC']]
    });

    logger.info(`Fetched WashJob data count: ${washJobs.length}`);
    res.status(200).json(washJobs);
  } catch (err) {
    logger.error(`Fail to fetch washJob: ${err}`);
    res.status(500).json({ error: err.message });
  }
};


// Get a wash job by ID with associated products and services
exports.getWashJobById = async (req, res) => {
  try {
    const washJob = await WashJob.findByPk(req.params.id, {
      include: [
        { model: Product, as: 'products' },
        { model: Service, as: 'services' },
      ],
    });

    if (!washJob) return res.status(404).json({ message: 'WashJob not found' });

    res.status(200).json(washJob);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update wash job by ID
exports.updateWashJob = async (req, res) => {
  try {
    const {
      status,
      notes,
      totalAmount,
      startedAt,
      completedAt,
      manualDiscountAmount,
      manualExtraChargeAmount,
      lines,
    } = req.body;

    logger.info(`Job ${JSON.stringify(req.body)}`);
    logger.info(`Line ${JSON.stringify(lines)}`);

    const existingWashJob = await WashJob.findByPk(req.params.id, {
      include: [{ model: WashJobLine, as: 'lines' }],
    });

    if (!existingWashJob) {
      return res.status(404).json({ message: 'WashJob not found' });
    }

    // Save current version to history
    await WashJobHistory.create({
      washJobId: existingWashJob.id,
      version: existingWashJob.version,
      data: existingWashJob.toJSON(),
      modifiedBy: req.user?.username ?? 'system',
    });

    // Update the WashJob fields
    await existingWashJob.update({
      status,
      notes,
      totalAmount,
      startedAt,
      completedAt,
      manualDiscountAmount,
      manualExtraChargeAmount,
      version: existingWashJob.version + 1,
    });

    // Remove existing lines
    await WashJobLine.destroy({ where: { washJobId: req.params.id } });

    // Re-create lines from request
    if (Array.isArray(lines)) {
      for (let line of lines) {
        await WashJobLine.create({
          washJobId: req.params.id,
          description: line.description,
          unit: line.unit,
          price: line.price,
          quantity: line.quantity,
          total: line.total,
          status: line.status || 'ACTIVE',
          productId: line.productId ?? null,
          serviceId: line.serviceId ?? null,
          priceListId: line.priceListId ?? null,
        });
      }
    }

    // Return updated wash job with lines
    const updated = await WashJob.findByPk(req.params.id, {
      include: [{ model: WashJobLine, as: 'lines' }],
    });

    res.status(200).json({
      message: 'WashJob updated successfully',
      data: updated,
    });
  } catch (err) {
    logger.error(`Update failed: ${err}`);
    res.status(500).json({ error: err.message });
  }
};


// Delete wash job by ID
exports.deleteWashJob = async (req, res) => {
  try {
    const deleted = await WashJob.destroy({ where: { id: req.params.id } });

    if (!deleted) return res.status(404).json({ message: 'WashJob not found' });

    res.status(200).json({ message: 'WashJob deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ============================================================================
// UPDATED WASHJOB CONTROLLER WITH STOCK VALIDATION
// ============================================================================



exports.createSaleFromWashJob = async (req, res) => {
  const { paymentId, userId, validateStock = true } = req.body;
  const washJobId = req.params.id;
  
  // Get default values
  const dfCurrency = await Currency.findOne({ where: { isLocalCCY: true } });
  const dfLocation = await Location.findOne({ where: { isActive: true } });
  const dfPayment = await Payment.findOne({ where: { isActive: true } });
  const dfUnit = await Unit.findOne({ where: { isActive: true } });
  
  logger.info(`DF Currency ${JSON.stringify(dfCurrency)}`);
  logger.info(`DF dfLocation ${JSON.stringify(dfLocation)}`);
  logger.info(`DF dfPayment ${JSON.stringify(dfPayment)}`);
  
  // Fetch WashJob with lines
  const washJob = await WashJob.findByPk(washJobId, {
    include: [{ model: WashJobLine, as: 'lines' }],
  });
  
  if (!washJob) {
    return res.status(404).json({ message: "Wash job not found" });
  }
  
  // VALIDATION: Check if already posted
  if (washJob.saleHeaderId) {
    logger.warn(`WashJob ${washJobId} already has saleHeaderId: ${washJob.saleHeaderId}`);
    return res.status(400).json({ 
      message: "This wash job has already been posted to sales",
      saleHeaderId: washJob.saleHeaderId,
      status: washJob.status
    });
  }
  
  // VALIDATION: Check if status is already SETTLED
  if (washJob.status === 'SETTLED') {
    logger.warn(`WashJob ${washJobId} is already in SETTLED status`);
    return res.status(400).json({ 
      message: "This wash job has already been settled",
      status: washJob.status
    });
  }

  // ============================================================================
  // STOCK VALIDATION LOGIC
  // ============================================================================
  
  if (validateStock && washJob.lines && washJob.lines.length > 0) {
    logger.info("===== Starting Stock Validation for WashJob =====");
    logger.info(`Validating stock for ${washJob.lines.length} wash job lines before creating sale`);
    
    const locationId = washJob.locationId || dfLocation.id;
    
    try {
      // Check if auto stock creation is needed first
      await autoCreateStockForWashJob(washJob.lines, locationId);
      
      // Validate stock for lines that require validation
      const stockValidationErrors = await validateStockForWashJobLines(washJob.lines, locationId);
      
      if (stockValidationErrors.length > 0) {
        logger.error(`Stock validation failed for WashJob ${washJobId}: ${JSON.stringify(stockValidationErrors)}`);
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for some items in wash job',
          washJobId: washJobId,
          stockErrors: stockValidationErrors,
          details: stockValidationErrors.map(err => 
            err.error || `${err.productName || `Product ${err.productId}`}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
          )
        });
      }
      
      logger.info("Stock validation passed for all wash job lines requiring validation");
    } catch (error) {
      logger.error(`Error during stock validation for WashJob ${washJobId}: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Error during stock validation',
        error: error.message,
        washJobId: washJobId
      });
    }
  } else {
    logger.info("Stock validation skipped for WashJob (validateStock=false or no lines)");
  }

  // ============================================================================
  // SALE CREATION WITH FIXED CARD RESERVATION
  // ============================================================================
  
  const t = await sequelize.transaction();
  try {
    logger.info(`========== STARTING WASHJOB SALE CREATION ==========`);
    
    // 1. Create SaleHeader
    const saleHeader = await SaleHeader.create({
      bookingDate: new Date(),
      remark: `WashJob Sale: ${washJob.notes || 'Generated from Wash Job'}`,
      discount: washJob.manualDiscountAmount || 0,
      total: washJob.totalAmount + (washJob.manualDiscountAmount || 0),
      exchangeRate: dfCurrency.rate,
      isActive: true,
      paymentId: paymentId || dfPayment.id,
      clientId: washJob.clientId || null,
      currencyId: dfCurrency.id,
      userId: userId,
      referenceNo: `WJ-${washJob.id}`,
      locationId: washJob.locationId || dfLocation.id,
      customerId: washJob.customerId || null,
      orderTableId: null,
      washJobId: washJob.id,
    }, { transaction: t });

    logger.info(`Created SaleHeader ${saleHeader.id} for WashJob ${washJobId}`);

    // 2. Create SaleLines first (before card reservation)
    const createdSaleLines = [];
    const cardReservationData = [];
    
    for (const line of washJob.lines) {
      const saleLine = await SaleLine.create({
        saleHeaderId: saleHeader.id,
        productId: line.productId,
        quantity: line.quantity ?? 1,
        price: line.price,
        unitId: line.unitId || dfUnit.id,
        total: (line.price || 0) * (line.quantity ?? 1),
      }, { transaction: t });

      createdSaleLines.push(saleLine);
      
      // Prepare data for batch card reservation
      cardReservationData.push({
        line: line,
        saleLineId: saleLine.id
      });
    }

    // 3. Reserve cards in batch (if stock validation is enabled)
    let cardReservationResults = [];
    if (validateStock && cardReservationData.length > 0) {
      try {
        logger.info(`Starting batch card reservation for ${cardReservationData.length} lines`);
        cardReservationResults = await reserveCardsForWashJobLines(
          cardReservationData, 
          washJob.locationId || dfLocation.id, 
          t
        );
        logger.info(`Batch card reservation completed successfully`);
      } catch (error) {
        logger.error(`Batch card reservation failed: ${error.message}`);
        throw error; // This will trigger transaction rollback
      }
    }

    // 4. Update WashJob status to "SETTLED"
    washJob.status = 'SETTLED';
    washJob.saleHeaderId = saleHeader.id;
    await washJob.save({ transaction: t });

    // 5. Update product stock counts
    if (validateStock && washJob.lines && washJob.lines.length > 0) {
      await updateProductStockCountForWashJob(washJob.lines);
    }

    await t.commit();
    
    logger.info(`========== WASHJOB SALE CREATION SUCCESSFUL ==========`);
    logger.info(`Successfully created sale from WashJob ${washJobId}, SaleHeader ${saleHeader.id}`);
    
    return res.status(200).json({ 
      success: true,
      message: "Sale created and job completed with stock validation and card reservation", 
      saleHeader,
      stockValidationPerformed: validateStock,
      cardsReserved: validateStock,
      washJobId: washJobId,
      saleLinesCreated: createdSaleLines.length,
      cardReservationResults: cardReservationResults
    });
    
  } catch (err) {
    await t.rollback();
    logger.error(`========== WASHJOB SALE CREATION FAILED ==========`);
    logger.error(`Failed to create sale from WashJob ${washJobId}: ${err.message}`);
    
    return res.status(500).json({ 
      success: false,
      message: "Failed to create sale from wash job", 
      error: err.message,
      washJobId: washJobId
    });
  }
};

// ============================================================================
// OTHER WASHJOB CONTROLLER METHODS (existing ones)
// ============================================================================

exports.validateWashJobStock = async (req, res) => {
  try {
    const washJobId = req.params.id;
    
    const washJob = await WashJob.findByPk(washJobId, {
      include: [{ model: WashJobLine, as: 'lines' }],
    });
    
    if (!washJob) {
      return res.status(404).json({ 
        success: false, 
        message: "Wash job not found" 
      });
    }
    
    const dfLocation = await Location.findOne({ where: { isActive: true } });
    const locationId = washJob.locationId || dfLocation.id;
    
    const stockValidationErrors = await validateStockForWashJobLines(washJob.lines, locationId);
    
    if (stockValidationErrors.length > 0) {
      return res.status(200).json({
        success: false,
        message: 'Stock validation failed',
        hasStockIssues: true,
        stockErrors: stockValidationErrors,
        details: stockValidationErrors.map(err => 
          err.error || `${err.productName || `Product ${err.productId}`}: Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
        )
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Stock validation passed',
      hasStockIssues: false,
      washJobId: washJobId,
      linesValidated: washJob.lines.length
    });
    
  } catch (error) {
    logger.error(`Error validating stock for WashJob: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Error during stock validation',
      error: error.message
    });
  }
};

// ... (include other existing methods like createWashJob, getAllWashJobs, etc.)
exports.createWashJob = async (req, res) => {
  logger.info(`Request creating washJob body ${JSON.stringify(req.body)}`);
  try {
    const {
      status,
      notes,
      totalAmount,
      startedAt,
      completedAt,
      manualDiscountAmount,
      manualExtraChargeAmount,
      lines
    } = req.body;

    const washJob = await WashJob.create(
      {
        status,
        notes,
        totalAmount,
        startedAt,
        completedAt,
        manualDiscountAmount,
        manualExtraChargeAmount,
        lines
      },
      {
        include: [{ model: WashJobLine, as: 'lines' }]
      }
    );

    res.status(201).json({ message: 'WashJob created successfully', data: washJob });
  } catch (err) {
    logger.error(`Error occurred create washJob ${err}`);
    res.status(400).json({ error: err.message });
  }
};
// Delete wash job by ID

// exports.createSaleFromWashJob = async (req, res) => {
//   const { paymentId, userId } = req.body;
//   const washJobId = req.params.id;
  
//   const dfCurrency = await Currency.findOne({ where: { isLocalCCY: true } });
//   const dfLocation = await Location.findOne({ where: { isActive: true } });
//   const dfPayment = await Payment.findOne({ where: { isActive: true } });
//   const dfUnit = await Unit.findOne({ where: { isActive: true } });
  
//   logger.info(`DF Currency ${JSON.stringify(dfCurrency)}`);
//   logger.info(`DF dfLocation ${JSON.stringify(dfLocation)}`);
//   logger.info(`DF dfPayment ${JSON.stringify(dfPayment)}`);
  
//   const washJob = await WashJob.findByPk(washJobId, {
//     include: [{ model: WashJobLine, as: 'lines' }],
//   });
  
//   if (!washJob) {
//     return res.status(404).json({ message: "Wash job not found" });
//   }
  
//   // VALIDATION: Check if already posted
//   if (washJob.saleHeaderId) {
//     logger.warn(`WashJob ${washJobId} already has saleHeaderId: ${washJob.saleHeaderId}`);
//     return res.status(400).json({ 
//       message: "This wash job has already been posted to sales",
//       saleHeaderId: washJob.saleHeaderId,
//       status: washJob.status
//     });
//   }
  
//   // VALIDATION: Check if status is already SETTLED
//   if (washJob.status === 'SETTLED') {
//     logger.warn(`WashJob ${washJobId} is already in SETTLED status`);
//     return res.status(400).json({ 
//       message: "This wash job has already been settled",
//       status: washJob.status
//     });
//   }
  
//   const t = await sequelize.transaction();
  
//   try {
//     // 1. Create SaleHeader
//     const saleHeader = await SaleHeader.create({
//       bookingDate: new Date(),
//       remark: `${washJob.notes}`,
//       discount: washJob.manualDiscountAmount || 0,
//       total: washJob.totalAmount + washJob.manualDiscountAmount,
//       exchangeRate: dfCurrency.rate,
//       isActive: true,
//       paymentId: paymentId || dfPayment.id,
//       clientId: washJob.clientId || null,
//       currencyId: dfCurrency.id,
//       userId: userId,
//       referenceNo: `WJ-${washJob.id}`,
//       locationId: washJob.locationId || dfLocation.id,
//       customerId: washJob.customerId || null,
//       orderTableId: null,
//       washJobId: washJob.id,
//     }, { transaction: t });
    
//     // 2. Create SaleLines
//     for (const line of washJob.lines) {
//       await SaleLine.create({
//         saleHeaderId: saleHeader.id,
//         productId: line.productId,
//         quantity: line.quantity ?? 1,
//         price: line.price,
//         unitId: line.unitId || dfUnit.id,
//         total: (line.price || 0) * (line.quantity ?? 1),
//       }, { transaction: t });
//     }
    
//     // 3. Update WashJob status to "SETTLED"
//     washJob.status = 'SETTLED';
//     washJob.saleHeaderId = saleHeader.id;
//     await washJob.save({ transaction: t });
    
//     await t.commit();
    
//     logger.info(`Successfully created sale from WashJob ${washJobId}, SaleHeader ${saleHeader.id}`);
//     return res.status(200).json({ 
//       message: "Sale created and job completed", 
//       saleHeader 
//     });
    
//   } catch (err) {
//     await t.rollback();
//     logger.error(`Failed to create sale from WashJob ${washJobId}: ${err.message}`);
//     return res.status(500).json({ 
//       message: "Failed to create sale", 
//       error: err.message 
//     });
//   }
// };

