/**
 * Opt-in loan section for the POS balance sheet without a project (SPF BS_INCLUDE_LOAN_BOOK = 'true').
 * - Loan asset / liability lines: GL balances of the accounts in AUTHORIZED ln_role_gl_mapping
 *   (MAPPING_TABLE roles only, so cash/bank and the sale receivable, which the report already takes
 *   from subledgers, are not counted twice; off-balance memo accounts are excluded).
 * - "Loan result": loan revenue minus loan expense from the GL, shown as its own equity line so the
 *   report's Other equity plug cannot absorb it.
 * - Reconciliation: GL cash/bank and AR balances against the subledger totals the report uses.
 * Sums are exact (decimal strings); values are returned as numbers only because the report is numeric.
 */
const db = require('../../models');
const N = require('../engine/num');

const glBalances = async (accountIds, asOfDate) => {
  if (!accountIds.length) return {};
  const rows = await db.sequelize.query(`
    SELECT a.id,
           CAST(COALESCE(SUM(CASE WHEN g.drAccountId = a.id THEN g.localDebit END), 0) AS CHAR) AS dr,
           CAST(COALESCE(SUM(CASE WHEN g.crAccountId = a.id THEN g.localCredit END), 0) AS CHAR) AS cr
      FROM chart_of_account a
      LEFT JOIN general_ledger g ON (g.drAccountId = a.id OR g.crAccountId = a.id) AND g.status = 'POSTED' AND g.bookingDate <= :asOfDate
     WHERE a.id IN (:ids)
     GROUP BY a.id`, { replacements: { ids: accountIds, asOfDate }, type: db.Sequelize.QueryTypes.SELECT });
  return Object.fromEntries(rows.map(r => [r.id, { dr: N.of(r.dr), cr: N.of(r.cr) }]));
};

const num = v => Number(N.roundHalfUp(v, 2));

const spfAccountId = async (code) => {
  const p = await db.spf.findOne({ where: { code } });
  if (!p || !p.value) return null;
  const a = await db.chartAccount.findOne({ where: { accountNumber: String(p.value).trim() } });
  return a ? a.id : null;
};

const build = async ({ asOfDate, subledger }) => {
  const mappings = (await db.lnRoleGlMapping.findAll({ where: { authStatus: 'AUTHORIZED' } }))
    .filter(m => String(m.effectiveFrom) <= asOfDate && (!m.effectiveTo || String(m.effectiveTo) >= asOfDate));
  const ids = [...new Set(mappings.map(m => m.chartAccountId))];
  const accounts = ids.length ? await db.chartAccount.findAll({ where: { id: ids } }) : [];
  const bal = await glBalances(ids, asOfDate);
  const assets = [];
  const liabilities = [];
  let revenue = N.ZERO;
  let expense = N.ZERO;
  for (const a of accounts) {
    const b = bal[a.id] || { dr: N.ZERO, cr: N.ZERO };
    if (a.accountType === 'Asset') assets.push({ accountNumber: a.accountNumber, accountName: `${a.accountName} (loan)`, balance: N.sub(b.dr, b.cr) });
    else if (a.accountType === 'Liability') liabilities.push({ accountNumber: a.accountNumber, accountName: `${a.accountName} (loan)`, balance: N.sub(b.cr, b.dr) });
    else if (a.accountType === 'Revenue') revenue = N.add(revenue, N.sub(b.cr, b.dr));
    else if (a.accountType === 'Expense') expense = N.add(expense, N.sub(b.dr, b.cr));
  }
  const keep = list => list.filter(x => !N.isZero(x.balance));
  const loanAssets = keep(assets);
  const loanLiabilities = keep(liabilities);

  // GL vs subledger: cash/bank accounts (chart numbers equal to active bank accounts, plus the GL_MAP cash/bank
  // parameters) against the bank balances; the GL_MAP_AR_ACC account against the AR invoice balances
  const banks = await db.bankAccount.findAll({ where: { isActive: true }, attributes: ['accountNumber'] });
  const bankCharts = await db.chartAccount.findAll({ where: { accountNumber: banks.map(b => b.accountNumber) }, attributes: ['id'] });
  const cashIds = [...new Set([...bankCharts.map(c => c.id), await spfAccountId('GL_MAP_CASH_ACC'), await spfAccountId('GL_MAP_BANK_ACC')].filter(Boolean))];
  const arId = await spfAccountId('GL_MAP_AR_ACC');
  const recon = await glBalances([...cashIds, arId].filter(Boolean), asOfDate);
  const debitBalance = list => list.reduce((s, id) => (recon[id] ? N.add(s, N.sub(recon[id].dr, recon[id].cr)) : s), N.ZERO);
  const glCash = debitBalance(cashIds);
  const glAr = arId ? debitBalance([arId]) : N.ZERO;
  // The report's subledger totals are POS floats; read them at 4 decimals for the comparison only
  const subCash = N.of(Number(subledger.cashAndBank || 0).toFixed(4));
  const subAr = N.of(Number(subledger.ar || 0).toFixed(4));

  // Phase 5: the currency position account (cross-currency DISB) must net to zero in base (addendum §8.4, Q34)
  const positionIds = [...new Set(mappings.filter(m => m.roleCode === 'CCY_POSITION').map(m => m.chartAccountId))];
  const posBal = positionIds.length ? await glBalances(positionIds, asOfDate) : {};
  const glPosition = positionIds.reduce((s, id) => (posBal[id] ? N.add(s, N.sub(posBal[id].dr, posBal[id].cr)) : s), N.ZERO);

  const out = list => list.map(x => ({ ...x, balance: num(x.balance) }));
  return {
    assets: out(loanAssets),
    liabilities: out(loanLiabilities),
    totalAssets: num(N.sum(loanAssets.map(x => x.balance))),
    totalLiabilities: num(N.sum(loanLiabilities.map(x => x.balance))),
    loanResult: num(N.sub(revenue, expense)),
    reconciliation: {
      cashAndBank: { gl: num(glCash), subledger: num(subCash), difference: num(N.sub(glCash, subCash)) },
      accountsReceivable: { gl: num(glAr), subledger: num(subAr), difference: num(N.sub(glAr, subAr)) },
      currencyPosition: { gl: num(glPosition), expected: 0, difference: num(glPosition), accounts: positionIds.length },
      note: 'Differences show postings that reached only the GL or only the subledger (POS or loan).'
    }
  };
};

module.exports = { build };
