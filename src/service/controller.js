const logger = require('../api/logger');
const Service = require('../models').service;
// === controllers/serviceController.js ===

exports.createService = async (req, res) => {
  try {
    const service = await Service.create(req.body);
    res.status(201).json(service);
  } catch (error) {
    console.error("Create Service Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getAllServices = async (req, res) => {
  try {
    const services = await Service.findAll();
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findByPk(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const updated = await Service.update(req.body, {
      where: { id: req.params.id },
    });
    res.status(200).json({ message: "Service updated", updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteService = async (req, res) => {
  try {
    await Service.destroy({ where: { id: req.params.id } });
    res.status(200).json({ message: "Service deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};