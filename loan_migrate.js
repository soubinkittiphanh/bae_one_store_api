/**
 * Loan module migration runner (Phase 2A).
 *
 *   node loan_migrate.js status
 *   node loan_migrate.js up
 *   node loan_migrate.js down --yes          # roll back the latest applied migration
 *   node loan_migrate.js down --all --yes    # roll back everything (drops all ln_* tables)
 *
 * Refuses non-local databases unless ALLOW_REMOTE=1 and CONFIRM_DB=<database> (see src/loan/dbGuard.js).
 * Applied state is detected from marker tables, so databases migrated by hand are handled too.
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
    dropsData: false
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

const appliedState = async (conn) => {
  const state = [];
  for (const m of MIGRATIONS) state.push({ ...m, applied: await tableExists(conn, m.marker) });
  return state;
};

const runFile = async (conn, file) => {
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
  console.log(`  executing ${file}`);
  await conn.query(sql);
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
      for (const m of state) await runFile(conn, m.up);
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
      for (const m of toRollBack) {
        if (m.dropsData) await assertNoBusinessData(conn);
        await runFile(conn, m.down);
      }
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
