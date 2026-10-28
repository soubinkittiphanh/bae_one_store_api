const db = require('../../models');
const logger = require('../../api/logger');

const productService = {
  /**
   * List all products with category, currencies, and components
   */
  async getProducts(query = {}) {
    const { categoryId, status, search } = query;
    const where = {};
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (search) {
      where[db.Sequelize.Op.or] = [
        { productCode: { [db.Sequelize.Op.like]: `%${search}%` } },
        { name: { [db.Sequelize.Op.like]: `%${search}%` } }
      ];
    }

    return db.lnProduct.findAll({
      where,
      include: [
        {
          model: db.lnProductCategory,
          as: 'category',
          attributes: ['id', 'code', 'name']
        },
        {
          model: db.lnProductCurrency,
          as: 'allowedCurrencies',
          include: [{ model: db.currency, as: 'currency' }]
        },
        {
          model: db.lnProductComponent,
          as: 'components',
          include: [{ model: db.lnComponent, as: 'componentMaster' }]
        },
        {
          model: db.lnProductUde,
          as: 'udes'
        }
      ],
      order: [['id', 'ASC']]
    });
  },

  /**
   * Get single product by ID
   */
  async getProductById(id) {
    const product = await db.lnProduct.findByPk(id, {
      include: [
        {
          model: db.lnProductCategory,
          as: 'category'
        },
        {
          model: db.lnProductCurrency,
          as: 'allowedCurrencies',
          include: [{ model: db.currency, as: 'currency' }]
        },
        {
          model: db.lnProductComponent,
          as: 'components',
          include: [{ model: db.lnComponent, as: 'componentMaster' }]
        },
        {
          model: db.lnProductUde,
          as: 'udes'
        },
        {
          model: db.lnWaterfallRule,
          as: 'waterfallRules',
          include: [{ model: db.lnComponent, as: 'component' }]
        }
      ]
    });

    if (!product) {
      throw new Error(`Product with ID ${id} not found`);
    }

    return product;
  },

  /**
   * Validate product configuration
   */
  validateProductPayload(data) {
    if (data.disbursementTargetCode === 'SALE_INVOICE_SETTLEMENT' && data.feeFinancingMode === 'DEDUCTED') {
      throw new Error('Invalid Configuration: DEDUCTED fee mode is incompatible with SALE_INVOICE_SETTLEMENT. Use UPFRONT or CAPITALIZED.');
    }
    if (data.minInterestRate !== undefined && data.maxInterestRate !== undefined) {
      if (parseFloat(data.minInterestRate) > parseFloat(data.maxInterestRate)) {
        throw new Error('Validation Error: minInterestRate cannot exceed maxInterestRate');
      }
    }
    if (data.minDownPaymentPct !== undefined) {
      const dp = parseFloat(data.minDownPaymentPct);
      if (dp < 0 || dp > 1) {
        throw new Error('Validation Error: minDownPaymentPct must be between 0.0 and 1.0 (e.g. 0.20 for 20%)');
      }
    }
    if (data.maxLtvPct !== undefined) {
      const ltv = parseFloat(data.maxLtvPct);
      if (ltv < 0 || ltv > 1) {
        throw new Error('Validation Error: maxLtvPct must be between 0.0 and 1.0 (e.g. 0.80 for 80%)');
      }
    }
  },

  /**
   * Create a new product
   */
  async createProduct(data, userId) {
    this.validateProductPayload(data);

    const transaction = await db.sequelize.transaction();
    try {
      const product = await db.lnProduct.create({
        ...data,
        makerId: userId,
        authStatus: 'AUTHORIZED'
      }, { transaction });

      // If currencies supplied
      if (data.currencyIds && Array.isArray(data.currencyIds)) {
        for (let i = 0; i < data.currencyIds.length; i++) {
          await db.lnProductCurrency.create({
            productId: product.id,
            currencyId: data.currencyIds[i],
            isDefault: i === 0
          }, { transaction });
        }
      }

      // If components supplied
      if (data.components && Array.isArray(data.components)) {
        for (const c of data.components) {
          await db.lnProductComponent.create({
            productId: product.id,
            componentId: c.componentId,
            formulaCode: c.formulaCode || 'STANDARD',
            defaultValue: c.defaultValue || 0,
            minValue: c.minValue || 0,
            maxValue: c.maxValue || 1000000000,
            timing: c.timing || 'INSTALLMENT',
            authStatus: 'AUTHORIZED'
          }, { transaction });
        }
      }

      // If UDEs supplied
      if (data.udes && Array.isArray(data.udes)) {
        for (const u of data.udes) {
          await db.lnProductUde.create({
            productId: product.id,
            udeCode: u.udeCode,
            defaultValue: u.defaultValue || 0,
            minValue: u.minValue || 0,
            maxValue: u.maxValue || 1000,
            isAmendableAtAccount: u.isAmendableAtAccount || false,
            authStatus: 'AUTHORIZED'
          }, { transaction });
        }
      }

      await transaction.commit();
      return this.getProductById(product.id);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  /**
   * Update an existing product
   */
  async updateProduct(id, data, userId) {
    const product = await db.lnProduct.findByPk(id);
    if (!product) {
      throw new Error(`Product with ID ${id} not found`);
    }

    this.validateProductPayload({ ...product.toJSON(), ...data });

    await product.update({
      ...data,
      checkerId: userId,
      optLockVersion: product.optLockVersion + 1
    });

    return this.getProductById(id);
  },

  /**
   * Clone a product with its components, UDEs, and waterfall rules
   */
  async cloneProduct(sourceId, targetData, userId) {
    const source = await this.getProductById(sourceId);
    if (!source) {
      throw new Error(`Source product with ID ${sourceId} not found`);
    }

    const transaction = await db.sequelize.transaction();
    try {
      const sourceObj = source.toJSON();
      delete sourceObj.id;
      delete sourceObj.createdAt;
      delete sourceObj.updatedAt;

      const newProduct = await db.lnProduct.create({
        ...sourceObj,
        productCode: targetData.productCode || `${source.productCode}-COPY`,
        name: targetData.name || `${source.name} (Copy)`,
        version: 1,
        makerId: userId,
        checkerId: null,
        optLockVersion: 1
      }, { transaction });

      // Copy currencies
      if (source.allowedCurrencies && source.allowedCurrencies.length > 0) {
        for (const c of source.allowedCurrencies) {
          await db.lnProductCurrency.create({
            productId: newProduct.id,
            currencyId: c.currencyId,
            isDefault: c.isDefault
          }, { transaction });
        }
      }

      // Copy components
      if (source.components && source.components.length > 0) {
        for (const pc of source.components) {
          await db.lnProductComponent.create({
            productId: newProduct.id,
            componentId: pc.componentId,
            formulaCode: pc.formulaCode,
            defaultValue: pc.defaultValue,
            minValue: pc.minValue,
            maxValue: pc.maxValue,
            timing: pc.timing,
            isAmendableAtAccount: pc.isAmendableAtAccount,
            isEIRAmortized: pc.isEIRAmortized,
            authStatus: 'AUTHORIZED'
          }, { transaction });
        }
      }

      // Copy UDEs
      if (source.udes && source.udes.length > 0) {
        for (const pu of source.udes) {
          await db.lnProductUde.create({
            productId: newProduct.id,
            udeCode: pu.udeCode,
            defaultValue: pu.defaultValue,
            minValue: pu.minValue,
            maxValue: pu.maxValue,
            isAmendableAtAccount: pu.isAmendableAtAccount,
            authStatus: 'AUTHORIZED'
          }, { transaction });
        }
      }

      // Copy waterfall rules
      if (source.waterfallRules && source.waterfallRules.length > 0) {
        for (const wf of source.waterfallRules) {
          await db.lnWaterfallRule.create({
            productId: newProduct.id,
            accountStatus: wf.accountStatus,
            priorityOrder: wf.priorityOrder,
            componentId: wf.componentId,
            authStatus: 'AUTHORIZED'
          }, { transaction });
        }
      }

      await transaction.commit();
      return this.getProductById(newProduct.id);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};

module.exports = productService;
