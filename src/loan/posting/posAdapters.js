/**
 * POS subledger adapters (no POS code changes): loan cash moves through the existing bank mechanism
 * (transactionEntry + bankAccount.balance) and DISB settles the vehicle invoice through the existing AR
 * receipt mechanism (ARReceiveHeader + lines + syncInvoiceStatus). Everything runs in the caller's
 * transaction and every POS row created is recorded in ln_pos_link.
 *
 * Bank rows use the dedicated types LOAN_IN (credit = amount) and LOAN_OUT (debit = amount), so the
 * existing getLedgerEffect rule (in = credit, out = debit) counts them in the daily balance and the
 * statement, and the school cash report (TOPUP / REFUND only) does not pick them up.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../../models');
const { LoanError } = require('../errors');
const { fromUnits, toUnits } = require('../accounting/journal');
const { findOneExact, findAllExact } = require('../db/exact');
const { posBusinessDate } = require('./guards');

const link = (transactionId, posTable, posId, role, transaction) => db.lnPosLink.create({ transactionId, posTable, posId, role }, { transaction });

// POS amount columns hold at most 2 decimals; loan amounts are already rounded (rounding policy)
const pos2 = (units) => {
  if (units % 100n !== 0n) throw new LoanError(409, `Amount ${fromUnits(units)} has more than 2 decimals`);
  return fromUnits(units).slice(0, -2);
};
// bankAccount.balance is a POS DOUBLE; read it as a decimal string for the comparison only
const balanceUnits = (balance) => {
  const m = /^(-?\d+)(\.\d{1,4})?/.exec(String(Number(balance || 0)));
  return toUnits(m ? `${m[1].replace('-', '')}${m[2] || ''}` : '0') * (String(balance).startsWith('-') ? -1n : 1n);
};

// units: positive = money in, negative = money out (BigInt, 4 decimals)
const bankMovement = async ({ transactionId, txNo, bankAccountId, units, currencyCode, description, userId }, transaction) => {
  if (units === 0n) return null;
  const bank = await db.bankAccount.findByPk(bankAccountId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!bank || bank.isActive === false) throw new LoanError(400, `Bank account ${bankAccountId} not found or inactive`);
  if (currencyCode && bank.currency && bank.currency !== currencyCode) throw new LoanError(400, `Bank account ${bank.accountName} is ${bank.currency}; the loan is ${currencyCode}`);
  const amount = pos2(units < 0n ? -units : units);
  if (units < 0n && balanceUnits(bank.balance) < -units) {
    throw new LoanError(409, `Bank account ${bank.accountName} has ${bank.balance}, less than the ${amount} to pay out`);
  }
  const businessDate = await posBusinessDate(transaction);
  const entry = await db.transactionEntry.create({
    referenceId: uuidv4(),
    bankAccountId: bank.id,
    transactionType: units > 0n ? 'LOAN_IN' : 'LOAN_OUT',
    debit: units > 0n ? 0 : amount,
    credit: units > 0n ? amount : 0,
    description: `Loan ${txNo}: ${description}`,
    externalRefno: txNo,
    userId: userId || null,
    businessDate
  }, { transaction });
  if (units > 0n) await bank.increment('balance', { by: amount, transaction });
  else await bank.decrement('balance', { by: amount, transaction });
  await link(transactionId, 'transactionEntry', entry.id, units > 0n ? 'BANK_IN' : 'BANK_OUT', transaction);
  return entry;
};

// Open balance of the sale's AR invoice (header total minus active receipts), exact
const invoiceForSale = async (saleHeaderId, transaction) => {
  const sale = await db.saleHeader.findByPk(saleHeaderId, { transaction });
  if (!sale) throw new LoanError(409, `Vehicle sale ${saleHeaderId} not found`);
  if (!sale.isPostedToAR || !sale.arInvoiceId) throw new LoanError(409, `Vehicle sale ${saleHeaderId} is not posted to AR`);
  const invoice = await findOneExact(db.arInvoiceHeader, { where: { id: sale.arInvoiceId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!invoice || invoice.status === 'cancelled') throw new LoanError(409, `AR invoice for sale ${saleHeaderId} not found or cancelled`);
  const receipts = await findAllExact(db.arReceiveHeaderV2, { where: { invoiceHeaderId: invoice.id, status: 'active' }, transaction });
  const paid = receipts.reduce((s, r) => s + toUnits(r.totalReceivedAmount || '0'), 0n);
  return { sale, invoice, paidUnits: paid, openUnits: toUnits(invoice.totalAmount || '0') - paid };
};

/**
 * DISB pre-checks (spec §4.3): the sale is posted to AR, the down payment has been received, and the
 * invoice's open balance equals the amount the loan settles. Then an AR receipt is created already
 * marked glPostingStatus 'posted' (the loan posted the GL), so the POS cash batch never posts it again.
 */
const settleInvoice = async ({ transactionId, txNo, saleHeaderId, units, downPayment, date, userId, drAccountId, crAccountId, currencyId }, transaction) => {
  const { invoice, paidUnits, openUnits } = await invoiceForSale(saleHeaderId, transaction);
  if (paidUnits < toUnits(downPayment || '0')) throw new LoanError(409, `Down payment not received: ${fromUnits(paidUnits)} paid, ${downPayment} required`);
  if (openUnits !== units) throw new LoanError(409, `Invoice ${invoice.invoiceNumber} open balance ${fromUnits(openUnits)} does not equal the loan settlement ${fromUnits(units)}`);
  const lines = await findAllExact(db.arInvoiceLine, { where: { invoiceHeaderId: invoice.id }, order: [['lineNumber', 'ASC']], transaction });
  const activeReceipts = await db.arReceiveHeaderV2.findAll({ where: { invoiceHeaderId: invoice.id, status: 'active' }, attributes: ['id'], transaction });
  const allocated = activeReceipts.length && lines.length
    ? await findAllExact(db.arReceiveLine, { where: { invoiceLineId: lines.map(l => l.id), receiveHeaderId: activeReceipts.map(r => r.id) }, transaction })
    : [];
  const amount = pos2(units);
  const receipt = await db.arReceiveHeaderV2.create({
    receiptNumber: `LN-${txNo}`,
    bookingDate: date,
    receivedDate: date,
    invoiceHeaderId: invoice.id,
    totalReceivedAmount: amount,
    paymentMethod: 'other',
    exchangeRate: 1,
    currencyId,
    referenceNumber: txNo,
    notes: `Settled by loan disbursement ${txNo}`,
    inputterId: userId,
    makerId: userId,
    glPostingStatus: 'posted',
    glPostingDate: new Date(),
    glBatchId: txNo
  }, { transaction, userId, reason: `Loan disbursement ${txNo}` });
  // Allocate to invoice lines in order, up to each line's open amount
  let left = units;
  let n = 1;
  for (const line of lines) {
    if (left === 0n) break;
    const already = allocated.filter(a => a.invoiceLineId === line.id).reduce((s, a) => s + toUnits(a.allocatedAmount || '0'), 0n);
    const open = toUnits(line.lineTotal || '0') - already;
    if (open <= 0n) continue;
    const take = open < left ? open : left;
    await db.arReceiveLine.create({
      receiveHeaderId: receipt.id, lineNumber: n++, invoiceLineId: line.id, allocatedAmount: pos2(take),
      allocationDate: date, description: `Loan ${txNo}`, DRglAccountId: drAccountId, CRglAccountId: crAccountId, makerId: userId
    }, { transaction });
    left -= take;
  }
  if (left > 0n) {
    await db.arReceiveLine.create({
      receiveHeaderId: receipt.id, lineNumber: n, invoiceLineId: null, allocatedAmount: pos2(left),
      allocationDate: date, description: `Loan ${txNo} (header balance)`, DRglAccountId: drAccountId, CRglAccountId: crAccountId, makerId: userId
    }, { transaction });
  }
  const after = await syncInvoice(invoice.id, { userId, reason: `Loan disbursement ${txNo}` }, transaction);
  if (!after || after.status !== 'paid') throw new LoanError(409, `Invoice ${invoice.invoiceNumber} did not become paid after the loan settlement`);
  await link(transactionId, 'ARReceiveHeader', receipt.id, 'AR_SETTLEMENT', transaction);
  return receipt;
};

/**
 * Invoice status after a loan receipt or void. The POS helper ReceiveHeader.syncInvoiceStatus is called
 * first, but in this codebase it looks up sequelize.models.arInvoiceHeader, which is not registered
 * under that name, so it does nothing (POS defect, reported, not changed here). The same rule is then
 * applied here inside the caller's transaction: active receipts >= total -> paid; a paid invoice that
 * is no longer covered goes back to overdue (past due date) or sent.
 */
const syncInvoice = async (invoiceId, { userId, reason }, transaction) => {
  await db.arReceiveHeaderV2.syncInvoiceStatus(invoiceId, { transaction, userId, reason });
  const invoice = await findOneExact(db.arInvoiceHeader, { where: { id: invoiceId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!invoice || invoice.status === 'cancelled') return invoice;
  const receipts = await findAllExact(db.arReceiveHeaderV2, { where: { invoiceHeaderId: invoiceId, status: 'active' }, transaction });
  const paid = receipts.reduce((s, r) => s + toUnits(r.totalReceivedAmount || '0'), 0n);
  const total = toUnits(invoice.totalAmount || '0');
  let status = invoice.status;
  if (total > 0n && paid >= total) status = 'paid';
  else if (invoice.status === 'paid') status = invoice.dueDate && String(invoice.dueDate) < new Date().toISOString().slice(0, 10) ? 'overdue' : 'sent';
  // hooks: false — the POS invoice beforeUpdate audit hook inserts outside the caller's transaction and
  // would wait on this transaction's row lock until the socket times out (POS defect, reported)
  if (status !== invoice.status) await db.arInvoiceHeader.update({ status, updateUserId: userId }, { where: { id: invoiceId }, transaction, hooks: false });
  return { ...invoice.get({ plain: true }), status };
};

// REVERSAL of a DISB: void the loan's AR receipt and re-sync the invoice status
const voidReceipt = async ({ receiptId, txNo, userId }, transaction) => {
  const receipt = await db.arReceiveHeaderV2.findByPk(receiptId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!receipt) throw new LoanError(409, `AR receipt ${receiptId} not found`);
  if (receipt.status !== 'active') throw new LoanError(409, `AR receipt ${receipt.receiptNumber} is ${receipt.status}`);
  await receipt.update({ status: 'voided', updateUserId: userId }, { transaction, userId, reason: `Loan reversal ${txNo}` });
  await syncInvoice(receipt.invoiceHeaderId, { userId, reason: `Loan reversal ${txNo}` }, transaction);
  return receipt;
};

module.exports = { bankMovement, settleInvoice, voidReceipt, invoiceForSale };
