/**
 * Phase 5 Part A Seed Script, multi-currency (run after the 2A, 2B, 3 and 4 seeds). Strictly idempotent;
 * existing rows and values are never overwritten. docs/loan/rev5-accounting-addendum.md §8.10.
 * - Accounting roles FX_GAIN_REALIZED, FX_LOSS_REALIZED, FX_GAIN_UNREALIZED, FX_LOSS_UNREALIZED, CCY_POSITION
 *   and amount tags FX_DIFF, FX_REVAL: created PENDING (a checker authorizes them; posting refuses a PENDING role).
 * - Batch job EOD_FX_REVAL: PENDING and disabled; it also needs SPF LOAN_FX_REVAL_ENABLED = 'true'.
 * - SPF defaults: LOAN_FX_MAX_RATE_AGE_DAYS = 3, LOAN_FX_OVERRIDE_TOLERANCE_PCT = 0 (overrides off),
 *   LOAN_FX_MAX_ROUND_DIFF = 1, LOAN_FX_REVAL_ENABLED = false, LOAN_FX_IMPLIED_RATE_TOLERANCE_PCT = 1.00,
 *   LOAN_FX_IMPLIED_RATE_BREACH = REFUSE.
 * - Security: LN_EXCHANGE_RATE (maker-checker) for SUPER_ADMIN and ADMIN.
 * No GL account and no role-to-GL mapping is created here.
 */
process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_phase5');
const db = require('./src/models');
const { registerFunctions, grantToGroupCodes } = require('./src/security/grantService');
const { FX_ROLES, FX_TAGS } = require('./src/loan/accounting/catalog');

const PENDING = { authStatus: 'PENDING', makerId: null };

const SWITCHES = [
  { code: 'LOAN_FX_MAX_RATE_AGE_DAYS', value: '3', remark: 'Loan module: oldest exchange rate (calendar days before the booking date) a transaction may use; an older rate is refused, any rate not of the booking date shows a warning.' },
  { code: 'LOAN_FX_OVERRIDE_TOLERANCE_PCT', value: '0', remark: 'Loan module: allowed deviation (%) of a manual per-transaction exchange rate from the rate table; 0 = overrides off. An override always needs a checker.' },
  { code: 'LOAN_FX_MAX_ROUND_DIFF', value: '1', remark: 'Loan module: largest base-currency rounding difference (minor units per journal line) posted to ROUNDING_DIFF; larger differences are refused.' },
  { code: 'LOAN_FX_REVAL_ENABLED', value: 'false', remark: 'Loan module: month-end revaluation of foreign-currency loan balances (true/false). OFF by default; batch job EOD_FX_REVAL must also be enabled.' },
  { code: 'LOAN_FX_IMPLIED_RATE_TOLERANCE_PCT', value: '1.00', remark: 'Loan module: a foreign-currency loan settling a base-currency invoice: allowed deviation (%) of the implied rate from the sale line rate and from the rate table.' },
  { code: 'LOAN_FX_IMPLIED_RATE_BREACH', value: 'REFUSE', remark: 'Loan module: implied rate outside the tolerance: REFUSE, or CHECKER_OVERRIDE (the checker must explicitly accept the deviation).' }
];

async function seedPhase5() {
  console.log('--- Starting Phase 5 (multi-currency) Seeding ---');
  try {
    const created = [];
    for (const r of FX_ROLES) {
      const [, c] = await db.lnAccountingRole.findOrCreate({ where: { roleCode: r.roleCode }, defaults: { ...r, ...PENDING } });
      if (c) created.push(`role ${r.roleCode}`);
    }
    for (const [tagCode, name] of Object.entries(FX_TAGS)) {
      const [, c] = await db.lnAmountTag.findOrCreate({ where: { tagCode }, defaults: { tagCode, name, ...PENDING } });
      if (c) created.push(`tag ${tagCode}`);
    }
    const [, jobCreated] = await db.lnBatchJob.findOrCreate({
      where: { jobCode: 'EOD_FX_REVAL' },
      defaults: { jobCode: 'EOD_FX_REVAL', name: 'Month-end FX Revaluation (ຕີລາຄາອັດຕາແລກປ່ຽນທ້າຍເດືອນ)', executionOrder: 5, isEnabled: false, ...PENDING }
    });
    if (jobCreated) created.push('batch job EOD_FX_REVAL (disabled)');
    for (const s of SWITCHES) await db.spf.findOrCreate({ where: { code: s.code }, defaults: { ...s, isActive: true } });
    await registerFunctions(db, 'LN', [
      { functionCode: 'LN_EXCHANGE_RATE', name: 'Loan exchange rates', llname: 'ອັດຕາແລກປ່ຽນສິນເຊື່ອ', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'AUTHORIZE'] }
    ]);
    const grants = await grantToGroupCodes(db, ['SUPER_ADMIN', 'ADMIN'], ['LN_EXCHANGE_RATE']);
    console.log(`Phase 5 created: ${created.join(', ') || 'nothing new'}; grants: ${grants.join(', ') || 'none'}`);
    console.log('--- Phase 5 Seeding Completed (FX roles and tags PENDING; no GL accounts or mappings created) ---');
    process.exit(0);
  } catch (err) {
    console.error('Phase 5 Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase5();
