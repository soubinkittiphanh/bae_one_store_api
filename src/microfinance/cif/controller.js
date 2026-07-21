const db = require('../../models');

async function create(req, res) {
  try {
    const { cifNo } = req.body;
    
    // Auto-generate CIF No if not provided
    let finalCifNo = cifNo;
    if (!finalCifNo) {
      const count = await db.cifCustomer.count();
      finalCifNo = `CIF${String(count + 1).padStart(6, '0')}`;
    }

    const customer = await db.cifCustomer.create({
      ...req.body,
      cifNo: finalCifNo
    });

    return res.status(201).json({ success: true, data: customer });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const customer = await db.cifCustomer.findByPk(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    await customer.update(req.body);
    return res.status(200).json({ success: true, data: customer });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findAll(req, res) {
  try {
    const customers = await db.cifCustomer.findAll({
      include: [
        { model: db.microfinanceGroup, as: 'group' },
        { model: db.mfLoanAccount, as: 'loanAccounts' },
        { model: db.mfCollateral, as: 'collaterals' }
      ]
    });
    return res.status(200).json({ success: true, data: customers });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findOne(req, res) {
  try {
    const { id } = req.params;
    const customer = await db.cifCustomer.findByPk(id, {
      include: [
        { model: db.microfinanceGroup, as: 'group' },
        { model: db.mfLoanAccount, as: 'loanAccounts' },
        { model: db.mfCollateral, as: 'collaterals' }
      ]
    });
    
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    return res.status(200).json({ success: true, data: customer });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  create,
  update,
  findAll,
  findOne
};
