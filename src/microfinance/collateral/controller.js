const db = require('../../models');

async function create(req, res) {
  try {
    const { collateralNo } = req.body;
    
    let finalCollateralNo = collateralNo;
    if (!finalCollateralNo) {
      const count = await db.mfCollateral.count();
      finalCollateralNo = `COL${String(count + 1).padStart(6, '0')}`;
    }

    const currencyCode = req.body.currency || 'USD';
    const currencyRecord = await db.currency.findOne({ where: { code: currencyCode } });
    const currencyId = currencyRecord ? currencyRecord.id : 1;

    // lendableValue is calculated in beforeValidate hook of model
    const collateral = await db.mfCollateral.create({
      ...req.body,
      collateralNo: finalCollateralNo,
      currencyId
    });

    return res.status(201).json({ success: true, data: collateral });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const collateral = await db.mfCollateral.findByPk(id);
    if (!collateral) {
      return res.status(404).json({ success: false, error: 'Collateral not found' });
    }
    
    await collateral.update(req.body);
    return res.status(200).json({ success: true, data: collateral });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findAll(req, res) {
  try {
    const collaterals = await db.mfCollateral.findAll({
      include: [
        { model: db.cifCustomer, as: 'customer' },
        { model: db.currency, as: 'currency' }
      ]
    });
    return res.status(200).json({ success: true, data: collaterals });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findOne(req, res) {
  try {
    const { id } = req.params;
    const collateral = await db.mfCollateral.findByPk(id, {
      include: [
        { model: db.cifCustomer, as: 'customer' },
        { model: db.currency, as: 'currency' }
      ]
    });
    if (!collateral) {
      return res.status(404).json({ success: false, error: 'Collateral not found' });
    }
    return res.status(200).json({ success: true, data: collateral });
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
