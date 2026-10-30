/**
 * Loan module migration runner (Phase 2A).
 *
 *   node loan_migrate.js status
 *   node loan_migrate.js up
 *   node loan_migrate.js down --yes          # roll back the latest applied migration
 *   node loan_migrate.js down --all --yes    # roll back everything (drops all ln_* tables)
 *
 * Refuses non-local databases unless ALLOW_REMOTE=1 and CONFIRM_DB=<database> (see src/loan/dbGuard.js).
 * Applied state is detected from marker tables (or a JS migration's isApplied), so databases migrated
 * by hand are handled too. JS migrations export { isApplied, up, down, assertCanRollBack? }.
 */
const fs = require('fs');
const path = require('path');
const mariadb = require('mariadb');
const { assertLocalDb, resolveConfig } = require('./src/loan/dbGuard');

const MIGRATIONS = [
  {
    name: '20261028_create_loan_module_phase2a_tables',
    up: '20261028_create_loan_module_phase2a_tables.sql',
    down: '20261028_create_loan_module_phase2a_tables_down.sql',
    marker: 'ln_product',
    dropsData: true
  },
  {
    name: '20261029_loan_phase2a_corrections',
    up: '20261029_loan_phase2a_corrections.sql',
    down: '20261029_loan_phase2a_corrections_down.sql',
    marker: 'ln_param_change',
    dropsData: false,
    dropsSecurity: true
  },
  {
    name: '20261030_loan_phase2b_accounting',
    up: '20261030_loan_phase2b_accounting.sql',
    down: '20261030_loan_phase2b_accounting_down.sql',
    marker: 'ln_lookup_interest_recognition',
    dropsData: false,
    dropsEntryRules: true
  },
  {
    name: '20261031_loan_phase3',
    up: '20261031_loan_phase3.sql',
    down: '20261031_loan_phase3_down.sql',
    marker: 'ln_currency_rule',
    dropsData: false,
    dropsAccounts: true
  },
  {
    // POS table: transactionEntry.transactionType += LOAN_IN, LOAN_OUT (built from the live column)
    name: '20261030_pos_transaction_entry_loan_types',
    module: './20261030_pos_transaction_entry_loan_types.js'
  },
  {
    name: '20261030_loan_phase4',
    up: '20261030_loan_phase4.sql',
    down: '20261030_loan_phase4_down.sql',
    marker: 'ln_pos_link',
    dropsData: false,
    dropsTransactions: true
  }
];

// Tables holding real loan business data; DOWN of the base migration refuses if any has rows.
const BUSINESS_TABLES = [
  'ln_application', 'ln_account', 'ln_transaction', 'ln_schedule', 'ln_journal_posting',
  'ln_collateral_master', 'ln_accounting_entry_rule', 'ln_role_gl_mapping'
];

const tableExists = async (conn, table) => {
  const rows = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  return Number(rows[0].n) > 0;
};

const jsModule = m => require(m.module);

const appliedState = async (conn) => {
  const state = [];
  for (const m of MIGRATIONS) state.push({ ...m, applied: m.module ? await jsModule(m).isApplied(conn) : await tableExists(conn, m.marker) });
  return state;
};

const runFile = async (conn, file) => {
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
  console.log(`  executing ${file}`);
  await conn.query(sql);
};

const runUp = async (conn, m) => {
  if (!m.module) return runFile(conn, m.up);
  console.log(`  executing ${m.module} (up)`);
  return jsModule(m).up(conn);
};

const runDown = async (conn, m) => {
  if (!m.module) return runFile(conn, m.down);
  console.log(`  executing ${m.module} (down)`);
  return jsModule(m).down(conn);
};

// The Phase 4 DOWN removes posting columns; never while loan transactions exist
const assertNoTransactions = async (conn) => {
  if (!(await tableExists(conn, 'ln_transaction'))) return;
  const rows = await conn.query('SELECT COUNT(*) AS n FROM ln_transaction');
  if (Number(rows[0].n) > 0) throw new Error(`Refusing to roll back Phase 4: ln_transaction has ${rows[0].n} row(s).`);
};

const assertNoBusinessData = async (conn) => {
  for (const t of BUSINESS_TABLES) {
    if (!(await tableExists(conn, t))) continue;
    const rows = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    if (Number(rows[0].n) > 0) {
      throw new Error(`Refusing to drop loan tables: ${t} has ${rows[0].n} row(s).`);
    }
  }
  const off = await conn.query("SELECT COUNT(*) AS n FROM chart_of_account WHERE accountType = 'Off-Balance'");
  if (Number(off[0].n) > 0) {
    throw new Error(`Refusing to restore the accountType ENUM: ${off[0].n} chart_of_account row(s) use 'Off-Balance'.`);
  }
};

// The sec_* RBAC tables are shared by all modules; never drop them while another module uses them.
const assertSecurityOnlyLoan = async (conn) => {
  if (!(await tableExists(conn, 'sec_function'))) return;
  const rows = await conn.query("SELECT COUNT(*) AS n FROM sec_function WHERE moduleCode NOT IN ('LN', 'SEC')");
  if (Number(rows[0].n) > 0) {
    throw new Error(`Refusing to drop sec_* tables: ${rows[0].n} function(s) belong to other modules.`);
  }
  // Grant changes made by people are audit history; seed rows can be rebuilt by re-seeding.
  if (await tableExists(conn, 'sec_audit_log')) {
    const audit = await conn.query("SELECT COUNT(*) AS n FROM sec_audit_log WHERE source <> 'SEED'");
    if (Number(audit[0].n) > 0) {
      throw new Error(`Refusing to drop sec_audit_log: it holds ${audit[0].n} grant change(s) made by users.`);
    }
  }
};

// The 2B DOWN removes the rule filter columns; never while entry rules exist
const assertNoEntryRules = async (conn) => {
  if (!(await tableExists(conn, 'ln_accounting_entry_rule'))) return;
  const rows = await conn.query('SELECT COUNT(*) AS n FROM ln_accounting_entry_rule');
  if (Number(rows[0].n) > 0) {
    throw new Error(`Refusing to roll back Phase 2B: ln_accounting_entry_rule has ${rows[0].n} row(s).`);
  }
};

// The Phase 3 DOWN removes application/account columns; never while applications or accounts exist
const assertNoAccounts = async (conn) => {
  for (const t of ['ln_application', 'ln_account']) {
    if (!(await tableExists(conn, t))) continue;
    const rows = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    if (Number(rows[0].n) > 0) throw new Error(`Refusing to roll back Phase 3: ${t} has ${rows[0].n} row(s).`);
  }
};

const main = async () => {
  const [command = 'status', ...flags] = process.argv.slice(2);
  const target = assertLocalDb('loan_migrate');
  const cfg = resolveConfig();

  const conn = await mariadb.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: target.database,
    multipleStatements: true
  });

  try {
    const state = await appliedState(conn);

    if (command === 'status') {
      state.forEach(m => console.log(`  ${m.applied ? '[applied]' : '[pending]'} ${m.name}`));
      return;
    }

    if (command === 'up') {
      // UP scripts are idempotent, so applied migrations are re-run safely.
      for (const m of state) await runUp(conn, m);
      console.log('loan_migrate up: done');
      return;
    }

    if (command === 'down') {
      if (!flags.includes('--yes')) throw new Error('down requires --yes');
      const applied = state.filter(m => m.applied).reverse();
      const toRollBack = flags.includes('--all') ? applied : applied.slice(0, 1);
      if (toRollBack.length === 0) {
        console.log('loan_migrate down: nothing applied');
        return;
      }
      // Check every step before running any, so a refusal never leaves a partial rollback
      const refusals = [];
      for (const m of toRollBack) {
        const checks = [m.dropsData && assertNoBusinessData, m.dropsSecurity && assertSecurityOnlyLoan, m.dropsEntryRules && assertNoEntryRules, m.dropsAccounts && assertNoAccounts,
          m.dropsTransactions && assertNoTransactions, m.module && jsModule(m).assertCanRollBack && (c => jsModule(m).assertCanRollBack(c))];
        for (const check of checks.filter(Boolean)) {
          try { await check(conn); } catch (err) { refusals.push(err.message); }
        }
      }
      if (refusals.length) throw new Error(refusals.join(' '));
      for (const m of toRollBack) await runDown(conn, m);
      console.log(`loan_migrate down: rolled back ${toRollBack.map(m => m.name).join(', ')}`);
      return;
    }

    throw new Error(`Unknown command "${command}". Use status | up | down --yes [--all]`);
  } finally {
    await conn.end();
  }
};

main().catch(err => {
  console.error(`loan_migrate failed: ${err.message}`);
  process.exit(1);
});
