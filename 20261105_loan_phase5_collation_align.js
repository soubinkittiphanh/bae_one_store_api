/**
 * Align the collation of the four Phase 5 tables with the rest of the loan schema.
 * Run via: node loan_migrate.js up (local databases only, see src/loan/dbGuard.js).
 *
 * These four tables were created with utf8mb4_general_ci while the other 72 loan tables use
 * utf8mb4_unicode_ci. A string comparison across the two groups raises "Illegal mix of collations".
 * The loan code does not do that today, but this removes the trap. Charset stays utf8mb4; only the
 * collation changes, so no data is altered.
 *
 * UP converts each table to utf8mb4_unicode_ci; DOWN converts them back to utf8mb4_general_ci.
 * Both are idempotent (a table already at the target is skipped) and reversible regardless of data:
 * CONVERT TO CHARACTER SET keeps the stored text, it only rebuilds indexes with the new collation.
 */
const TABLES = ['ln_exchange_rate', 'ln_product_amount', 'ln_account_document', 'ln_print_template'];
const TARGET = 'utf8mb4_unicode_ci';
const PREVIOUS = 'utf8mb4_general_ci';
const CHARSET = 'utf8mb4';

const tableExists = async (conn, table) => Number((await conn.query(
  'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]
))[0].n) > 0;

const collationOf = async (conn, table) => {
  const rows = await conn.query('SELECT TABLE_COLLATION AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
  return rows.length ? rows[0].c : null;
};

// Converts only the tables that exist and are not already at `collation`.
const convertTo = async (conn, collation) => {
  for (const table of TABLES) {
    if (!(await tableExists(conn, table))) continue;
    if ((await collationOf(conn, table)) === collation) continue;
    await conn.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET ${CHARSET} COLLATE ${collation}`);
  }
};

module.exports = {
  name: '20261105_loan_phase5_collation_align',
  description: `${TABLES.join(', ')} -> ${TARGET}`,

  // Applied only when at least one of the four tables exists AND every existing one is at the target.
  // If none exists (the Phase 5 tables are not migrated, or an earlier DOWN has dropped them), this
  // migration is NOT applied — otherwise it would look "applied" vacuously and block the rollback of
  // the migrations below it that own those tables.
  async isApplied(conn) {
    let anyPresent = false;
    for (const table of TABLES) {
      if (!(await tableExists(conn, table))) continue;
      anyPresent = true;
      if ((await collationOf(conn, table)) !== TARGET) return false;
    }
    return anyPresent;
  },

  async up(conn) {
    await convertTo(conn, TARGET);
  },

  async down(conn) {
    await convertTo(conn, PREVIOUS);
  },

  // exported for tests
  TABLES,
  TARGET,
  PREVIOUS,
  collationOf
};
