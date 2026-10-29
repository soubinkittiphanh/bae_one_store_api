/**
 * Phase 3 Seed Script (run after the 2A and 2B seeds). Strictly idempotent.
 *
 * - Repayment-method lookup (system catalog, AUTHORIZED).
 * - Currency rounding rules (rounding-policy.md, UNCONFIRMED): LAK 0, USD 2, THB 2 decimals, PENDING,
 *   effective 2000-01-01, created only for currencies that exist. Untouched seeded PENDING rules are
 *   realigned to that date; authorized or user-made rules are never overwritten.
 * - Untouched seeded PENDING products get their repayment method (CAR-LOAN-FLAT -> FLAT).
 * - Default cure rules (decision D4, company policy, PENDING) where none exist for the status.
 * - Security functions LN_APPLICATION, LN_ACCOUNT, LN_CURRENCY_RULE granted to SUPER_ADMIN and ADMIN.
 * - No GL accounts, no role-to-GL mappings, no postings.
 */
process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_phase3');
const db = require('./src/models');
const { registerFunctions, grantToGroupCodes } = require('./src/security/grantService');

const AUTHORIZED = { authStatus: 'AUTHORIZED', authorizedAt: new Date() };
const PENDING = { authStatus: 'PENDING', makerId: null };

const reconcileLog = async (entityName, key, oldValues, newValues) => {
  await db.lnAuditLog.create({
    entityName, entityKey: String(key), actionType: 'SEED_RECONCILE',
    oldValuesJson: oldValues ? JSON.stringify(oldValues) : null,
    newValuesJson: newValues ? JSON.stringify(newValues) : null,
    userId: 0, timestamp: new Date()
  });
  console.log(`  reconciled ${entityName} ${key}: ${JSON.stringify(oldValues)} -> ${JSON.stringify(newValues)}`);
};

const REPAYMENT_METHODS = [
  { code: 'EQUAL_PRINCIPAL', name: 'Equal principal (ຕົ້ນເທົ່າກັນ)', description: 'Same principal every installment; interest on the declining balance' },
  { code: 'EQUAL_INSTALLMENT', name: 'Equal installment (ງວດເທົ່າກັນ)', description: 'Declining-balance annuity; optional balloon' },
  { code: 'FLAT', name: 'Flat rate (ດອກເບ້ຍຄົງທີ່)', description: 'Interest on the original principal, spread evenly' }
];

// rounding-policy.md §3 starting values (UNCONFIRMED); effective from 2000-01-01 so loans with
// earlier value dates (e.g. migrated loans) can be booked
const CURRENCY_DECIMALS = { LAK: 0, USD: 2, THB: 2 };
const RULE_EFFECTIVE_FROM = '2000-01-01';

const PRODUCT_REPAYMENT = { 'CAR-LOAN-DB': 'EQUAL_INSTALLMENT', 'CAR-LOAN-FLAT': 'FLAT', 'CAR-LOAN-BALLOON': 'EQUAL_INSTALLMENT' };

// Decision D4: performing statuses cure as soon as DPD allows; NPL statuses after 3 on-time installments
const CURE_RULES = [
  { fromStatus: 'WATCH', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 0, observationMonthsRequired: 0 },
  { fromStatus: 'SUBSTANDARD', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 3, observationMonthsRequired: 0 },
  { fromStatus: 'DOUBTFUL', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 3, observationMonthsRequired: 0 },
  { fromStatus: 'LOSS', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 3, observationMonthsRequired: 0 }
];

async function seedPhase3() {
  console.log('--- Starting Phase 3 Seeding ---');
  try {
    const mappingsBefore = await db.lnRoleGlMapping.count();

    for (const m of REPAYMENT_METHODS) {
      const [row, created] = await db.lnLookupRepaymentMethod.findOrCreate({ where: { code: m.code }, defaults: { ...m, ...AUTHORIZED } });
      if (!created && (row.name !== m.name || row.description !== m.description)) {
        await reconcileLog('lookup-repayment-method', m.code, { name: row.name }, { name: m.name });
        await row.update({ name: m.name, description: m.description });
      }
    }

    let rules = 0;
    for (const [code, decimalPlaces] of Object.entries(CURRENCY_DECIMALS)) {
      const currency = await db.currency.findOne({ where: { code } });
      if (!currency) continue;
      const [rule, created] = await db.lnCurrencyRule.findOrCreate({
        where: { currencyId: currency.id },
        defaults: { currencyId: currency.id, decimalPlaces, roundingMode: 'HALF_UP', effectiveFrom: RULE_EFFECTIVE_FROM, ...PENDING }
      });
      if (created) rules++;
      else if (rule.authStatus === 'PENDING' && rule.makerId == null && String(rule.effectiveFrom) !== RULE_EFFECTIVE_FROM) {
        await reconcileLog('currency-rule', code, { effectiveFrom: String(rule.effectiveFrom) }, { effectiveFrom: RULE_EFFECTIVE_FROM });
        await rule.update({ effectiveFrom: RULE_EFFECTIVE_FROM });
      }
    }
    console.log(`Currency rounding rules: ${rules} created PENDING`);

    for (const [productCode, method] of Object.entries(PRODUCT_REPAYMENT)) {
      const rows = await db.lnProduct.findAll({ where: { productCode, authStatus: 'PENDING', makerId: null } });
      for (const p of rows) {
        if (p.repaymentMethodCode === method) continue;
        await reconcileLog('product', `${productCode} v${p.version}`, { repaymentMethodCode: p.repaymentMethodCode }, { repaymentMethodCode: method });
        await p.update({ repaymentMethodCode: method });
      }
    }

    let cures = 0;
    for (const c of CURE_RULES) {
      if (await db.lnStatusCureRule.count({ where: { fromStatus: c.fromStatus } })) continue;
      await db.lnStatusCureRule.create({ ...c, ...PENDING });
      cures++;
    }
    console.log(`Cure rules: ${cures} created PENDING`);

    const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'AUTHORIZE'];
    const functions = [
      { functionCode: 'LN_APPLICATION', name: 'Loan applications', llname: 'ຄຳຮ້ອງສິນເຊື່ອ', actions: ['VIEW', 'CREATE', 'EDIT', 'AUTHORIZE'] },
      { functionCode: 'LN_ACCOUNT', name: 'Loan accounts (booking and previews)', llname: 'ບັນຊີສິນເຊື່ອ', actions: ['VIEW', 'CREATE'] },
      { functionCode: 'LN_CURRENCY_RULE', name: 'Currency rounding rules', llname: 'ກົດການປັດເສດສະກຸນເງິນ', actions: ACTIONS }
    ];
    await registerFunctions(db, 'LN', functions);
    const grants = await grantToGroupCodes(db, ['SUPER_ADMIN', 'ADMIN'], functions.map(f => f.functionCode));
    console.log(`Phase 3 grants: ${grants.join(', ') || 'none'}`);

    if (await db.lnRoleGlMapping.count() !== mappingsBefore) throw new Error('Role-to-GL mappings changed; Phase 3 must not create them');
    console.log('--- Phase 3 Seeding Completed ---');
    process.exit(0);
  } catch (err) {
    console.error('Phase 3 Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase3();
