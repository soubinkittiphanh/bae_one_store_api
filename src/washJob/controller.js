// const WashJob = require('../models').washJob;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const WashJob = require('../models').washjob;
const WashJobHistory = require('../models').washjobHis;
const WashJobLine = require('../models').washjobline;
const Product = require('../models').product;
const SaleHeader = require('../models').saleHeader;
const SaleLine = require('../models').saleLine;
const Currency = require('../models').currency;
const Location = require('../models').location;
const { sequelize } = require('../models');
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
      lines // <-- use this key from frontend
    } = req.body;

    const washJob = await WashJob.create(
      {
        status,
        notes,
        totalAmount,
        startedAt,
        completedAt,
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
              as: 'product'
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
    const { status, notes, totalAmount, startedAt, completedAt, lines } = req.body;

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
  logger.info(`DF Currency ${dfCurrency}`)
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
      remark: `From WashJob #${washJob.id}`,
      discount: washJob.discount || 0,
      total: washJob.totalAmount,
      exchangeRate: dfCurrency.rate,
      isActive: true,
      // createdAt: new Date(),
      // updateTimestamp: new Date(),
      paymentId: paymentId || null,
      clientId: washJob.clientId || null,
      currencyId: dfCurrency.id,
      userId: userId,
      referenceNo: `WJ-${washJob.id}`,
      locationId: washJob.locationId || dfLocation.id,
      customerId: washJob.customerId || null,
      orderTableId: null
    }, { transaction: t });

    // 2. Create SaleLines
    for (const line of washJob.lines) {
      await SaleLine.create({
        saleHeaderId: saleHeader.id,
        productId: line.productId,
        quantity: line.quantity ?? 1,
        price: line.price,
        total: (line.price || 0) * (line.quantity ?? 1),
      }, { transaction: t });
    }

    // 3. Update WashJob status to "complete"
    washJob.status = 'COMPLETED'; // Make sure "status" column exists in DB
    await washJob.save({ transaction: t });

    await t.commit();

    return res.status(200).json({ message: "Sale created and job completed", saleHeader });

  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ message: "Failed to create sale", error: err.message });
  }
};

