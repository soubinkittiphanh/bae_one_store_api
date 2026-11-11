/**
 * Phase 6 Stage 2: no silent default branch. ln_account, ln_application, ln_transaction and ln_gl_batch
 * had branchId NOT NULL DEFAULT 1, so a record whose branch was never set landed at location 1. This drops
 * the DEFAULT (the column stays NOT NULL), so such an insert fails instead. No data changes.
 * UP is idempotent; DOWN puts DEFAULT 1 back (always possible, keeps data).
 */
const TABLES = ['ln_account', 'ln_application', 'ln_transaction', 'ln_gl_batch'];

const defaultOf = async (conn, table) => {
  const rows = await conn.query("SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'branchId'", [table]);
  if (!rows.length) throw new Error(`${table}.branchId not found`);
  const d = rows[0].d;
  return d === null || d === undefined || String(d).toUpperCase() === 'NULL' ? null : String(d);
};

const hasBranchId = async (conn, table) => {
  const rows = await conn.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'branchId'", [table]);
  return rows.length > 0;
};

module.exports = {
  name: '20261109_loan_branch_no_default',
  description: 'branchId without DEFAULT 1 on ln_account, ln_application, ln_transaction, ln_gl_batch',

  async isApplied(conn) {
    // loan_migrate reads every migration's state before running any, so on a clean database the
    // tables do not exist yet: that is "not applied", not an error.
    for (const t of TABLES) if (!(await hasBranchId(conn, t))) return false;
    for (const t of TABLES) if ((await defaultOf(conn, t)) !== null) return false;
    return true;
  },

  async up(conn) {
    for (const t of TABLES) if ((await defaultOf(conn, t)) !== null) await conn.query(`ALTER TABLE \`${t}\` ALTER COLUMN \`branchId\` DROP DEFAULT`);
  },

  async down(conn) {
    for (const t of TABLES) if ((await defaultOf(conn, t)) === null) await conn.query(`ALTER TABLE \`${t}\` ALTER COLUMN \`branchId\` SET DEFAULT 1`);
  },

  TABLES
};
