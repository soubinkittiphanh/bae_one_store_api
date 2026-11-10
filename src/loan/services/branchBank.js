/**
 * Phase 6 Stage 2: bank and cash accounts a branch may post to (ln_branch_bank_account, maker-checker,
 * Parameter Studio entity 'branch-bank-account'). Posting refuses a bankAccountId that is not mapped,
 * AUTHORIZED and active for the account's branch; the transaction dialog lists only the mapped ones.
 * REVERSAL is exempt: it reverses the original bank movement wherever it was.
 */
const db = require('../../models');
const { LoanError } = require('../errors');

const mappingWhere = branchId => ({ locationId: branchId, authStatus: 'AUTHORIZED', isActive: true });

const assertBankForBranch = async (bankAccountId, account, transaction) => {
  if (bankAccountId === undefined || bankAccountId === null || bankAccountId === '') return;
  const row = await db.lnBranchBankAccount.findOne({ where: { ...mappingWhere(account.branchId), bankAccountId: Number(bankAccountId) }, transaction });
  if (!row) throw new LoanError(400, `Bank account ${bankAccountId} is not mapped to branch ${account.branchId} (an AUTHORIZED, active branch-bank-account row is needed); nothing was posted`);
};

// The mapped accounts of a loan account's branch, for the transaction dialog
const listForAccount = async (accountId) => {
  const account = await db.lnAccount.findByPk(accountId, { attributes: ['id', 'branchId', 'currencyId'] });
  if (!account) throw new LoanError(404, `Account ${accountId} not found`);
  const rows = await db.lnBranchBankAccount.findAll({ where: mappingWhere(account.branchId), order: [['id', 'ASC']] });
  const banks = rows.length ? await db.bankAccount.findAll({ where: { id: rows.map(r => r.bankAccountId), isActive: true } }) : [];
  const byId = Object.fromEntries(banks.map(b => [b.id, b]));
  return rows.filter(r => byId[r.bankAccountId]).map(r => {
    const b = byId[r.bankAccountId];
    return { id: b.id, accountNumber: b.accountNumber, accountName: b.accountName, currency: b.currency, purpose: r.purpose, isActive: true };
  });
};

module.exports = { assertBankForBranch, listForAccount };
