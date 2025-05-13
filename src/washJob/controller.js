// const WashJob = require('../models').washJob;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { WashJob, Product, Service, WashJobServiceProduct, WashJobHistory } = require('../models');

// Create a new wash job with products and services
exports.createWashJob = async (req, res) => {
  try {
    const { vehicleId, status, notes, totalAmount, startedAt, completedAt, products, services } = req.body;

    const washJob = await WashJob.create({
      vehicleId,
      status,
      notes,
      totalAmount,
      startedAt,
      completedAt,
    });

    if (products && products.length > 0) {
      for (let item of products) {
        await WashJobServiceProduct.create({
          washJobId: washJob.id,
          productId: item.productId,
          price: item.price,
          cost: item.cost,
          quantity: item.quantity,
        });
      }
    }

    if (services && services.length > 0) {
      for (let item of services) {
        await WashJobServiceProduct.create({
          washJobId: washJob.id,
          serviceId: item.serviceId,
          price: item.price,
          cost: item.cost,
          quantity: item.quantity,
        });
      }
    }

    res.status(201).json({ message: 'WashJob created successfully', data: washJob });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get all wash jobs with associated products and services
exports.getAllWashJobs = async (req, res) => {
  try {
    const washJobs = await WashJob.findAll({
      include: [
        { model: Product, as: 'products' },
        { model: Service, as: 'services' },
      ],
    });
    res.status(200).json(washJobs);
  } catch (err) {
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
    const { status, notes, totalAmount, startedAt, completedAt, products, services } = req.body;

    const existingWashJob = await WashJob.findByPk(req.params.id);
    if (!existingWashJob) return res.status(404).json({ message: 'WashJob not found' });

    // Save current state to history
    await WashJobHistory.create({
      washJobId: existingWashJob.id,
      version: existingWashJob.version,
      data: existingWashJob.toJSON(),
      modifiedBy: req.user?.username ?? 'system', // optional
    });

    // Increment version and update main WashJob
    await existingWashJob.update({
      status,
      notes,
      totalAmount,
      startedAt,
      completedAt,
      version: existingWashJob.version + 1,
    });

    // Replace service-product mapping
    await WashJobServiceProduct.destroy({ where: { washJobId: req.params.id } });

    if (products && products.length > 0) {
      for (let item of products) {
        await WashJobServiceProduct.create({
          washJobId: req.params.id,
          productId: item.productId,
          price: item.price,
          cost: item.cost,
          quantity: item.quantity,
        });
      }
    }

    if (services && services.length > 0) {
      for (let item of services) {
        await WashJobServiceProduct.create({
          washJobId: req.params.id,
          serviceId: item.serviceId,
          price: item.price,
          cost: item.cost,
          quantity: item.quantity,
        });
      }
    }

    const updatedWashJob = await WashJob.findByPk(req.params.id);
    res.status(200).json(updatedWashJob);
  } catch (err) {
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
