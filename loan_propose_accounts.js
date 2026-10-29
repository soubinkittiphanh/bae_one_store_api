/**
 * Loan Phase 2B: list the GL accounts to create for the loan roles and check them against
 * chart_of_account (docs/loan/rev5-accounting-addendum.md §5). READ-ONLY: it never creates
 * accounts and never writes ln_role_gl_mapping.
 *
 *   node loan_propose_accounts.js [--features=VAT,BILL_PENALTY,BILLED_FEES,FX,DEFERRED_FEES,FIVE_PORTFOLIO] [--json]
 *
 * Refuses non-local databases unless ALLOW_REMOTE=1 and CONFIRM_DB=<database> (see src/loan/dbGuard.js).
 * Exit code 2 when a collision or a system-parameter problem is found.
 */
const { assertLocalDb } = require('./src/loan/dbGuard');

const main = async () => {
  const target = assertLocalDb('loan_propose_accounts');
  const args = process.argv.slice(2);
  const featureArg = args.find(a => a.startsWith('--features='));
  const features = featureArg ? featureArg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  const db = require('./src/models');
  db.sequelize.options.logging = false;
  const { proposeAccounts } = require('./src/loan/accounting/accountProposals');
  try {
    const result = await proposeAccounts(db, { features });
    if (args.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Database ${target.database}; features: ${features.join(', ') || 'defaults'}`);
      console.log('\nAccounts (proposals; match against the real chart before creating anything):');
      for (const a of result.accounts) {
        const q = a.qualifiers ? ` [${a.qualifiers.join('+')}]` : '';
        console.log(`  ${a.status.padEnd(9)} ${a.number}  ${a.roleCode}${q}  ${a.name} (${a.type})${a.detail ? `  <- ${a.detail}` : ''}`);
      }
      console.log('\nExisting accounts resolved by system parameter:');
      for (const p of result.params) {
        console.log(`  ${p.status.padEnd(17)} ${p.param} = ${p.value || '(empty)'}  ${p.roleCode}${p.detail ? `  ${p.detail}` : ''}`);
      }
      const s = result.summary;
      console.log(`\nTo create: ${s.toCreate}; reusable: ${s.reusable}; collisions: ${s.collisions}; parameter problems: ${s.paramProblems}`);
      console.log('Nothing was written.');
    }
    process.exitCode = result.summary.collisions || result.summary.paramProblems ? 2 : 0;
  } finally {
    await db.sequelize.close();
  }
};

main().catch((err) => {
  console.error(`loan_propose_accounts failed: ${err.message}`);
  process.exit(1);
});
