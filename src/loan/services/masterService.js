const db = require('../../models');

const masterService = {
  /**
   * Get all 10 system lookups in a single call for parameter studio dropdowns
   */
  async getLookups() {
    const [
      loanTypes,
      frequencies,
      disbursementTargets,
      holidayHandlings,
      dayCounts,
      rebateMethods,
      accrualMethods,
      collateralTypes,
      loanPurposes,
      deferredFeePresentations
    ] = await Promise.all([
      db.lnLookupLoanType.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupFrequency.findAll({ order: [['daysInterval', 'ASC']] }),
      db.lnLookupDisbursementTarget.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupHolidayHandling.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupDayCount.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupRebateMethod.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupAccrualMethod.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupCollateralType.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupLoanPurpose.findAll({ order: [['code', 'ASC']] }),
      db.lnLookupDeferredFeePresentation.findAll({ order: [['code', 'ASC']] })
    ]);

    return {
      loanTypes,
      frequencies,
      disbursementTargets,
      holidayHandlings,
      dayCounts,
      rebateMethods,
      accrualMethods,
      collateralTypes,
      loanPurposes,
      deferredFeePresentations
    };
  },

  /**
   * Get Master UDEs
   */
  async getUdes() {
    return db.lnUde.findAll({ order: [['udeCode', 'ASC']] });
  },

  /**
   * Get Components
   */
  async getComponents() {
    return db.lnComponent.findAll({ order: [['id', 'ASC']] });
  },

  /**
   * Get Regulatory Classes and Provision Rules
   */
  async getProvisionRules() {
    const [regClasses, rules] = await Promise.all([
      db.lnRegulatoryClass.findAll({ order: [['classCode', 'ASC']] }),
      db.lnProvisionRule.findAll({
        include: [{ model: db.lnRegulatoryClass, as: 'regulatoryClass' }],
        order: [['regulatoryClassCode', 'ASC']]
      }).catch(() => db.lnProvisionRule.findAll({ order: [['regulatoryClassCode', 'ASC']] }))
    ]);

    return { regClasses, rules };
  },

  /**
   * Update Provision Rule
   */
  async updateProvisionRule(id, data, userId) {
    const rule = await db.lnProvisionRule.findByPk(id);
    if (!rule) {
      throw new Error(`Provision rule with ID ${id} not found`);
    }

    await rule.update({
      provisionRate: data.provisionRate !== undefined ? data.provisionRate : rule.provisionRate,
      collateralHaircutPct: data.collateralHaircutPct !== undefined ? data.collateralHaircutPct : rule.collateralHaircutPct,
      provisionBase: data.provisionBase || rule.provisionBase
    });

    return rule;
  },

  /**
   * Get Status Master & Movement Rules
   */
  async getStatusRules() {
    const [statuses, movements] = await Promise.all([
      db.lnStatusMaster.findAll({ order: [['statusCode', 'ASC']] }),
      db.lnStatusMovementRule.findAll({ order: [['minDpd', 'ASC']] })
    ]);

    return { statuses, movements };
  },

  /**
   * Get Accounting Roles & Events (Phase 2A metadata inspection)
   */
  async getAccountingMetadata() {
    const [roles, amountTags, events] = await Promise.all([
      db.lnAccountingRole.findAll({ order: [['roleCode', 'ASC']] }),
      db.lnAmountTag.findAll({ order: [['tagCode', 'ASC']] }),
      db.lnEventMaster.findAll({ order: [['eventCode', 'ASC']] })
    ]);

    return { roles, amountTags, events };
  },

  /**
   * Get Numbering Sequences
   */
  async getSequences() {
    return db.lnNumberingSequence.findAll({ order: [['sequenceCode', 'ASC']] });
  },

  /**
   * Get Holiday Calendars
   */
  async getHolidayCalendars() {
    return db.lnHolidayCalendar.findAll({
      include: [{ model: db.lnHolidayDate, as: 'holidays' }],
      order: [['calendarCode', 'ASC']]
    }).catch(() => db.lnHolidayCalendar.findAll());
  }
};

module.exports = masterService;
