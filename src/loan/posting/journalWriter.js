/**
 * Engine events -> validated journal -> ln_journal_posting legs -> POS general_ledger pairs, all in
 * the caller's transaction. Validation (2B validators) runs BEFORE anything is written; any problem
 * throws and the caller's transaction rolls back.
 */
const db = require('../../models');
const AccountingPostingService = require('../../GL/accountingPostingService');
const { LoanError } = require('../errors');
const { resolveRuleSet, buildJournal, toUnits } = require('../accounting/journal');
const { validateJournal, validateBase, validateTagAmounts } = require('../accounting/validators');
const FX = require('../accounting/fx');
const { findAllExact } = require('../db/exact');
const { pairLegs, glRows } = require('./pairing');

const ruleSetFor = async (product, date, transaction) => {
  const rules = (await db.lnAccountingEntryRule.findAll({ transaction })).map(r => r.get({ plain: true }));
  return resolveRuleSet(rules, product, { asOfDate: date });
};

/**
 * events: [{ event, tags, qualifiers }]; ctx: { product, account, bankAccountId, currencyId, valueDate,
 * bookingDate, transactionId, glBatchId, postingReference, description, deferGl, resolver, hook, tamper,
 * fx?, extraLines? }
 * ctx.fx (foreign-currency loans only, Phase 5): { rate, baseCurrencyId, baseDecimals, maxRoundDiff,
 *   settlement?: { invoiceCurrencyId, carryBaseUnits } }. Without it (base-currency loans) every line has
 *   base = amount and rate 1, exactly as in Phase 4.
 * ctx.extraLines: prebuilt base-only lines (month-end revaluation).
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
  const resolve = async (line) => {
    const resolved = await ctx.resolver(line, { ...resolverCtx, currencyId: line.currency || ctx.currencyId });
    line.chartAccountId = resolved.chartAccountId;
    line.offBalance = resolved.roleType === 'Off-Balance';
    roleTypes[line.roleCode] = resolved.roleType;
  };
  let journalLines = lines;
  if (ctx.fx) {
    // Phase 5: carry-over settlement, then base amounts, realized FX and rounding (addendum §8)
    if (ctx.fx.settlement) journalLines = FX.carryOverSettlement(journalLines, { loanCurrencyId: ctx.currencyId, baseCurrencyId: ctx.fx.baseCurrencyId, ...ctx.fx.settlement });
    journalLines = [...journalLines, ...(ctx.extraLines || [])];
    for (const line of journalLines) await resolve(line);
    const history = await findAllExact(db.lnJournalPosting, { where: { loanAccountId: ctx.account.id, roleCode: Object.keys(FX.BUCKETS) }, transaction });
    const converted = FX.applyBase(journalLines, { rate: ctx.fx.rate, loanCurrencyId: ctx.currencyId, baseCurrencyId: ctx.fx.baseCurrencyId, baseDecimals: ctx.fx.baseDecimals, buckets: FX.bucketsFromLegs(history), maxRoundDiff: ctx.fx.maxRoundDiff });
    for (const line of converted.lines.slice(journalLines.length)) await resolve(line);
    journalLines = converted.lines;
    errors.push(...validateJournal(journalLines, roleTypes));
    errors.push(...validateBase(journalLines, roleTypes, { loanCurrencyId: ctx.currencyId, baseCurrencyId: ctx.fx.baseCurrencyId, baseDecimals: ctx.fx.baseDecimals, maxRoundDiff: ctx.fx.maxRoundDiff }));
  } else {
    for (const line of lines) await resolve(line);
    errors.push(...validateJournal(lines, roleTypes));
  }
  if (errors.length) throw new LoanError(409, `Journal failed validation; nothing was posted: ${errors.join('; ')}`, errors);

  const postings = [];
  for (const l of journalLines) {
    postings.push(await db.lnJournalPosting.create({
      transactionId: ctx.transactionId || null, glBatchId: ctx.glBatchId || null, loanAccountId: ctx.account.id,
      eventCode: l.eventCode, amountTag: l.amountTag, roleCode: l.roleCode, statusQualifier: l.qualifier || null,
      chartAccountId: l.chartAccountId, drCr: l.drCr, currencyId: ctx.fx ? (l.currency || ctx.currencyId) : ctx.currencyId, amount: l.amount,
      baseAmount: ctx.fx ? l.baseAmount : l.amount, exchangeRate: ctx.fx ? l.exchangeRate : '1', isBaseOnly: Boolean(l.isBaseOnly)
    }, { transaction }));
  }
  if (ctx.hook) ctx.hook('AFTER_JOURNAL');

  let writtenGl = [];
  if (!ctx.deferGl && journalLines.length) writtenGl = ctx.fx ? await writeGlRowsFx(journalLines, postings, ctx, transaction) : await writeGlPairs(journalLines, postings, ctx, transaction);
  const sumRole = (role, side) => journalLines.filter(l => l.roleCode === role && l.drCr === side && !l.isBaseOnly).reduce((s, l) => s + toUnits(l.amount), 0n);
  return {
    lines: journalLines,
    postings,
    glRows: writtenGl,
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

// Phase 5 (foreign-currency loans): rows carry the contract amount, the base amount and the rate; FX and
// base corrections are base-only rows (debit = credit = 0)
const writeGlRowsFx = async (lines, postings, ctx, transaction) => {
  const step = 10n ** BigInt(4 - ctx.fx.baseDecimals);
  const { rows, legRow } = glRows(lines.map(l => ({ ...l, currencyId: l.currency || ctx.currencyId })), { baseStep: step < 100n ? 100n : step, rowCurrencyId: ctx.currencyId });
  const toWrite = rows.filter(r => !r.sameAccount);
  const written = await AccountingPostingService.postJournalPairs(toWrite.map(r => ({
    drAccountId: r.drAccountId, crAccountId: r.crAccountId, amount: r.amount, localAmount: r.localAmount, currencyId: r.currencyId, rate: r.rate,
    description: `${ctx.description || 'Loan'} ${lines[r.drIndex].eventCode} ${r.baseOnly ? 'base' : `${lines[r.drIndex].amountTag}/${lines[r.crIndex].amountTag}`}`
  })), { bookingDate: ctx.bookingDate, postingReference: ctx.postingReference, description: ctx.description }, transaction);
  const rowOf = new Map(toWrite.map((r, i) => [r, written[i]]));
  for (let i = 0; i < postings.length; i++) {
    const row = legRow[i] === null ? null : rowOf.get(rows[legRow[i]]);
    if (row) await postings[i].update({ glRecordId: row.id }, { transaction });
  }
  if (ctx.transactionId) {
    for (const row of written) await db.lnPosLink.create({ transactionId: ctx.transactionId, posTable: 'general_ledger', posId: row.id, role: 'GL' }, { transaction });
  }
  if (ctx.hook) ctx.hook('AFTER_GL');
  return written;
};

module.exports = { postJournal, writeGlPairs, writeGlRowsFx, ruleSetFor };
