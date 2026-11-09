/**
 * Phase 6, branch (showroom) support, Stage 1: schema only. Additive; no POS table is touched.
 * Run via: node loan_migrate.js up (local databases only, see src/loan/dbGuard.js).
 *
 *  - ln_journal_posting.branchId INT NULL + index (branchId, roleCode), backfilled from ln_transaction.branchId.
 *  - ln_branch_profile: one row per POS location used as a loan branch (loan code, on/off), maker-checker.
 *  - ln_branch_bank_account: which bank/cash accounts a branch may post to, maker-checker.
 *  - ln_account_branch_history: one row per BRANCH_TRANSFER of an account.
 *  - Indexes (branchId) on ln_account, ln_transaction, ln_application (none existed).
 *
 * UP is idempotent: each table, column and index is created only when missing, and the backfill touches
 * only legs whose branchId is still NULL. New tables use utf8mb4_unicode_ci like every other loan table.
 * Sync-first safe: when the app's startup sequelize.sync already made the tables, the column or the indexes
 * (same names as the models declare), UP does not create them again. It aligns what sync makes differently,
 * keeping every row: a table in the database's default collation is converted to utf8mb4_unicode_ci, and a
 * column whose comment, CURRENT_TIMESTAMP default or ON UPDATE differs from the definition below is
 * MODIFYed to it (same type and nullability, so no data changes). The end state then matches a
 * migration-only database column for column (tested: test/loan/run.js, "UP after a sync-first state").
 * DOWN refuses once any of the three tables has rows or any journal leg carries a branchId, so it can
 * only undo a schema that holds no branch data.
 */
const COLLATE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const MAKER_CHECKER = `
  \`authStatus\` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  \`makerId\` INT(11) NULL,
  \`checkerId\` INT(11) NULL,
  \`authorizedAt\` DATETIME NULL,`;

const TABLES = {
  ln_branch_profile: `CREATE TABLE IF NOT EXISTS \`ln_branch_profile\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`locationId\` INT(11) NOT NULL COMMENT 'location.id (POS); the branch',
  \`branchCode\` VARCHAR(10) NOT NULL COMMENT 'short code for the {BRANCH} numbering token',
  \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,${MAKER_CHECKER}
  \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_branch_profile_location\` (\`locationId\`),
  UNIQUE KEY \`uk_branch_profile_code\` (\`branchCode\`)
) ${COLLATE}`,
  ln_branch_bank_account: `CREATE TABLE IF NOT EXISTS \`ln_branch_bank_account\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`locationId\` INT(11) NOT NULL COMMENT 'location.id (POS); the branch',
  \`bankAccountId\` INT(11) NOT NULL COMMENT 'bankAccount.id (POS)',
  \`purpose\` VARCHAR(10) NOT NULL DEFAULT 'BANK' COMMENT 'CASH / BANK',
  \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,${MAKER_CHECKER}
  \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_branch_bank\` (\`locationId\`, \`bankAccountId\`)
) ${COLLATE}`,
  ln_account_branch_history: `CREATE TABLE IF NOT EXISTS \`ln_account_branch_history\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`loanAccountId\` INT(11) NOT NULL,
  \`fromBranchId\` INT(11) NOT NULL,
  \`toBranchId\` INT(11) NOT NULL,
  \`effectiveDate\` DATE NOT NULL,
  \`transactionId\` INT(11) NULL COMMENT 'the BRANCH_TRANSFER ln_transaction',
  \`makerId\` INT(11) NULL,
  \`checkerId\` INT(11) NULL,
  \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_abh_account\` (\`loanAccountId\`)
) ${COLLATE}`
};

// [table, index name, columns]
const INDEXES = [
  ['ln_journal_posting', 'idx_jp_branch_role', ['branchId', 'roleCode']],
  ['ln_account', 'idx_account_branch', ['branchId']],
  ['ln_transaction', 'idx_tx_branch', ['branchId']],
  ['ln_application', 'idx_app_branch', ['branchId']]
];

const count = async (conn, sql, params = []) => Number((await conn.query(sql, params))[0].n);
const tableExists = (conn, table) => count(conn, 'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]).then(n => n > 0);
const columnExists = (conn, table, column) => count(conn, 'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]).then(n => n > 0);
const indexExists = (conn, table, index) => count(conn, 'SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [table, index]).then(n => n > 0);
const JP_BRANCH_DEF = "INT(11) NULL COMMENT 'location.id at posting (Phase 6)'";

// Column definitions of a CREATE TABLE above: [{ name, def }]
const columnDefs = ddl => ddl.split('\n').map(l => l.trim().replace(/,$/, '')).filter(l => /^`\w+` /.test(l))
  .map(l => { const m = l.match(/^`(\w+)` (.*)$/); return { name: m[1], def: m[2] }; });

// MODIFY the columns sequelize.sync made with another comment, timestamp default or ON UPDATE
const alignColumns = async (conn, table, defs) => {
  for (const { name, def } of defs) {
    const rows = await conn.query('SELECT COLUMN_COMMENT AS c, COLUMN_DEFAULT AS d, EXTRA AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, name]);
    if (!rows.length) continue;
    const have = rows[0];
    const wantComment = ((def.match(/COMMENT '((?:[^']|'')*)'/) || [])[1] || '').replace(/''/g, "'");
    const same = String(have.c || '') === wantComment
      && /DEFAULT CURRENT_TIMESTAMP/i.test(def) === /^current_timestamp/i.test(String(have.d || ''))
      && /ON UPDATE CURRENT_TIMESTAMP/i.test(def) === /on update current_timestamp/i.test(String(have.x || ''));
    if (!same) await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${name}\` ${def}`);
  }
};

const tableCollation = async (conn, table) => ((await conn.query('SELECT TABLE_COLLATION AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]))[0] || {}).c;

module.exports = {
  name: '20261107_loan_branch_support',
  description: 'branch profile, branch bank mapping, account branch history, ln_journal_posting.branchId, branchId indexes',

  // Applied when every table, the column and every index exist.
  async isApplied(conn) {
    for (const t of Object.keys(TABLES)) if (!(await tableExists(conn, t))) return false;
    if (!(await columnExists(conn, 'ln_journal_posting', 'branchId'))) return false;
    for (const [t, i] of INDEXES) if (!(await indexExists(conn, t, i))) return false;
    return true;
  },

  async up(conn) {
    for (const [t, ddl] of Object.entries(TABLES)) {
      await conn.query(ddl);
      // made by sequelize.sync before this migration ran: align the collation (no-op when already aligned)
      if (await tableCollation(conn, t) !== 'utf8mb4_unicode_ci') await conn.query(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await alignColumns(conn, t, columnDefs(ddl));
    }
    if (!(await columnExists(conn, 'ln_journal_posting', 'branchId'))) {
      await conn.query(`ALTER TABLE \`ln_journal_posting\` ADD COLUMN \`branchId\` ${JP_BRANCH_DEF} AFTER \`loanAccountId\``);
    } else {
      await alignColumns(conn, 'ln_journal_posting', [{ name: 'branchId', def: JP_BRANCH_DEF }]);
    }
    for (const [t, i, cols] of INDEXES) {
      if (!(await indexExists(conn, t, i))) await conn.query(`ALTER TABLE \`${t}\` ADD INDEX \`${i}\` (${cols.map(c => `\`${c}\``).join(', ')})`);
    }
    // Legs posted before this migration take the branch of their transaction (every account is at one branch today)
    await conn.query('UPDATE `ln_journal_posting` jp JOIN `ln_transaction` t ON t.id = jp.transactionId SET jp.branchId = t.branchId WHERE jp.branchId IS NULL');
  },

  async down(conn) {
    for (const [t, i] of INDEXES) if (await indexExists(conn, t, i)) await conn.query(`ALTER TABLE \`${t}\` DROP INDEX \`${i}\``);
    if (await columnExists(conn, 'ln_journal_posting', 'branchId')) await conn.query('ALTER TABLE `ln_journal_posting` DROP COLUMN `branchId`');
    for (const t of Object.keys(TABLES).reverse()) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
  },

  async assertCanRollBack(conn) {
    const problems = [];
    for (const t of Object.keys(TABLES)) {
      if (!(await tableExists(conn, t))) continue;
      const n = await count(conn, `SELECT COUNT(*) AS n FROM \`${t}\``);
      if (n > 0) problems.push(`${t} has ${n} row(s)`);
    }
    if (await columnExists(conn, 'ln_journal_posting', 'branchId')) {
      const n = await count(conn, 'SELECT COUNT(*) AS n FROM `ln_journal_posting` WHERE branchId IS NOT NULL');
      if (n > 0) problems.push(`ln_journal_posting has ${n} leg(s) with a branchId`);
    }
    if (problems.length) throw new Error(`Refusing to roll back the branch support migration: ${problems.join('; ')}.`);
  },

  // exported for tests
  TABLES: Object.keys(TABLES),
  INDEXES
};
