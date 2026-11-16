/**
 * Phase 6 Stage 2: bank and cash accounts a branch may post to (ln_branch_bank_account, maker-checker,
 * Parameter Studio entity 'branch-bank-account'). Posting refuses a bankAccountId that is not mapped,
 * AUTHORIZED and active for the account's branch; the transaction dialog lists only the mapped ones.
 * REVERSAL is exempt: it reverses the original bank movement wherever it was.
 *
 * Repayment currency rule (customer policy, 2026-11-15; docs/loan/adding-a-currency.md §4): money moves only
 * through an account in the loan's own currency. An account whose currency is empty (NULL, or the ENUM error
 * value '') or differs from the loan's is refused with 400 before anything is written, for every kind that
 * names a bank account; the list offered to the screens holds only accounts in the loan's currency.
 */
const db = require('../../models');
const { LoanError } = require('../errors');

const mappingWhere = branchId => ({ locationId: branchId, authStatus: 'AUTHORIZED', isActive: true });

const assertBankForBranch = async (bankAccountId, account, transaction) => {
  if (bankAccountId === undefined || bankAccountId === null || bankAccountId === '') return;
  const row = await db.lnBranchBankAccount.findOne({ where: { ...mappingWhere(account.branchId), bankAccountId: Number(bankAccountId) }, transaction });
  if (!row) throw new LoanError(400, `Bank account ${bankAccountId} is not mapped to branch ${account.branchId} (an AUTHORIZED, active branch-bank-account row is needed); nothing was posted`);
  await assertBankCurrency(bankAccountId, account, transaction);
};

const loanCurrencyCode = async (account, transaction) => {
  const c = await db.currency.findByPk(account.currencyId, { attributes: ['id', 'code'], transaction });
  if (!c) throw new LoanError(409, `Currency ${account.currencyId} of the loan not found`);
  return c.code;
};

// The repayment currency rule: the account must be in the loan's currency (an empty currency is refused too)
const assertBankCurrency = async (bankAccountId, account, transaction) => {
  const bank = await db.bankAccount.findByPk(Number(bankAccountId), { attributes: ['id', 'accountName', 'currency'], transaction });
  if (!bank) throw new LoanError(400, `Bank account ${bankAccountId} not found; nothing was posted`);
  const code = await loanCurrencyCode(account, transaction);
  if (bank.currency === null || bank.currency === undefined || String(bank.currency).trim() === '') {
    throw new LoanError(400, `Bank account ${bank.accountName} has no currency; the loan is ${code} and payments must be in the loan's currency. Set the account's currency in the POS; nothing was posted`);
  }
  if (bank.currency !== code) throw new LoanError(400, `Bank account ${bank.accountName} is ${bank.currency}; the loan is ${code} and payments must be in the loan's currency; nothing was posted`);
};

// The mapped accounts of a loan account's branch, for the transaction dialog
const listForAccount = async (accountId) => {
  const account = await db.lnAccount.findByPk(accountId, { attributes: ['id', 'branchId', 'currencyId'] });
  if (!account) throw new LoanError(404, `Account ${accountId} not found`);
  const rows = await db.lnBranchBankAccount.findAll({ where: mappingWhere(account.branchId), order: [['id', 'ASC']] });
  const code = await loanCurrencyCode(account);
  const banks = rows.length ? (await db.bankAccount.findAll({ where: { id: rows.map(r => r.bankAccountId), isActive: true } })).filter(b => b.currency === code) : [];
  const byId = Object.fromEntries(banks.map(b => [b.id, b]));
  return rows.filter(r => byId[r.bankAccountId]).map(r => {
    const b = byId[r.bankAccountId];
    return { id: b.id, accountNumber: b.accountNumber, accountName: b.accountName, currency: b.currency, purpose: r.purpose, isActive: true };
  });
};

module.exports = { assertBankForBranch, assertBankCurrency, listForAccount };
