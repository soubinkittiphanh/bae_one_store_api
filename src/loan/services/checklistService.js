/**
 * Go-live checklist. Each item is confirmed explicitly by a user with LN_CHECKLIST AUTHORIZE
 * and stored in ln_checklist_confirmation with a snapshot of the AUTHORIZED values confirmed.
 * When a related parameter change is authorized later, the item returns to UNCONFIRMED.
 * Descriptions are built from database values; nothing about rates or ranges is hard-coded.
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const paramService = require('./paramService');
const taxProfileService = require('./taxProfileService');
const { getEffective } = require('./paramReader');
const { getVatRate, today } = require('./taxRateService');

const ITEMS = [
  { itemKey: 'TAX_PROFILE', category: 'Tax & VAT (ລະບົບອາກອນ)', title: 'Tax profile & component taxability (ການກຳນົດອາກອນມູນຄ່າເພີ່ມ)', severity: 'BLOCKING', entities: [] },
  { itemKey: 'FEE_TREATMENT', category: 'Accounting policy (ນະໂຍບາຍບັນຊີ)', title: 'Fee treatment (ຮູບແບບການຮັບຮູ້ຄ່າທຳນຽມ)', severity: 'IMPORTANT', entities: ['product'], models: ['lnProduct'] },
  { itemKey: 'PROVISION_POLICY', category: 'Risk & provisioning (ນະໂຍບາຍສຳຮອງໜີ້)', title: 'Provision rates - company policy (ອັດຕາສຳຮອງໜີ້ຕາມນະໂຍບາຍບໍລິສັດ)', severity: 'WARNING', entities: ['provision-rule', 'regulatory-class'], models: ['lnProvisionRule', 'lnRegulatoryClass'] },
  { itemKey: 'DPD_CLASSIFICATION', category: 'Credit operations (ການຈັດຊັ້ນໜີ້)', title: 'DPD ranges & status rules (ຊ່ວງວັນຄ້າງຊຳລະ)', severity: 'WARNING', entities: ['status', 'status-movement-rule', 'status-cure-rule'], models: ['lnStatusMaster', 'lnStatusMovementRule', 'lnStatusCureRule'] },
  { itemKey: 'ENTRY_RULES', category: 'Accounting setup (ການຕັ້ງຄ່າບັນຊີ)', title: 'Accounting entry rules (ກົດການບັນທຶກບັນຊີ)', severity: 'IMPORTANT', entities: ['accounting-entry-rule', 'event', 'amount-tag'], models: ['lnAccountingEntryRule'] },
  { itemKey: 'GL_MAPPINGS', category: 'GL integration (ການເຊື່ອມໂຍງຜັງບັນຊີ)', title: 'Accounting role to GL account mappings (ການເຊື່ອມບົດບາດກັບບັນຊີ)', severity: 'IMPORTANT', entities: ['role-gl-mapping'], models: ['lnRoleGlMapping'] }
];

// '0.010000' -> '1%' (string shift, no floats)
const pct = (rate) => {
  const [i, f = ''] = String(rate).split('.');
  const frac = f.padEnd(2, '0');
  const whole = String(Number(i + frac.slice(0, 2)));
  const rest = frac.slice(2).replace(/0+$/, '');
  return `${whole}${rest ? `.${rest}` : ''}%`;
};

const snapshots = {
  async FEE_TREATMENT() {
    const products = await db.lnProduct.findAll({
      where: { authStatus: 'AUTHORIZED', status: { [db.Sequelize.Op.ne]: 'SUPERSEDED' } },
      attributes: ['productCode', 'version', 'feeFinancingMode', 'deferredFeePresentation'],
      order: [['productCode', 'ASC']]
    });
    return products.map(p => ({ productCode: p.productCode, version: p.version, feeFinancingMode: p.feeFinancingMode, deferredFeePresentation: p.deferredFeePresentation }));
  },
  async PROVISION_POLICY() {
    const rules = await getEffective(db.lnProvisionRule, {}, today());
    return rules.map(r => ({
      regulatoryClassCode: r.regulatoryClassCode, productId: r.productId, categoryId: r.categoryId,
      provisionRate: String(r.provisionRate), collateralHaircutPct: String(r.collateralHaircutPct),
      provisionBase: r.provisionBase, policyNote: r.policyNote
    })).sort((a, b) => a.regulatoryClassCode.localeCompare(b.regulatoryClassCode));
  },
  async ENTRY_RULES() {
    const rules = await getEffective(db.lnAccountingEntryRule, {}, today());
    return rules.map(r => ({
      eventCode: r.eventCode, amountTag: r.amountTag, drCr: r.drCr, roleCode: r.roleCode, qualifierSource: r.qualifierSource,
      isActive: Boolean(r.isActive), feeModeFilter: r.feeModeFilter, presentationFilter: r.presentationFilter, targetFilter: r.targetFilter,
      productId: r.productId, categoryId: r.categoryId
    })).sort((a, b) => `${a.eventCode} ${a.amountTag} ${a.drCr} ${a.roleCode}`.localeCompare(`${b.eventCode} ${b.amountTag} ${b.drCr} ${b.roleCode}`));
  },
  async GL_MAPPINGS() {
    const rows = await getEffective(db.lnRoleGlMapping, {}, today());
    return rows.map(r => ({
      roleCode: r.roleCode, statusQualifier: r.statusQualifier, chartAccountId: r.chartAccountId,
      productId: r.productId, categoryId: r.categoryId, branchId: r.branchId, currencyId: r.currencyId
    })).sort((a, b) => `${a.roleCode} ${a.statusQualifier}`.localeCompare(`${b.roleCode} ${b.statusQualifier}`));
  },
  async DPD_CLASSIFICATION() {
    const rules = await getEffective(db.lnStatusMovementRule, {}, today());
    return rules.map(r => ({ fromStatus: r.fromStatus, toStatus: r.toStatus, minDpd: r.minDpd, maxDpd: r.maxDpd }))
      .sort((a, b) => a.minDpd - b.minDpd);
  }
};

const describe = {
  FEE_TREATMENT: (s) => (s.length
    ? s.map(p => `${p.productCode} v${p.version}: ${p.feeFinancingMode} / ${p.deferredFeePresentation}`).join('; ')
    : 'No authorized products yet'),
  PROVISION_POLICY: (s) => (s.length
    ? `Company policy (not regulation): ${s.map(r => `${r.regulatoryClassCode} ${pct(r.provisionRate)}`).join(', ')}`
    : 'No authorized provision rules yet'),
  ENTRY_RULES: (s) => (s.length
    ? `${s.length} authorized entry rules (${s.filter(r => r.isActive).length} active, ${s.filter(r => !r.isActive).length} inactive options) across ${new Set(s.map(r => r.eventCode)).size} events`
    : 'No authorized entry rules yet'),
  GL_MAPPINGS: (s) => (s.length
    ? `${s.length} authorized mappings covering ${new Set(s.map(r => r.roleCode)).size} accounting roles`
    : 'No authorized role-to-GL mappings yet (accounts still to be confirmed by the accountant)'),
  DPD_CLASSIFICATION: (s) => (s.length
    ? s.map(r => `${r.fromStatus} -> ${r.toStatus}: ${r.minDpd}-${r.maxDpd} DPD`).join('; ')
    : 'No authorized DPD rules yet')
};

const pendingCount = async (item) => {
  let count = 0;
  for (const model of item.models || []) count += await db[model].count({ where: { authStatus: 'PENDING' } });
  count += await db.lnParamChange.count({ where: { entityName: item.entities, status: 'PENDING' } });
  return count;
};

const rowFor = async (itemKey, transaction) => {
  const [row] = await db.lnChecklistConfirmation.findOrCreate({
    where: { itemKey },
    defaults: { itemKey, status: 'UNCONFIRMED' },
    transaction
  });
  return row;
};

const audit = (itemKey, actionType, newValues, ctx, transaction) => db.lnAuditLog.create({
  entityName: 'checklist', entityKey: itemKey, actionType,
  newValuesJson: newValues ? JSON.stringify(newValues) : null,
  userId: (ctx && ctx.userId) || 0, ipAddress: (ctx && ctx.ip) || null, timestamp: new Date()
}, { transaction });

const checklistService = {
  async getChecklist() {
    const profile = await db.lnTaxProfile.findOne();
    const rows = Object.fromEntries((await db.lnChecklistConfirmation.findAll()).map(r => [r.itemKey, r]));
    const items = [];
    for (const item of ITEMS) {
      const row = rows[item.itemKey];
      const entry = { itemKey: item.itemKey, category: item.category, title: item.title, severity: item.severity };
      if (item.itemKey === 'TAX_PROFILE') {
        let vatText;
        try {
          const vat = await getVatRate(today());
          vatText = `POS tax ${vat.code} ${pct(vat.rate)}`;
        } catch (err) {
          if (!(err instanceof LoanError)) throw err;
          vatText = err.message;
        }
        const confirmed = profile && profile.confirmationStatus === 'CONFIRMED';
        Object.assign(entry, {
          status: confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
          description: `${profile && profile.companyVatRegistered ? 'VAT registered' : 'Not VAT registered'}; ${vatText}`,
          confirmedBy: profile ? profile.confirmedBy : null,
          confirmedAt: profile ? profile.confirmedAt : null
        });
      } else if (item.held) {
        const [roles, mappings] = await Promise.all([db.lnAccountingRole.count(), db.lnRoleGlMapping.count()]);
        Object.assign(entry, { status: 'HELD', description: `${roles} accounting roles, ${mappings} GL mappings. Held until the Rev 5 accounting addendum is confirmed.` });
      } else {
        const snapshot = await snapshots[item.itemKey]();
        Object.assign(entry, {
          status: row ? row.status : 'UNCONFIRMED',
          description: describe[item.itemKey](snapshot),
          pendingChanges: await pendingCount(item),
          confirmedBy: row ? row.confirmedBy : null,
          confirmedAt: row ? row.confirmedAt : null
        });
      }
      items.push(entry);
    }
    const taxConfirmed = items[0].status === 'CONFIRMED';
    return {
      checklistItems: items,
      allConfirmed: items.filter(i => i.severity !== 'HOLD').every(i => i.status === 'CONFIRMED'),
      canDisburse: taxConfirmed,
      warningBannerActive: !taxConfirmed
    };
  },

  async confirmItem(itemKey, ctx) {
    const item = ITEMS.find(i => i.itemKey === itemKey);
    if (!item) throw new LoanError(404, `Unknown checklist item ${itemKey}`);
    if (item.held) throw new LoanError(409, `${itemKey} is held until Phase 2B`);
    if (itemKey === 'TAX_PROFILE') {
      await taxProfileService.confirmTaxProfile(ctx);
      return checklistService.getChecklist();
    }
    if (await pendingCount(item)) throw new LoanError(409, `Authorize or reject the pending ${item.entities.join('/')} changes before confirming ${itemKey}`);
    const snapshot = await snapshots[itemKey]();
    if (!snapshot.length) throw new LoanError(409, `Nothing authorized to confirm for ${itemKey}`);
    await db.sequelize.transaction(async (transaction) => {
      const row = await rowFor(itemKey, transaction);
      await row.update({ status: 'CONFIRMED', confirmedBy: ctx.userId, confirmedAt: new Date(), snapshotJson: JSON.stringify(snapshot) }, { transaction });
      await audit(itemKey, 'CONFIRM', snapshot, ctx, transaction);
    });
    return checklistService.getChecklist();
  },

  // Called after any parameter authorization; resets the related confirmed item
  async invalidate(entityName) {
    const item = ITEMS.find(i => !i.held && i.entities.includes(entityName));
    if (!item) return;
    const row = await db.lnChecklistConfirmation.findOne({ where: { itemKey: item.itemKey } });
    if (!row || row.status !== 'CONFIRMED') return;
    if (item.itemKey === 'FEE_TREATMENT') {
      // Only a change to the fee settings themselves resets this item
      const current = JSON.stringify(await snapshots.FEE_TREATMENT());
      if (current === row.snapshotJson) return;
    }
    await row.update({ status: 'UNCONFIRMED', confirmedBy: null, confirmedAt: null });
    await audit(item.itemKey, 'RESET', { reason: `${entityName} change authorized` });
  }
};

paramService.onAuthorized((entityName) => checklistService.invalidate(entityName));

module.exports = checklistService;
