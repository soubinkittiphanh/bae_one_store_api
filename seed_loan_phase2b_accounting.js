/**
 * Phase 2B Accounting Seed Script (run after seed_loan_phase2a_data.js)
 * Strictly idempotent. See docs/loan/rev5-accounting-addendum.md (revision 2) §7.
 *
 * - Catalog additions (events, amount tags, interest-recognition lookup) are upserted AUTHORIZED.
 * - Entry rules are created PENDING (global scope) and need a checker; existing rules are never
 *   overwritten. Deferred-fee rules and every leg touching PENALTY_RECEIVABLE are isActive = 0.
 * - Status penalty treatment defaults to MEMO_ONLY: untouched seeded PENDING statuses are aligned;
 *   anything a user created or authorized is left alone (change it in the Parameter Studio).
 * - Go-live checklist items ENTRY_RULES and GL_MAPPINGS (GL_MAPPINGS replaces the held GL_ROLE_MAPPINGS row).
 * - NO GL accounts and NO ln_role_gl_mapping rows are created.
 */
process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_phase2b_accounting');
const db = require('./src/models');
const { registerFunctions, grantToGroupCodes } = require('./src/security/grantService');
const catalog = require('./src/loan/accounting/catalog');

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });
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

// System catalog: create AUTHORIZED, or align an existing row with the catalog values
const upsertCatalog = async (model, where, values, entityName) => {
  const [row, created] = await model.findOrCreate({ where, defaults: { ...values, ...AUTHORIZED } });
  if (created) return 1;
  const diff = Object.fromEntries(Object.entries(values).filter(([k, v]) => String(row[k]) !== String(v)));
  if (Object.keys(diff).length) {
    await reconcileLog(entityName, Object.values(where).join('|'), Object.fromEntries(Object.keys(diff).map(k => [k, row[k]])), diff);
    await row.update(diff);
  }
  return 0;
};

async function seedPhase2B() {
  console.log('--- Starting Phase 2B Accounting Seeding ---');
  try {
    const mappingsBefore = await db.lnRoleGlMapping.count();
    const accountsBefore = await db.chartAccount.count();

    // 1. Catalog additions
    let added = 0;
    for (const ev of catalog.EVENTS) added += await upsertCatalog(db.lnEventMaster, { eventCode: ev.eventCode }, ev, 'event');
    for (const [tagCode, name] of Object.entries(catalog.TAGS)) added += await upsertCatalog(db.lnAmountTag, { tagCode }, { tagCode, name }, 'amount-tag');
    for (const lk of catalog.INTEREST_RECOGNITION) added += await upsertCatalog(db.lnLookupInterestRecognition, { code: lk.code }, lk, 'lookup-interest-recognition');
    console.log(`Catalog additions: ${added} new row(s)`);

    // 2. Penalty treatment MEMO_ONLY (cash basis) for active statuses
    for (const statusCode of catalog.MEMO_PENALTY_STATUSES) {
      const row = await db.lnStatusMaster.findOne({ where: { statusCode } });
      if (!row) { console.warn(`  status ${statusCode} not found; run seed_loan_phase2a_data.js first`); continue; }
      if (row.penaltyTreatment === 'MEMO_ONLY') continue;
      if (row.authStatus === 'PENDING' && row.makerId == null) {
        await reconcileLog('status', statusCode, { penaltyTreatment: row.penaltyTreatment }, { penaltyTreatment: 'MEMO_ONLY' });
        await row.update({ penaltyTreatment: 'MEMO_ONLY' });
      } else {
        console.warn(`  status ${statusCode} is ${row.authStatus} with penaltyTreatment ${row.penaltyTreatment}; left unchanged (edit it in the Parameter Studio)`);
      }
    }

    // 3. Entry rules (global scope, PENDING). Matched without effectiveFrom so re-runs never duplicate.
    let created = 0;
    for (const r of catalog.ENTRY_RULES) {
      const where = {
        productId: null, categoryId: null,
        eventCode: r.eventCode, amountTag: r.amountTag, drCr: r.drCr, roleCode: r.roleCode, qualifierSource: r.qualifierSource,
        feeModeFilter: r.feeModeFilter, presentationFilter: r.presentationFilter, targetFilter: r.targetFilter
      };
      const [, isNew] = await db.lnAccountingEntryRule.findOrCreate({ where, defaults: { ...where, isActive: r.isActive, effectiveFrom: today, ...PENDING } });
      if (isNew) created++;
    }
    const inactive = catalog.ENTRY_RULES.filter(r => !r.isActive).length;
    console.log(`Entry rules: ${created} created PENDING (${catalog.ENTRY_RULES.length} in catalog, ${inactive} inactive options)`);

    // 4. Security: entry rules, events and tags are maintained under LN_ENTRY_RULE (maker-checker).
    //    LN_ACCOUNTING_SETUP (roles, GL mappings) stays view-only: no GL mappings in Phase 2B.
    await registerFunctions(db, 'LN', [
      { functionCode: 'LN_ENTRY_RULE', name: 'Accounting entry rules, events and amount tags', llname: 'ກົດການບັນທຶກບັນຊີ', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'AUTHORIZE'] }
    ]);
    const grantSummary = await grantToGroupCodes(db, ['SUPER_ADMIN', 'ADMIN'], ['LN_ENTRY_RULE']);
    console.log(`Entry rule grants: ${grantSummary.join(', ') || 'none'}`);

    // 5. Go-live checklist: ENTRY_RULES and GL_MAPPINGS (confirmed one by one; GL_MAPPINGS replaces the held GL_ROLE_MAPPINGS)
    const oldGl = await db.lnChecklistConfirmation.findOne({ where: { itemKey: 'GL_ROLE_MAPPINGS' } });
    if (oldGl) {
      if (await db.lnChecklistConfirmation.findOne({ where: { itemKey: 'GL_MAPPINGS' } })) {
        await reconcileLog('checklist', 'GL_ROLE_MAPPINGS', { itemKey: 'GL_ROLE_MAPPINGS', status: oldGl.status }, { deleted: true, replacedBy: 'GL_MAPPINGS' });
        await oldGl.destroy();
      } else {
        await reconcileLog('checklist', 'GL_ROLE_MAPPINGS', { itemKey: 'GL_ROLE_MAPPINGS', status: oldGl.status }, { itemKey: 'GL_MAPPINGS', status: 'UNCONFIRMED' });
        await oldGl.update({ itemKey: 'GL_MAPPINGS', status: 'UNCONFIRMED', confirmedBy: null, confirmedAt: null, snapshotJson: null });
      }
    }
    for (const itemKey of ['ENTRY_RULES', 'GL_MAPPINGS']) {
      await db.lnChecklistConfirmation.findOrCreate({ where: { itemKey }, defaults: { itemKey, status: 'UNCONFIRMED' } });
    }

    // 6. Output VAT account parameter: empty until the accountant decides (never overwritten)
    await db.spf.findOrCreate({
      where: { code: 'GL_MAP_VAT_OUTPUT_ACC' },
      defaults: {
        code: 'GL_MAP_VAT_OUTPUT_ACC',
        value: '',
        remark: 'Loan module: chart_of_account number for output VAT payable (TAX_PAYABLE role). Open decision for the accountant.',
        isActive: true
      }
    });

    if (await db.lnRoleGlMapping.count() !== mappingsBefore || await db.chartAccount.count() !== accountsBefore) {
      throw new Error('GL accounts or role-to-GL mappings changed; Phase 2B must not create them');
    }
    console.log('--- Phase 2B Accounting Seeding Completed (no GL accounts, no role-to-GL mappings) ---');
    process.exit(0);
  } catch (err) {
    console.error('Phase 2B Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase2B();
