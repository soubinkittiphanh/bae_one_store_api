/**
 * Phase 6 Stage 2: which branch each POS general_ledger row belongs to. Only rows the loan module wrote
 * carry a branch: through their journal leg (ln_journal_posting.glRecordId -> branchId) or, for rows a
 * loan transaction linked without a leg (e.g. a REVERSAL's mirrored rows), through ln_pos_link and the
 * transaction's branch. Every other row is "Not branch-tagged (POS)" (plan R5: tagging the POS itself is
 * a separate POS task).
 */
const db = require('../../models');

const NOT_TAGGED_LABEL = 'Not branch-tagged (POS)';

// Map general_ledger.id -> location.id
const glBranchTags = async () => {
  const Q = db.Sequelize.QueryTypes.SELECT;
  const legs = await db.sequelize.query('SELECT glRecordId g, branchId b FROM ln_journal_posting WHERE glRecordId IS NOT NULL AND branchId IS NOT NULL ORDER BY id', { type: Q });
  const links = await db.sequelize.query("SELECT pl.posId g, t.branchId b FROM ln_pos_link pl JOIN ln_transaction t ON t.id = pl.transactionId WHERE pl.posTable = 'general_ledger' ORDER BY pl.id", { type: Q });
  const tags = new Map();
  for (const r of [...legs, ...links]) if (!tags.has(Number(r.g))) tags.set(Number(r.g), Number(r.b));
  return tags;
};

// Phase 6 Stage 4: BRANCH_TRANSFER memo legs (and their REVERSAL mirrors, same amountTag) have no GL row. For
// the branch split they act as GL rows at their leg's branch, at the carrying base (localDebit/localCredit).
// They net to zero per chart account company-wide, so the company reports never see them.
const transferMemoRows = async (asOfDate) => {
  const rows = await db.sequelize.query(`
    SELECT jp.id, jp.branchId b, jp.chartAccountId c, jp.drCr d, CAST(jp.baseAmount AS CHAR) base
      FROM ln_journal_posting jp JOIN ln_transaction t ON t.id = jp.transactionId
     WHERE jp.amountTag = 'BRANCH_TRANSFER' AND jp.glRecordId IS NULL AND jp.branchId IS NOT NULL
       AND t.postingStatus = 'POSTED' AND COALESCE(t.bookingDate, t.valueDate) <= :asOfDate
     ORDER BY jp.id`, { replacements: { asOfDate }, type: db.Sequelize.QueryTypes.SELECT });
  return rows.map(r => ({
    id: `memo-${r.id}`, memoBranch: Number(r.b),
    drAccountId: r.d === 'DR' ? r.c : null, crAccountId: r.d === 'CR' ? r.c : null,
    ld: r.d === 'DR' ? r.base : '0', lc: r.d === 'CR' ? r.base : '0',
    localDebit: r.d === 'DR' ? r.base : '0', localCredit: r.d === 'CR' ? r.base : '0'
  }));
};

// branchId query value -> a location id; anything else is a 400
const parseBranchId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) { const err = new Error('branchId must be a location id'); err.status = 400; throw err; }
  return id;
};

module.exports = { NOT_TAGGED_LABEL, glBranchTags, parseBranchId, transferMemoRows };
