const { Op } = require("sequelize");
const GeneralLedger = require('../models').gl; // Adjust the path as needed
const service = require('./service')
// Create a new general ledger entry
exports.createMultiGeneralLedger = async (req, res) => {
  try {
    const { lines } = req.body;
    // Create a new entry in the general_ledger table
    const newGeneralLedgerEntry = await service.createMultiEntry(lines)
    res.status(201).send(newGeneralLedgerEntry);
  } catch (error) {
    console.error('Error creating general ledger entry:', error);
    res.status(500).json({ error: 'An error occurred while creating the general ledger entry' });
  }
};
exports.createGeneralLedger = async (req, res) => {
  try {
    const { bookingDate, postingReference, debit, credit, description, localAmount, rate, source } = req.body;

    // Create a new entry in the general_ledger table
    const newGeneralLedgerEntry = await GeneralLedger.create({
      bookingDate,
      postingReference,
      debit,
      credit,
      description,
      localAmount,
      rate,
      source,
    });

    res.status(201).json({ message: 'General ledger entry created successfully', data: newGeneralLedgerEntry });
  } catch (error) {
    console.error('Error creating general ledger entry:', error);
    res.status(500).json({ error: 'An error occurred while creating the general ledger entry' });
  }
};

// Get all general ledger entries
exports.getAllGeneralLedgerEntries = async (req, res) => {
  try {
    const allGeneralLedgerEntries = await GeneralLedger.findAll({ include: ['currency', 'drAccount', 'crAccount'] });
    res.status(200).json(allGeneralLedgerEntries);
  } catch (error) {
    console.error('Error fetching general ledger entries:', error);
    res.status(500).json({ error: 'An error occurred while fetching general ledger entries' });
  }
};

// Get a specific general ledger entry by ID
exports.getGeneralLedgerEntryById = async (req, res) => {
  try {
    const { id } = req.params;
    const generalLedgerEntry = await GeneralLedger.findByPk(id, { include: ['currency', 'drAccount', 'crAccount'] });

    if (!generalLedgerEntry) {
      return res.status(404).json({ error: 'General ledger entry not found' });
    }

    res.status(200).json(generalLedgerEntry);
  } catch (error) {
    console.error('Error fetching general ledger entry by ID:', error);
    res.status(500).json({ error: 'An error occurred while fetching general ledger entry by ID' });
  }
};

// Update a general ledger entry by ID
exports.updateGeneralLedgerEntryById = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, postingReference, debit, credit, description, localAmount, rate, source } = req.body;

    const updatedGeneralLedgerEntry = await GeneralLedger.update(req.body, {
      where: { id },
    });

    res.status(200).send(updatedGeneralLedgerEntry);
  } catch (error) {
    console.error('Error updating general ledger entry:', error);
    res.status(500).json({ error: 'An error occurred while updating the general ledger entry' });
  }
};

// Delete a general ledger entry by ID
exports.deleteGeneralLedgerEntryById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedGeneralLedgerEntryCount = await GeneralLedger.destroy({ where: { id } });

    if (deletedGeneralLedgerEntryCount === 0) {
      return res.status(404).json({ error: 'General ledger entry not found' });
    }

    res.status(200).json({ message: 'General ledger entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting general ledger entry:', error);
    res.status(500).json({ error: 'An error occurred while deleting the general ledger entry' });
  }
};



exports.getAllByDate = async (req, res) => {
  const date = JSON.parse(req.query.date)
  try {
    const cards = await GeneralLedger.findAll({
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        }
      },
      include: ['currency', 'drAccount', 'crAccount']
    });
    return res.status(200).json(cards);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.previewUnpostedBatch = async (req, res) => {
  try {
    let { startDate, endDate, module } = req.query;

    if (req.query.date) {
      try {
        const parsedDate = JSON.parse(req.query.date);
        startDate = startDate || parsedDate.startDate;
        endDate = endDate || parsedDate.endDate;
      } catch (e) {
        // Ignore error
      }
    }

    if (!startDate || !endDate || !module) {
      return res.status(400).json({ error: 'startDate, endDate, and module are required parameters.' });
    }

    const validModules = ['AP', 'AR', 'AP_SETTLEMENT', 'AR_RECEIPT', 'MONEY_SETTLEMENT'];
    if (!validModules.includes(module)) {
      return res.status(400).json({ error: `module must be one of: ${validModules.join(', ')}.` });
    }

    if (['AP_SETTLEMENT', 'AR_RECEIPT', 'MONEY_SETTLEMENT'].includes(module)) {
      const GLCashPostingService = require('./cashPostingService');
      const preview = await GLCashPostingService.previewUnposted(startDate, endDate, module);
      return res.status(200).json(preview);
    }

    const GLPostingService = require('./postingService');
    const preview = await GLPostingService.previewUnposted(startDate, endDate, module);
    res.status(200).json(preview);
  } catch (error) {
    console.error('Error previewing unposted batch:', error);
    res.status(500).json({ error: error.message || 'An error occurred during preview' });
  }
};

exports.postBatch = async (req, res) => {
  try {
    const { startDate, endDate, module } = req.body;
    const userId = req.user?.id || 1;

    if (!startDate || !endDate || !module) {
      return res.status(400).json({ error: 'startDate, endDate, and module are required in request body.' });
    }

    const validModules = ['AP', 'AR', 'AP_SETTLEMENT', 'AR_RECEIPT', 'MONEY_SETTLEMENT'];
    if (!validModules.includes(module)) {
      return res.status(400).json({ error: `module must be one of: ${validModules.join(', ')}.` });
    }

    if (['AP_SETTLEMENT', 'AR_RECEIPT', 'MONEY_SETTLEMENT'].includes(module)) {
      const GLCashPostingService = require('./cashPostingService');
      const result = await GLCashPostingService.postBatch(startDate, endDate, module, userId);
      return res.status(200).json({ message: 'Batch cash-posting executed successfully', data: result });
    }

    const GLPostingService = require('./postingService');
    const result = await GLPostingService.postBatch(startDate, endDate, module, userId);
    res.status(200).json({ message: 'Batch posting executed successfully', data: result });
  } catch (error) {
    console.error('Error executing batch posting:', error);
    res.status(500).json({ error: error.message || 'An error occurred during batch posting' });
  }
};



