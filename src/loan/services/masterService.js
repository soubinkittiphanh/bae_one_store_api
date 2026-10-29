const db = require('../../models');
const { ENTITIES } = require('./paramRegistry');

// Lists include every authStatus so the Parameter Studio can show pending rows;
// pass authStatus=AUTHORIZED (the default for dropdown lookups) to restrict.
const statusWhere = (query = {}, defaultStatus) => {
  const status = query.authStatus || defaultStatus;
  return status ? { authStatus: String(status).split(',') } : {};
};

const LOOKUP_MODELS = {
  loanTypes: 'lnLookupLoanType',
  frequencies: 'lnLookupFrequency',
  disbursementTargets: 'lnLookupDisbursementTarget',
  holidayHandlings: 'lnLookupHolidayHandling',
  dayCounts: 'lnLookupDayCount',
  rebateMethods: 'lnLookupRebateMethod',
  accrualMethods: 'lnLookupAccrualMethod',
  collateralTypes: 'lnLookupCollateralType',
  loanPurposes: 'lnLookupLoanPurpose',
  deferredFeePresentations: 'lnLookupDeferredFeePresentation'
};

const masterService = {
  // All lookups for Parameter Studio dropdowns; AUTHORIZED only unless includePending=1
  async getLookups(query = {}) {
    const where = query.includePending === '1' ? {} : { authStatus: 'AUTHORIZED' };
    const entries = await Promise.all(Object.entries(LOOKUP_MODELS).map(async ([key, model]) => (
      [key, await db[model].findAll({ where, order: [['code', 'ASC']] })]
    )));
    // Fixed value lists defined by the engine (registry), keyed "<entity>.<field>", so UIs never hard-code them
    const enums = {};
    for (const [entity, def] of Object.entries(ENTITIES)) {
      for (const [field, spec] of Object.entries(def.fields || {})) {
        if (spec.enum) enums[`${entity}.${field}`] = spec.enum;
      }
    }
    return { ...Object.fromEntries(entries), enums };
  },

  async getUdes(query) {
    return db.lnUde.findAll({ where: statusWhere(query), order: [['udeCode', 'ASC']] });
  },

  async getComponents(query) {
    return db.lnComponent.findAll({ where: statusWhere(query), order: [['id', 'ASC']] });
  },

  async getProvisionRules(query) {
    const [regClasses, rules] = await Promise.all([
      db.lnRegulatoryClass.findAll({ where: statusWhere(query), order: [['classCode', 'ASC']] }),
      db.lnProvisionRule.findAll({
        where: statusWhere(query),
        include: [{ model: db.lnRegulatoryClass, as: 'regulatoryClass' }],
        order: [['regulatoryClassCode', 'ASC'], ['effectiveFrom', 'DESC']]
      })
    ]);
    return { regClasses, rules };
  },

  async getStatusRules(query) {
    const [statuses, movements, cures] = await Promise.all([
      db.lnStatusMaster.findAll({ where: statusWhere(query), order: [['statusCode', 'ASC']] }),
      db.lnStatusMovementRule.findAll({ where: statusWhere(query), order: [['minDpd', 'ASC']] }),
      db.lnStatusCureRule.findAll({ where: statusWhere(query), order: [['id', 'ASC']] })
    ]);
    return { statuses, movements, cures };
  },

  // Accounting roles, tags and events (Phase 2A: inspection only)
  async getAccountingMetadata() {
    const [roles, amountTags, events] = await Promise.all([
      db.lnAccountingRole.findAll({ order: [['roleCode', 'ASC']] }),
      db.lnAmountTag.findAll({ order: [['tagCode', 'ASC']] }),
      db.lnEventMaster.findAll({ order: [['eventCode', 'ASC']] })
    ]);
    return { roles, amountTags, events };
  },

  async getSequences() {
    return db.lnNumberingSequence.findAll({ order: [['sequenceCode', 'ASC']] });
  },

  async getHolidayCalendars() {
    return db.lnHolidayCalendar.findAll({
      include: [{ model: db.lnHolidayDate, as: 'dates' }],
      order: [['calendarCode', 'ASC']]
    });
  }
};

module.exports = masterService;
