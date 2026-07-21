const db = require('../../models');

async function findAll(req, res) {
  try {
    const { loanAccountId } = req.query;
    const where = {};
    if (loanAccountId) {
      where.loanAccountId = loanAccountId;
    }
    
    const entries = await db.mfJournalEntry.findAll({
      where,
      include: [
        {
          model: db.mfLoanAccount,
          as: 'loanAccount',
          include: [{ model: db.cifCustomer, as: 'customer' }]
        },
        {
          model: db.currency,
          as: 'currency'
        }
      ],
      order: [['id', 'DESC']]
    });
    
    return res.status(200).json({ success: true, data: entries });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  findAll
};
