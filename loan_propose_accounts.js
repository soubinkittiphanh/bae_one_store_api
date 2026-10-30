/**
 * Loan Phase 2B: list the GL accounts to create for the loan roles and check them against
 * chart_of_account (docs/loan/rev5-accounting-addendum.md §5). READ-ONLY: it never creates
 * accounts and never writes ln_role_gl_mapping.
 *
 *   node loan_propose_accounts.js [--features=VAT,BILL_PENALTY,BILLED_FEES,FX,DEFERRED_FEES,FIVE_PORTFOLIO] [--json]
 *   node loan_propose_accounts.js --apply --yes [--features=...]   SANDBOX ONLY: create the missing proposed
 *        accounts and PENDING role-to-GL mappings (refused if any collision exists). For the customer the
 *        accounts are created manually after the accountant confirms them (decision D10).
 *
 * Refuses non-local databases unless ALLOW_REMOTE=1 and CONFIRM_DB=<database> (see src/loan/dbGuard.js).
 * Exit code 2 when a collision or a system-parameter problem is found.
 */
const { assertLocalDb } = require('./src/loan/dbGuard');

// Sandbox only: create CREATE-status accounts and PENDING global mappings (one per status qualifier for LOAN_PORTFOLIO)
const applyProposals = async (db, result) => db.sequelize.transaction(async (transaction) => {
  let accounts = 0;
  let mappings = 0;
  for (const a of result.accounts) {
    let account = await db.chartAccount.findOne({ where: { accountNumber: a.number }, transaction });
    if (!account) {
      account = await db.chartAccount.create({ accountNumber: a.number, accountName: a.name, accountLLName: a.llname, accountType: a.type, isActive: true }, { transaction });
      accounts++;
    }
    if (a.roleCode === 'TAX_PAYABLE') continue; // resolved through SPF GL_MAP_VAT_OUTPUT_ACC, not a mapping
    for (const statusQualifier of a.qualifiers && a.qualifiers.length ? a.qualifiers : [null]) {
      const exists = await db.lnRoleGlMapping.findOne({ where: { roleCode: a.roleCode, statusQualifier, productId: null, categoryId: null, branchId: null, currencyId: null }, transaction });
      if (exists) continue;
      await db.lnRoleGlMapping.create({ roleCode: a.roleCode, statusQualifier, chartAccountId: account.id, effectiveFrom: '2000-01-01', isSeedDefault: true, authStatus: 'PENDING', makerId: null }, { transaction });
      mappings++;
    }
  }
  return { accounts, mappings };
});

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
    if (args.includes('--apply')) {
      if (!args.includes('--yes')) throw new Error('--apply needs --yes');
      if (result.summary.collisions) throw new Error(`Refusing to apply: ${result.summary.collisions} number collision(s)`);
      const created = await applyProposals(db, result);
      console.log(`\nApplied: ${created.accounts} account(s) created, ${created.mappings} PENDING mapping(s) created (authorize them with a second user).`);
      process.exitCode = 0;
    } else {
      process.exitCode = result.summary.collisions || result.summary.paramProblems ? 2 : 0;
    }
  } finally {
    await db.sequelize.close();
  }
};

main().catch((err) => {
  console.error(`loan_propose_accounts failed: ${err.message}`);
  process.exit(1);
});
