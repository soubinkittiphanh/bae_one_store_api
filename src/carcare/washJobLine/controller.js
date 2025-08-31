// const WashJob = require('../models').washJob;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const  WashJob = require('../../models').washjob;
const  Product = require('../../models').product;

// Create a new WashJob with lines
exports.create = async (req, res) => {
  try {
    const { notes, startedAt, completedAt, lines } = req.body;

    const totalAmount = lines.reduce((sum, line) => sum + (line.total || (line.price * line.quantity)), 0);

    const washJob = await WashJob.create(
      {
        notes,
        startedAt,
        completedAt,
        totalAmount,
        washJobLines: lines
      },
      {
        include: [{ model: WashJobLine, as: 'washJobLines' }]
      }
    );

    res.status(201).json(washJob);
  } catch (err) {
    console.error('Create WashJob Error:', err);
    res.status(500).json({ error: 'Failed to create wash job' });
  }
};

// Get all wash jobs with lines
exports.getAll = async (req, res) => {
  try {
    const jobs = await WashJob.findAll({
      include: [{ model: WashJobLine, as: 'washJobLines' }]
    });
    res.json(jobs);
  } catch (err) {
    console.error('Fetch All WashJobs Error:', err);
    res.status(500).json({ error: 'Failed to fetch wash jobs' });
  }
};

// Get a single wash job by ID
exports.getOne = async (req, res) => {
  try {
    const job = await WashJob.findByPk(req.params.id, {
      include: [{ model: WashJobLine, as: 'washJobLines' }]
    });
    if (!job) return res.status(404).json({ error: 'Wash job not found' });
    res.json(job);
  } catch (err) {
    console.error('Fetch WashJob Error:', err);
    res.status(500).json({ error: 'Failed to fetch wash job' });
  }
};

// Update wash job
exports.update = async (req, res) => {
  try {
    const { notes, status, startedAt, completedAt } = req.body;

    const job = await WashJob.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Wash job not found' });

    await job.update({ notes, status, startedAt, completedAt });
    res.json(job);
  } catch (err) {
    console.error('Update WashJob Error:', err);
    res.status(500).json({ error: 'Failed to update wash job' });
  }
};

// Delete wash job and its lines
exports.remove = async (req, res) => {
  try {
    const job = await WashJob.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Wash job not found' });

    await WashJobLine.destroy({ where: { washJobId: job.id } });
    await job.destroy();

    res.json({ message: 'Wash job deleted' });
  } catch (err) {
    console.error('Delete WashJob Error:', err);
    res.status(500).json({ error: 'Failed to delete wash job' });
  }
};
