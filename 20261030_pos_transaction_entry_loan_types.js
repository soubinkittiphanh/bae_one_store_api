/**
 * POS table change for the loan module: add LOAN_IN / LOAN_OUT to transactionEntry.transactionType.
 * Run via: node loan_migrate.js up (local databases only, see src/loan/dbGuard.js).
 *
 * The ALTER is built from the LIVE column definition (information_schema): only LOAN_IN and LOAN_OUT
 * are appended or removed; nullability, default, character set, collation and comment are kept.
 * UP is idempotent. DOWN refuses while any LOAN_IN / LOAN_OUT row exists.
 *
 * Loan rows use the existing generic rule of getLedgerEffect (in = credit, out = debit), so the
 * daily balance snapshot and the account statement need no code change, and the school cash report
 * (which filters on TOPUP / REFUND) does not pick them up.
 */
const TABLE = 'transactionEntry';
const COLUMN = 'transactionType';
const LOAN_TYPES = ['LOAN_IN', 'LOAN_OUT'];

const columnInfo = async (conn) => {
  const rows = await conn.query(
    `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS columnDefault,
            CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation, COLUMN_COMMENT AS comment
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [TABLE, COLUMN]
  );
  if (!rows.length) throw new Error(`${TABLE}.${COLUMN} not found`);
  return rows[0];
};

// enum('A','B','it''s') -> ['A', 'B', "it's"]
const parseEnum = (columnType) => {
  const m = /^enum\((.*)\)$/i.exec(columnType);
  if (!m) throw new Error(`${TABLE}.${COLUMN} is not an ENUM (${columnType})`);
  return [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'"));
};

const quote = v => `'${String(v).replace(/'/g, "''")}'`;

const alterSql = (values, info) => {
  const parts = [`ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`${COLUMN}\` ENUM(${values.map(quote).join(',')})`];
  if (info.charset) parts.push(`CHARACTER SET ${info.charset}`);
  if (info.collation) parts.push(`COLLATE ${info.collation}`);
  parts.push(info.nullable === 'YES' ? 'NULL' : 'NOT NULL');
  // MariaDB reports a quoted literal ('TOPUP'), the string NULL, or SQL NULL when there is no default
  if (info.columnDefault !== null && info.columnDefault !== undefined && info.columnDefault !== 'NULL') parts.push(`DEFAULT ${info.columnDefault}`);
  else if (info.nullable === 'YES') parts.push('DEFAULT NULL');
  if (info.comment) parts.push(`COMMENT ${quote(info.comment)}`);
  return parts.join(' ');
};

module.exports = {
  name: '20261030_pos_transaction_entry_loan_types',
  description: `${TABLE}.${COLUMN} += ${LOAN_TYPES.join(', ')}`,

  async isApplied(conn) {
    const values = parseEnum((await columnInfo(conn)).columnType);
    return LOAN_TYPES.every(t => values.includes(t));
  },

  async up(conn) {
    const info = await columnInfo(conn);
    const values = parseEnum(info.columnType);
    const missing = LOAN_TYPES.filter(t => !values.includes(t));
    if (!missing.length) return;
    await conn.query(alterSql([...values, ...missing], info));
  },

  async assertCanRollBack(conn) {
    const rows = await conn.query(`SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE \`${COLUMN}\` IN (?)`, [LOAN_TYPES]);
    if (Number(rows[0].n) > 0) throw new Error(`Refusing to remove ${LOAN_TYPES.join('/')}: ${TABLE} has ${rows[0].n} loan row(s).`);
  },

  async down(conn) {
    const info = await columnInfo(conn);
    const values = parseEnum(info.columnType);
    if (!LOAN_TYPES.some(t => values.includes(t))) return;
    await conn.query(alterSql(values.filter(v => !LOAN_TYPES.includes(v)), info));
  },

  // exported for tests
  parseEnum,
  alterSql
};
