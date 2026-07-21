const db = require('../../models');

async function create(req, res) {
  try {
    const { productCode } = req.body;
    
    // Validate if product code already exists
    const existing = await db.mfLoanProduct.findByPk(productCode);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Product Code already exists' });
    }

    const currencyCode = req.body.currency || 'USD';
    const currencyRecord = await db.currency.findOne({ where: { code: currencyCode } });
    const currencyId = currencyRecord ? currencyRecord.id : 1;

    const product = await db.mfLoanProduct.create({
      ...req.body,
      currencyId
    });

    return res.status(201).json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params; // productCode
    const product = await db.mfLoanProduct.findByPk(id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    await product.update(req.body);
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findAll(req, res) {
  try {
    const products = await db.mfLoanProduct.findAll({
      include: [
        { model: db.mfLoanAccount, as: 'accounts' },
        { model: db.chartAccount, as: 'assetGL' },
        { model: db.chartAccount, as: 'incomeGL' },
        { model: db.currency, as: 'currency' }
      ]
    });
    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findOne(req, res) {
  try {
    const { id } = req.params;
    const product = await db.mfLoanProduct.findByPk(id, {
      include: [
        { model: db.mfLoanAccount, as: 'accounts' },
        { model: db.chartAccount, as: 'assetGL' },
        { model: db.chartAccount, as: 'incomeGL' },
        { model: db.currency, as: 'currency' }
      ]
    });
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    return res.status(200).json({ success: true, data: product });
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
