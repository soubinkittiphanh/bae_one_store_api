/**
 * Phase 6 Seed Script, branch support Stage 1 (run after the Phase 5B seed). Strictly idempotent.
 * - Security: LN_ALL_BRANCHES (VIEW). A scope flag only (plan R2): it widens a user's branch scope to every
 *   branch and opens no route by itself, because every route still runs its own permission check first.
 *   Granted to SUPER_ADMIN, LOAN_HO_CHECKER and LOAN_ACCOUNTANT only, never to ADMIN or a cashier group.
 *   A group that does not exist yet is skipped with a warning; create it, then re-run this seed.
 * - Never revokes. If any other group already holds LN_ALL_BRANCHES the seed lists it and exits 1, so the
 *   deployer reviews it (the test suite fails on the same condition).
 * - Stage 2: LN_BRANCH (VIEW, CREATE, EDIT, DELETE, AUTHORIZE) for the branch profile and the branch bank
 *   mapping (Parameter Studio), granted to SUPER_ADMIN only. Same guard: any other holder exits 1.
 * - Stage 2: ln_branch_bank_account is prefilled from the POS terminals: one PENDING row per distinct
 *   (terminal.locationId, terminal.bankAccountId) of active terminals with both set and an active bank
 *   account. Purpose CASH when the bank account's type says cash, otherwise BANK. Nothing posts to it
 *   until a checker authorizes it; existing rows are never changed.
 */
process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_phase6');
const db = require('./src/models');
const { registerFunctions, grantToGroupCodes } = require('./src/security/grantService');

const ALL_BRANCHES = 'LN_ALL_BRANCHES';
const ALL_BRANCHES_GROUPS = ['SUPER_ADMIN', 'LOAN_HO_CHECKER', 'LOAN_ACCOUNTANT'];

const BRANCH_FUNCTION = 'LN_BRANCH';
const BRANCH_GROUPS = ['SUPER_ADMIN'];

// Groups other than the allowed ones that hold the function (any action)
const otherHolders = async (functionCode, allowed) => {
  const rows = await db.sequelize.query(
    'SELECT DISTINCT g.code FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE s.functionCode = ? ORDER BY 1',
    { replacements: [functionCode], type: db.Sequelize.QueryTypes.SELECT }
  );
  return rows.map(r => r.code).filter(c => !allowed.includes(c));
};

async function seedPhase6() {
  console.log('--- Starting Phase 6 Seeding (branch support) ---');
  try {
    await registerFunctions(db, 'LN', [
      { functionCode: ALL_BRANCHES, name: 'All branches (scope flag; opens no screen by itself)', llname: 'ທຸກສາຂາ', actions: ['VIEW'] }
    ]);
    const summary = await grantToGroupCodes(db, ALL_BRANCHES_GROUPS, [ALL_BRANCHES]);
    console.log(`${ALL_BRANCHES} grants: ${summary.join(', ') || 'none'}`);

    await registerFunctions(db, 'LN', [
      { functionCode: 'LN_BRANCH', name: 'Loan branches and branch bank accounts', llname: 'ສາຂາສິນເຊື່ອ ແລະ ບັນຊີທະນາຄານຂອງສາຂາ', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'AUTHORIZE'] }
    ]);
    console.log(`${BRANCH_FUNCTION} grants: ${(await grantToGroupCodes(db, BRANCH_GROUPS, [BRANCH_FUNCTION])).join(', ') || 'none'}`);

    const pairs = await db.sequelize.query(
      `SELECT DISTINCT t.locationId l, t.bankAccountId b, b.accountType ty FROM terminal t JOIN bankAccount b ON b.id = t.bankAccountId
        WHERE t.isActive = 1 AND b.isActive = 1 AND t.locationId IS NOT NULL ORDER BY 1, 2`,
      { type: db.Sequelize.QueryTypes.SELECT }
    );
    let prefilled = 0;
    for (const p of pairs) {
      const [, created] = await db.lnBranchBankAccount.findOrCreate({
        where: { locationId: p.l, bankAccountId: p.b },
        defaults: { locationId: p.l, bankAccountId: p.b, purpose: /cash/i.test(String(p.ty || '')) ? 'CASH' : 'BANK', isActive: true, authStatus: 'PENDING', makerId: null }
      });
      if (created) prefilled++;
    }
    console.log(`Branch bank accounts prefilled from terminals (PENDING): +${prefilled} of ${pairs.length}`);

    let refused = false;
    for (const [fn, allowed] of [[ALL_BRANCHES, ALL_BRANCHES_GROUPS], [BRANCH_FUNCTION, BRANCH_GROUPS]]) {
      const others = await otherHolders(fn, allowed);
      if (others.length) {
        console.error(`${fn} is also held by: ${others.join(', ')}. Only ${allowed.join(', ')} may hold it; review and revoke in the grant matrix.`);
        refused = true;
      }
    }
    if (refused) process.exit(1);
    console.log('--- Phase 6 Seeding Completed Successfully! ---');
    process.exit(0);
  } catch (err) {
    console.error('Phase 6 Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase6();
