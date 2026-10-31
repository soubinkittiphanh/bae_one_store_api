/**
 * Loan settlement receipts inside the POS AR receipt API.
 *
 * DISB settles the vehicle invoice with a POS AR receipt (posAdapters.settleInvoice, ln_pos_link role
 * AR_SETTLEMENT). That receipt is not money received by the dealer, so:
 * - the two AR receipt list endpoints leave it out unless the caller passes includeLoanSettlement=1
 *   (only the AR receipt list screen does); returned rows then carry loanSettlementTxNo;
 * - edit, delete, void, cancel and reactivate through the POS API are refused: the loan module reverses it.
 *
 * Databases without the loan tables behave exactly as before (the link table is looked up first).
 */
const { Op, QueryTypes } = require('sequelize');
const db = require('../../models');

const LINKED_RECEIPTS = "SELECT posId FROM ln_pos_link WHERE posTable = 'ARReceiveHeader' AND role = 'AR_SETTLEMENT'";

// Present is cached for good; absent is re-checked every minute so a later loan migration is picked up
let present = false;
let checkedAt = 0;
const linkTablePresent = async () => {
  if (present || Date.now() - checkedAt < 60000) return present;
  checkedAt = Date.now();
  const rows = await db.sequelize.query(
    "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ln_pos_link'",
    { type: QueryTypes.SELECT });
  present = Number(rows[0].n) > 0;
  return present;
};

const wantsLoanSettlement = query => ['1', 'true'].includes(String((query || {}).includeLoanSettlement || '').toLowerCase());

// Adds the exclusion to a receipt where clause unless the caller asked for loan settlement receipts
const excludeUnlessRequested = async (where, query) => {
  if (wantsLoanSettlement(query) || !(await linkTablePresent())) return where;
  where[Op.and] = [...(where[Op.and] || []), { id: { [Op.notIn]: db.sequelize.literal(`(${LINKED_RECEIPTS})`) } }];
  return where;
};

// The loan transaction number settled by each receipt id (only receipts that settle a loan)
const settledTxNos = async (receiptIds) => {
  if (!receiptIds.length || !(await linkTablePresent())) return new Map();
  const rows = await db.sequelize.query(
    `SELECT l.posId, t.txNo FROM ln_pos_link l JOIN ln_transaction t ON t.id = l.transactionId
      WHERE l.posTable = 'ARReceiveHeader' AND l.role = 'AR_SETTLEMENT' AND l.posId IN (:ids) ORDER BY l.id`,
    { replacements: { ids: receiptIds }, type: QueryTypes.SELECT });
  const map = new Map();
  for (const r of rows) if (!map.has(Number(r.posId))) map.set(Number(r.posId), r.txNo);
  return map;
};

// Marks returned rows with loanSettlementTxNo when the caller asked for loan settlement receipts
const labelIfRequested = async (rows, query) => {
  if (!wantsLoanSettlement(query)) return rows;
  const txNos = await settledTxNos(rows.map(r => Number(r.id)));
  for (const r of rows) r.dataValues.loanSettlementTxNo = txNos.get(Number(r.id)) || null;
  return rows;
};

// Express middleware for the mutating /:id routes
const refuseLoanReceipt = async (req, res, next) => {
  try {
    const txNo = (await settledTxNos([Number(req.params.id) || 0])).get(Number(req.params.id));
    if (!txNo) return next();
    return res.status(409).json({ success: false, message: `This receipt settles loan ${txNo}; reverse it from the loan module.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not check whether the receipt settles a loan' });
  }
};

module.exports = { excludeUnlessRequested, labelIfRequested, refuseLoanReceipt, wantsLoanSettlement };
