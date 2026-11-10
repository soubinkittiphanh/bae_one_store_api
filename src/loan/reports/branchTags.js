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

// branchId query value -> a location id; anything else is a 400
const parseBranchId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) { const err = new Error('branchId must be a location id'); err.status = 400; throw err; }
  return id;
};

module.exports = { NOT_TAGGED_LABEL, glBranchTags, parseBranchId };
