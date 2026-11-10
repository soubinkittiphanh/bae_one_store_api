const db = require('../../models');
const { LoanError } = require('../errors');
const { getVatRate, today } = require('./taxRateService');
const { whereScope } = require('./branchScope');

const EDITABLE = ['companyVatRegistered', 'posTaxId', 'notes'];
const plain = (row) => (row && row.toJSON ? row.toJSON() : row);

const audit = (actionType, oldValues, newValues, ctx, transaction) => db.lnAuditLog.create({
  entityName: 'tax-profile', entityKey: 'TAX_PROFILE', actionType,
  oldValuesJson: oldValues ? JSON.stringify(oldValues) : null,
  newValuesJson: newValues ? JSON.stringify(newValues) : null,
  userId: ctx.userId || 0, ipAddress: ctx.ip || null, timestamp: new Date()
}, { transaction });

const selfAuthorizeAllowed = async (transaction) => {
  const param = await db.spf.findOne({ where: { code: 'LOAN_ALLOW_SELF_AUTHORIZE' }, transaction });
  return Boolean(param && param.isActive !== false && String(param.value).trim().toLowerCase() === 'true');
};

// The TAX_PROFILE checklist row mirrors the profile's confirmation state
const mirrorChecklist = (status, ctx, snapshot, transaction) => db.lnChecklistConfirmation.update({
  status,
  confirmedBy: status === 'CONFIRMED' ? ctx.userId : null,
  confirmedAt: status === 'CONFIRMED' ? new Date() : null,
  snapshotJson: snapshot ? JSON.stringify(snapshot) : null
}, { where: { itemKey: 'TAX_PROFILE' }, transaction });

const loadProfile = async (transaction) => {
  const profile = await db.lnTaxProfile.findOne({ transaction });
  if (!profile) throw new LoanError(404, 'Tax profile is missing; run the loan seed');
  return profile;
};

const taxProfileService = {
  async getTaxProfile() {
    const profile = await loadProfile();
    let vat = null;
    let vatError = null;
    try {
      vat = await getVatRate(today());
    } catch (err) {
      if (!(err instanceof LoanError)) throw err;
      vatError = err.message;
    }
    const [components, taxMaster, posTaxes] = await Promise.all([
      db.lnComponent.findAll({
        attributes: ['id', 'componentCode', 'name', 'componentType', 'isTaxable', 'taxCode', 'taxInclusive', 'taxPointEvent', 'authStatus'],
        order: [['id', 'ASC']]
      }),
      db.lnTaxMaster.findAll({ order: [['taxCode', 'ASC'], ['effectiveFrom', 'DESC']] }),
      db.tax.findAll({ where: { isActive: true }, attributes: ['id', 'code', 'name', 'rate', 'isDefault', 'effectiveFrom', 'effectiveTo'] })
    ]);
    const isConfirmed = profile.confirmationStatus === 'CONFIRMED';
    return { taxProfile: profile, vat, vatError, posTaxes, components, taxMaster, isConfirmed, warningBannerActive: !isConfirmed };
  },

  // Minimal state for the warning banner shown on every loan screen
  async getStatus() {
    const profile = await db.lnTaxProfile.findOne({ attributes: ['confirmationStatus'] });
    const confirmationStatus = profile ? profile.confirmationStatus : 'UNCONFIRMED';
    return { confirmationStatus, warningBannerActive: confirmationStatus !== 'CONFIRMED' };
  },

  // Only companyVatRegistered, posTaxId and notes can change; confirmationStatus is ignored.
  // Any change returns the profile to UNCONFIRMED.
  async updateTaxProfile(body, ctx) {
    const input = body && typeof body === 'object' ? body : {};
    const values = {};
    for (const k of EDITABLE) if (input[k] !== undefined) values[k] = input[k];
    if (values.companyVatRegistered !== undefined) {
      if (![true, false, 'true', 'false', 0, 1].includes(values.companyVatRegistered)) throw new LoanError(400, 'companyVatRegistered must be true or false');
      values.companyVatRegistered = values.companyVatRegistered === true || values.companyVatRegistered === 'true' || values.companyVatRegistered === 1;
    }
    if (values.posTaxId !== undefined) {
      if (!/^\d+$/.test(String(values.posTaxId))) throw new LoanError(400, 'posTaxId must be a POS tax id');
      const tax = await db.tax.findOne({ where: { id: values.posTaxId, isActive: true } });
      if (!tax) throw new LoanError(400, `posTaxId ${values.posTaxId} is not an active POS tax`);
      values.posTaxId = Number(values.posTaxId);
    }
    if (values.notes !== undefined && values.notes !== null && String(values.notes).length > 5000) throw new LoanError(400, 'notes is too long');
    if (!Object.keys(values).length) throw new LoanError(400, 'No editable fields supplied (companyVatRegistered, posTaxId, notes)');

    return db.sequelize.transaction(async (transaction) => {
      const profile = await loadProfile(transaction);
      const before = plain(profile);
      await profile.update({
        ...values,
        confirmationStatus: 'UNCONFIRMED',
        confirmedBy: null,
        confirmedAt: null,
        warningBannerActive: true,
        lastModifiedBy: ctx.userId
      }, { transaction });
      await mirrorChecklist('UNCONFIRMED', ctx, null, transaction);
      await audit('UPDATE', before, plain(profile), ctx, transaction);
      return profile;
    });
  },

  // The confirmer needs LN_TAX_PROFILE AUTHORIZE and must not be the last editor,
  // unless LOAN_ALLOW_SELF_AUTHORIZE is 'true' (then it is audited as SELF_AUTH).
  async confirmTaxProfile(ctx) {
    return db.sequelize.transaction(async (transaction) => {
      const profile = await loadProfile(transaction);
      const vat = await getVatRate(today(), transaction);
      let self = false;
      if (profile.lastModifiedBy !== null && Number(profile.lastModifiedBy) === Number(ctx.userId)) {
        if (!(await selfAuthorizeAllowed(transaction))) {
          throw new LoanError(403, 'The last editor of the tax profile cannot confirm it (LOAN_ALLOW_SELF_AUTHORIZE is off)');
        }
        self = true;
      }
      const before = plain(profile);
      await profile.update({ confirmationStatus: 'CONFIRMED', confirmedBy: ctx.userId, confirmedAt: new Date(), warningBannerActive: false }, { transaction });
      const snapshot = { companyVatRegistered: profile.companyVatRegistered, posTaxId: profile.posTaxId, vat };
      await mirrorChecklist('CONFIRMED', ctx, snapshot, transaction);
      await audit(self ? 'SELF_AUTH' : 'AUTH', before, plain(profile), ctx, transaction);
      return profile;
    });
  },

  // VAT report skeleton: transactions are generated from Phase 3 on, so this returns no rows yet.
  // Phase 6: only transactions of the caller's branches; ?branchId narrows the scope in the router (scoped('list'))
  async getVatReport(filters = {}, scope) {
    const where = { ...whereScope(scope) };
    if (filters.startDate && filters.endDate) where.valueDate = { [db.Sequelize.Op.between]: [filters.startDate, filters.endDate] };
    const allocations = await db.lnTransactionAllocation.findAll({
      include: [
        { model: db.lnTransaction, as: 'transaction', where, attributes: ['id', 'txNo', 'valueDate', 'eventCode', 'currencyId', 'loanAccountId', 'isReversed'] },
        { model: db.lnComponent, as: 'component', attributes: ['componentCode', 'name', 'isTaxable', 'taxCode', 'taxPointEvent'] }
      ]
    });
    return { summary: { totalTaxableBase: '0.0000', totalVatAmount: '0.0000', componentBreakdown: [] }, records: allocations };
  }
};

module.exports = taxProfileService;
