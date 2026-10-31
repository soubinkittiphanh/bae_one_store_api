const db = require('../../models');
const { LoanError } = require('../errors');

// Read side of the product factory. Writes go through paramService (maker-checker).
const productIncludes = (withWaterfall) => [
  { model: db.lnProductCategory, as: 'category', attributes: ['id', 'code', 'name', 'authStatus'] },
  { model: db.lnProductCurrency, as: 'allowedCurrencies', include: [{ model: db.currency, as: 'currency' }] },
  { model: db.lnProductComponent, as: 'components', include: [{ model: db.lnComponent, as: 'componentMaster' }] },
  { model: db.lnProductUde, as: 'udes' },
  { model: db.lnProductAmount, as: 'currencyAmounts' },
  ...(withWaterfall ? [{ model: db.lnWaterfallRule, as: 'waterfallRules', include: [{ model: db.lnComponent, as: 'component' }] }] : [])
];

const productService = {
  async getProducts(query = {}) {
    const { Op } = db.Sequelize;
    const where = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;
    if (query.authStatus) where.authStatus = String(query.authStatus).split(',');
    if (query.search) {
      where[Op.or] = [
        { productCode: { [Op.like]: `%${query.search}%` } },
        { name: { [Op.like]: `%${query.search}%` } }
      ];
    }
    return db.lnProduct.findAll({ where, include: productIncludes(false), order: [['productCode', 'ASC'], ['version', 'DESC']] });
  },

  async getProductById(id) {
    const product = await db.lnProduct.findByPk(id, { include: productIncludes(true) });
    if (!product) throw new LoanError(404, `Product ${id} not found`);
    return product;
  }
};

module.exports = productService;
