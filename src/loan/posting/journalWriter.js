/**
 * Engine events -> validated journal -> ln_journal_posting legs -> POS general_ledger pairs, all in
 * the caller's transaction. Validation (2B validators) runs BEFORE anything is written; any problem
 * throws and the caller's transaction rolls back.
 */
const db = require('../../models');
const AccountingPostingService = require('../../GL/accountingPostingService');
const { LoanError } = require('../errors');
const { resolveRuleSet, buildJournal, toUnits } = require('../accounting/journal');
const { validateJournal, validateTagAmounts } = require('../accounting/validators');
const { pairLegs } = require('./pairing');

const ruleSetFor = async (product, date, transaction) => {
  const rules = (await db.lnAccountingEntryRule.findAll({ transaction })).map(r => r.get({ plain: true }));
  return resolveRuleSet(rules, product, { asOfDate: date });
};

/**
 * events: [{ event, tags, qualifiers }]; ctx: { product, account, bankAccountId, currencyId, valueDate,
 * bookingDate, transactionId, glBatchId, postingReference, description, deferGl, resolver, hook, tamper }
 */
const postJournal = async (events, ctx, transaction) => {
  const rules = ctx.rules || await ruleSetFor(ctx.product, ctx.valueDate, transaction);
  const lines = [];
  const errors = [];
  for (const ev of events) {
    errors.push(...validateTagAmounts(ev.event, ev.tags, rules));
    lines.push(...buildJournal({ rules, eventCode: ev.event, tags: ev.tags, qualifiers: ev.qualifiers || {}, currency: ctx.currencyId }));
  }
  if (ctx.tamper && lines.length) lines[0] = { ...lines[0], amount: String(toUnits(lines[0].amount) / 10000n + 1n) }; // test hook only
  const resolverCtx = { productId: ctx.product.id, categoryId: ctx.product.categoryId, branchId: ctx.account.branchId, currencyId: ctx.currencyId, bankAccountId: ctx.bankAccountId };
  const roleTypes = {};
  for (const line of lines) {
    const resolved = await ctx.resolver(line, resolverCtx);
    line.chartAccountId = resolved.chartAccountId;
    roleTypes[line.roleCode] = resolved.roleType;
  }
  errors.push(...validateJournal(lines, roleTypes));
  if (errors.length) throw new LoanError(409, `Journal failed validation; nothing was posted: ${errors.join('; ')}`, errors);

  const postings = [];
  for (const l of lines) {
    postings.push(await db.lnJournalPosting.create({
      transactionId: ctx.transactionId || null, glBatchId: ctx.glBatchId || null, loanAccountId: ctx.account.id,
      eventCode: l.eventCode, amountTag: l.amountTag, roleCode: l.roleCode, statusQualifier: l.qualifier || null,
      chartAccountId: l.chartAccountId, drCr: l.drCr, currencyId: ctx.currencyId, amount: l.amount, baseAmount: l.amount, exchangeRate: '1'
    }, { transaction }));
  }
  if (ctx.hook) ctx.hook('AFTER_JOURNAL');

  let glRows = [];
  if (!ctx.deferGl && lines.length) glRows = await writeGlPairs(lines, postings, ctx, transaction);
  const sumRole = (role, side) => lines.filter(l => l.roleCode === role && l.drCr === side).reduce((s, l) => s + toUnits(l.amount), 0n);
  return {
    lines,
    postings,
    glRows,
    cashNetUnits: sumRole('CASH_BANK', 'DR') - sumRole('CASH_BANK', 'CR'),
    saleReceivableCreditUnits: sumRole('SALE_RECEIVABLE', 'CR') - sumRole('SALE_RECEIVABLE', 'DR')
  };
};

// Pairs the legs, writes the POS GL rows (same-account pairs net to zero and are skipped),
// links every leg to its GL row and records the GL rows in ln_pos_link
const writeGlPairs = async (lines, postings, ctx, transaction) => {
  const { pairs, legPair } = pairLegs(lines.map(l => ({ ...l, currencyId: ctx.currencyId })));
  const toWrite = pairs.filter(p => !p.sameAccount);
  const rows = await AccountingPostingService.postJournalPairs(toWrite.map(p => ({
    drAccountId: p.drAccountId, crAccountId: p.crAccountId, amount: p.amount, localAmount: p.amount, currencyId: ctx.currencyId, rate: 1,
    description: `${ctx.description || 'Loan'} ${lines[p.drIndex].eventCode} ${lines[p.drIndex].amountTag}/${lines[p.crIndex].amountTag}`
  // general_ledger.glBatchId references the POS gl_posting_batch table, so loan rows leave it empty and
  // carry the loan transaction number (or EOD batch number) in postingReference
  })), { bookingDate: ctx.bookingDate, postingReference: ctx.postingReference, description: ctx.description }, transaction);
  const rowOfPair = new Map(toWrite.map((p, i) => [p, rows[i]]));
  for (let i = 0; i < postings.length; i++) {
    const pair = legPair[i] === null ? null : pairs[legPair[i]];
    const row = pair ? rowOfPair.get(pair) : null;
    if (row) await postings[i].update({ glRecordId: row.id }, { transaction });
  }
  if (ctx.transactionId) {
    for (const row of rows) await db.lnPosLink.create({ transactionId: ctx.transactionId, posTable: 'general_ledger', posId: row.id, role: 'GL' }, { transaction });
  }
  if (ctx.hook) ctx.hook('AFTER_GL');
  return rows;
};

module.exports = { postJournal, writeGlPairs, ruleSetFor };
