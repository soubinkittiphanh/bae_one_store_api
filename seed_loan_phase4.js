/**
 * Phase 4 Seed Script (run after the 2A, 2B and 3 seeds). Strictly idempotent; existing values are
 * never overwritten.
 * - SPF switches, all OFF by default: LOAN_POSTING_ENABLED, BS_INCLUDE_LOAN_BOOK; LOAN_MAX_BACKDATE_DAYS = 0.
 * - Security: LN_TRANSACTION (VIEW, CREATE, AUTHORIZE) and LN_EOD (VIEW, CREATE) for SUPER_ADMIN and ADMIN;
 *   LN_GL_MAPPING (role-to-GL mappings, maker-checker) for SUPER_ADMIN, VIEW only for ADMIN.
 */
process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_phase4');
const db = require('./src/models');
const { registerFunctions, grantToGroupCodes, applyGrant } = require('./src/security/grantService');

const SWITCHES = [
  { code: 'LOAN_POSTING_ENABLED', value: 'false', remark: 'Loan module: master switch for GL posting, payments and EOD (true/false). OFF by default.' },
  { code: 'BS_INCLUDE_LOAN_BOOK', value: 'false', remark: 'Balance sheet without a project: include the loan section, the loan result line and the GL-vs-subledger check (true/false).' },
  { code: 'LOAN_MAX_BACKDATE_DAYS', value: '0', remark: 'Loan module: how many days before the business date a transaction value date may be (0 = no backdating).' }
];

async function seedPhase4() {
  console.log('--- Starting Phase 4 Seeding ---');
  try {
    for (const s of SWITCHES) await db.spf.findOrCreate({ where: { code: s.code }, defaults: { ...s, isActive: true } });
    await registerFunctions(db, 'LN', [
      { functionCode: 'LN_TRANSACTION', name: 'Loan transactions (payments, disbursement, reversal)', llname: 'ທຸລະກຳສິນເຊື່ອ', actions: ['VIEW', 'CREATE', 'AUTHORIZE'] },
      { functionCode: 'LN_EOD', name: 'Loan end-of-day batch', llname: 'ປະມວນຜົນທ້າຍວັນສິນເຊື່ອ', actions: ['VIEW', 'CREATE'] },
      { functionCode: 'LN_GL_MAPPING', name: 'Accounting role to GL account mappings', llname: 'ການເຊື່ອມບົດບາດກັບບັນຊີ', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'AUTHORIZE'] }
    ]);
    const grants = await grantToGroupCodes(db, ['SUPER_ADMIN', 'ADMIN'], ['LN_TRANSACTION', 'LN_EOD']);
    grants.push(...await grantToGroupCodes(db, ['SUPER_ADMIN'], ['LN_GL_MAPPING']));
    const admin = await db.group.findOne({ where: { code: 'ADMIN' } });
    if (admin && await applyGrant(db, { group: admin, functionCode: 'LN_GL_MAPPING', actionCode: 'VIEW', granted: true, source: 'SEED' })) grants.push('ADMIN: +1 (LN_GL_MAPPING VIEW)');
    console.log(`Phase 4 grants: ${grants.join(', ') || 'none'}`);
    console.log('--- Phase 4 Seeding Completed (posting stays OFF until LOAN_POSTING_ENABLED = true) ---');
    process.exit(0);
  } catch (err) {
    console.error('Phase 4 Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase4();
