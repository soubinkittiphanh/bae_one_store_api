const { Op } = require("sequelize");
const GeneralLedger = require('../models').gl; // Adjust the path as needed

// Create a new general ledger entry
exports.createGeneralLedger = async (req, res) => {
  try {
    const { sequenceNumber, bookingDate, postingReference, debit, credit, description, localAmount, rate, source } = req.body;

    // Create a new entry in the general_ledger table
    const newGeneralLedgerEntry = await GeneralLedger.create({
      sequenceNumber,
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
    const allGeneralLedgerEntries = await GeneralLedger.findAll();
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
    const generalLedgerEntry = await GeneralLedger.findByPk(id);

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
    const { sequenceNumber, bookingDate, postingReference, debit, credit, description, localAmount, rate, source } = req.body;

    const updatedGeneralLedgerEntry = await GeneralLedger.update({
      sequenceNumber,
      bookingDate,
      postingReference,
      debit,
      credit,
      description,
      localAmount,
      rate,
      source,
    }, {
      where: { id },
    });

    res.status(200).json({ message: 'General ledger entry updated successfully' });
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
    });
    return res.status(200).json(cards);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};


