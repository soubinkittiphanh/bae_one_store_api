// const WashJob = require('../models').washJob;
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
const { sequelize, priceList } = require('../../models');
const { Op } = require('sequelize');
const PriceList = require('../../models').priceList;
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
                }
              ]
            },
            {
              model: PriceList,
              as: 'priceList'
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
// Delete wash job by ID
exports.createSaleFromWashJob = async (req, res) => {
  const { paymentId, userId } = req.body;
  const washJobId = req.params.id;

  const dfCurrency = await Currency.findOne({ where: { isLocalCCY: true } });
  const dfLocation = await Location.findOne({ where: { isActive: true } });
  const dfPayment = await Payment.findOne({ where: { isActive: true } });
  const dfUnit = await Unit.findOne({ where: { isActive: true } });
  logger.info(`DF Currency ${JSON.stringify(dfCurrency)}`)
  logger.info(`DF dfLocation ${JSON.stringify(dfLocation)}`)
  logger.info(`DF dfPayment ${JSON.stringify(dfPayment)}`)

  const washJob = await WashJob.findByPk(washJobId, {
    include: [{ model: WashJobLine, as: 'lines' }],
  });

  if (!washJob) {
    return res.status(404).json({ message: "Wash job not found" });
  }

  const t = await sequelize.transaction();

  try {
    // 1. Create SaleHeader
    const saleHeader = await SaleHeader.create({
      bookingDate: new Date(),
      remark: `${washJob.notes}`,
      discount: washJob.manualDiscountAmount || 0,
      total: washJob.totalAmount + washJob.manualDiscountAmount,
      exchangeRate: dfCurrency.rate,
      isActive: true,
      // createdAt: new Date(),
      // updateTimestamp: new Date(),
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

    // 2. Create SaleLines
    for (const line of washJob.lines) {
      await SaleLine.create({
        saleHeaderId: saleHeader.id,
        productId: line.productId,
        quantity: line.quantity ?? 1,
        price: line.price,
        unitId: line.unitId || dfUnit.id,
        total: (line.price || 0) * (line.quantity ?? 1),
      }, { transaction: t });
    }

    // 3. Update WashJob status to "complete"
    washJob.status = 'SETTLED'; // Make sure "status" column exists in DB
    washJob.saleHeaderId = saleHeader.id;
    await washJob.save({ transaction: t });

    await t.commit();

    return res.status(200).json({ message: "Sale created and job completed", saleHeader });

  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ message: "Failed to create sale", error: err.message });
  }
};

