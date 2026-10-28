const db = require('../../models');
const logger = require('../../api/logger');

const taxProfileService = {
  /**
   * Get the current tax profile and component tax settings
   */
  async getTaxProfile() {
    let profile = await db.lnTaxProfile.findOne();
    if (!profile) {
      // Fallback: check system POS tax
      const defaultTax = await db.tax.findOne({ where: { isDefault: true, isActive: true } });
      const configuredRate = defaultTax ? parseFloat(defaultTax.rate) : 0.100000;
      profile = await db.lnTaxProfile.create({
        companyVatRegistered: true,
        confirmationStatus: 'UNCONFIRMED',
        defaultVatRate: configuredRate,
        warningBannerActive: true,
        notes: 'Auto-seeded from POS tax table'
      });
    }

    const components = await db.lnComponent.findAll({
      attributes: ['id', 'componentCode', 'name', 'componentType', 'calculationBasis', 'isTaxable', 'taxCode', 'taxInclusive', 'taxPointEvent', 'authStatus'],
      order: [['id', 'ASC']]
    });

    const taxMaster = await db.lnTaxMaster.findAll({
      order: [['effectiveFrom', 'DESC']]
    });

    return {
      taxProfile: profile,
      components,
      taxMaster,
      isConfirmed: profile.confirmationStatus === 'CONFIRMED',
      warningBannerActive: profile.confirmationStatus === 'UNCONFIRMED' || profile.warningBannerActive
    };
  },

  /**
   * Update VAT Profile settings
   */
  async updateTaxProfile(data, userId) {
    let profile = await db.lnTaxProfile.findOne();
    if (!profile) {
      profile = await db.lnTaxProfile.create(data);
    } else {
      await profile.update({
        companyVatRegistered: data.companyVatRegistered !== undefined ? data.companyVatRegistered : profile.companyVatRegistered,
        defaultVatRate: data.defaultVatRate !== undefined ? data.defaultVatRate : profile.defaultVatRate,
        taxPayableAccountId: data.taxPayableAccountId !== undefined ? data.taxPayableAccountId : profile.taxPayableAccountId,
        notes: data.notes !== undefined ? data.notes : profile.notes,
        // Any change returns confirmationStatus to UNCONFIRMED if not explicitly confirmed
        confirmationStatus: data.confirmationStatus || 'UNCONFIRMED',
        warningBannerActive: (data.confirmationStatus || 'UNCONFIRMED') === 'UNCONFIRMED'
      });
    }
    return profile;
  },

  /**
   * Confirm Tax Profile
   */
  async confirmTaxProfile(userId) {
    let profile = await db.lnTaxProfile.findOne();
    if (!profile) {
      profile = await db.lnTaxProfile.create({
        companyVatRegistered: true,
        confirmationStatus: 'CONFIRMED',
        confirmedBy: userId,
        confirmedAt: new Date(),
        warningBannerActive: false
      });
    } else {
      await profile.update({
        confirmationStatus: 'CONFIRMED',
        confirmedBy: userId,
        confirmedAt: new Date(),
        warningBannerActive: false
      });
    }
    logger.info(`Tax Profile CONFIRMED by user ${userId}`);
    return profile;
  },

  /**
   * Update individual component taxability
   */
  async updateComponentTax(componentId, data, userId) {
    const comp = await db.lnComponent.findByPk(componentId);
    if (!comp) {
      throw new Error(`Component with ID ${componentId} not found`);
    }

    await comp.update({
      isTaxable: data.isTaxable !== undefined ? data.isTaxable : comp.isTaxable,
      taxCode: data.taxCode !== undefined ? data.taxCode : comp.taxCode,
      taxInclusive: data.taxInclusive !== undefined ? data.taxInclusive : comp.taxInclusive,
      taxPointEvent: data.taxPointEvent !== undefined ? data.taxPointEvent : comp.taxPointEvent,
      checkerId: userId
    });

    return comp;
  },

  /**
   * Generate VAT report for Loan Module
   */
  async getVatReport(filters = {}) {
    const { startDate, endDate, branchId } = filters;
    // Query tax transactions from transaction allocation where component is tax
    // or tax master records.
    const whereTxn = {};
    if (startDate && endDate) {
      whereTxn.businessDate = {
        [db.Sequelize.Op.between]: [startDate, endDate]
      };
    }
    if (branchId) {
      whereTxn.branchId = branchId;
    }

    const allocations = await db.lnTransactionAllocation.findAll({
      include: [
        {
          model: db.lnTransaction,
          as: 'transaction',
          where: whereTxn,
          attributes: ['id', 'txnNumber', 'businessDate', 'eventCode', 'currencyId', 'accountId', 'reversalStatus']
        },
        {
          model: db.lnComponent,
          as: 'component',
          attributes: ['componentCode', 'name', 'isTaxable', 'taxCode', 'taxPointEvent']
        }
      ]
    }).catch(() => []);

    return {
      summary: {
        totalTaxableBase: 0,
        totalVatAmount: 0,
        componentBreakdown: []
      },
      records: allocations
    };
  }
};

module.exports = taxProfileService;
