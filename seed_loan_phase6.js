/**
 * Phase 6 Seed Script, branch support Stage 1 (run after the Phase 5B seed). Strictly idempotent.
 * - Security: LN_ALL_BRANCHES (VIEW). A scope flag only (plan R2): it widens a user's branch scope to every
 *   branch and opens no route by itself, because every route still runs its own permission check first.
 *   Granted to SUPER_ADMIN, LOAN_HO_CHECKER and LOAN_ACCOUNTANT only, never to ADMIN or a cashier group.
 *   A group that does not exist yet is skipped with a warning; create it, then re-run this seed.
 * - Never revokes. If any other group already holds LN_ALL_BRANCHES the seed lists it and exits 1, so the
 *   deployer reviews it (the test suite fails on the same condition).
 */
process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_phase6');
const db = require('./src/models');
const { registerFunctions, grantToGroupCodes } = require('./src/security/grantService');

const ALL_BRANCHES = 'LN_ALL_BRANCHES';
const ALL_BRANCHES_GROUPS = ['SUPER_ADMIN', 'LOAN_HO_CHECKER', 'LOAN_ACCOUNTANT'];

// Groups other than the three that hold the flag (any action)
const otherHolders = async () => {
  const rows = await db.sequelize.query(
    'SELECT DISTINCT g.code FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE s.functionCode = ? ORDER BY 1',
    { replacements: [ALL_BRANCHES], type: db.Sequelize.QueryTypes.SELECT }
  );
  return rows.map(r => r.code).filter(c => !ALL_BRANCHES_GROUPS.includes(c));
};

async function seedPhase6() {
  console.log('--- Starting Phase 6 Seeding (branch support) ---');
  try {
    await registerFunctions(db, 'LN', [
      { functionCode: ALL_BRANCHES, name: 'All branches (scope flag; opens no screen by itself)', llname: 'ທຸກສາຂາ', actions: ['VIEW'] }
    ]);
    const summary = await grantToGroupCodes(db, ALL_BRANCHES_GROUPS, [ALL_BRANCHES]);
    console.log(`${ALL_BRANCHES} grants: ${summary.join(', ') || 'none'}`);

    const others = await otherHolders();
    if (others.length) {
      console.error(`${ALL_BRANCHES} is also held by: ${others.join(', ')}. Only ${ALL_BRANCHES_GROUPS.join(', ')} may hold it; review and revoke in the grant matrix.`);
      process.exit(1);
    }
    console.log('--- Phase 6 Seeding Completed Successfully! ---');
    process.exit(0);
  } catch (err) {
    console.error('Phase 6 Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase6();
