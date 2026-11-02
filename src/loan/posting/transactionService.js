/**
 * Loan transactions (Phase 4). One DB transaction per loan transaction covers ln_transaction, the
 * subledger changes, ln_journal_posting, the POS general_ledger rows and the POS bank / AR rows: all or
 * nothing. Order inside: idempotency claim -> account row lock -> guards -> engine -> 2B validators ->
 * writes. Kinds that move cash out or change the loan materially need a second person (maker-checker);
 * they are stored PENDING_AUTH after a dry run and posted at authorization.
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const loanCtx = require('../services/loanContext');
const { checkProductRow } = require('../services/accountingService');
const { nextNumber } = require('../services/numberingService');
const { validateJournal, validateBase } = require('../accounting/validators');
const { toUnits, fromUnits } = require('../accounting/journal');
const FX = require('../accounting/fx');
const { fxFor, settlementFor } = require('./fxContext');
const { findAllExact } = require('../db/exact');
const AccountingPostingService = require('../../GL/accountingPostingService');
const G = require('./guards');
const S = require('./accountState');
const { makeResolver } = require('./glResolver');
const { postJournal } = require('./journalWriter');
const { bankMovement, settleInvoice, voidReceipt } = require('./posAdapters');
const { handlers } = require('./handlers');

// D4 (+ INS_REMIT, ADV_REFUND): cash outflows and material changes need a second person
const KINDS = {
  FEE_COLLECT: { checker: false }, REPAYMENT: { checker: false }, PREPAY: { checker: false }, RECOVERY: { checker: false },
  DISB: { checker: true }, FEE_REFUND: { checker: true }, INS_REMIT: { checker: true }, ADV_REFUND: { checker: true },
  WAIVE: { checker: true }, WRITE_OFF: { checker: true }, REPOSSESS: { checker: true }, VEH_DISPOSE: { checker: true },
  REVERSAL: { checker: true }
};
const ENDPOINT = 'POST /loan/accounts/:id/transactions';

class DryRun extends Error {}

const audit = (txn, actionType, ctxUser, values, transaction) => db.lnAuditLog.create({
  entityName: 'loan-transaction', entityId: txn.id, entityKey: txn.txNo, actionType,
  newValuesJson: values ? JSON.stringify(values) : null, userId: ctxUser.userId || 0, ipAddress: ctxUser.ip || null, timestamp: new Date()
}, { transaction });

const selfAuthorizeAllowed = async transaction => (await G.spfValue('LOAN_ALLOW_SELF_AUTHORIZE', transaction)) === 'true';

// USE_BUSINESS_DATE = 'Y' (manual POS COB): loan bank entries carry the POS business date (Phase 4);
// otherwise the POS date goes stale, so they carry the loan business date (Phase 5, decision D8)
const bankBusinessDate = async (dates, transaction) => ((await G.spfValue('USE_BUSINESS_DATE', transaction)) === 'Y' ? undefined : dates.businessDate);

const newTransactionRow = async ({ kind, ctx, input, dates, ctxUser, status, transaction }) => db.lnTransaction.create({
  txNo: await nextNumber('LOAN_TRANSACTION', dates.businessDate, transaction),
  branchId: ctx.account.branchId, loanAccountId: ctx.account.id, eventCode: kind, valueDate: dates.valueDate,
  postingDate: dates.businessDate, bookingDate: dates.bookingDate, valueDatedAdjustment: dates.valueDatedAdjustment,
  amount: 0, baseAmount: 0, currencyId: ctx.account.currencyId, exchangeRate: '1',
  paymentMethod: input.paymentMethod || (input.bankAccountId ? 'BANK' : 'NONE'), paymentMethodId: input.paymentMethodId || null,
  bankAccountId: input.bankAccountId || null, postingStatus: status, authStatus: status === 'PENDING_AUTH' ? 'PENDING' : 'AUTHORIZED',
  makerId: ctxUser.userId, source: 'ONLINE', requestJson: JSON.stringify(input), remarks: input.remarks || null
}, { transaction });

const fxSummary = fx => (fx ? { rate: fx.rate, rateDate: fx.rateDate, baseCurrency: fx.baseCode, warnings: fx.warnings, warning: fx.warnings.join(' | ') || null } : undefined);
const summary = (txn, out, journal, extra = {}) => ({
  transactionId: txn.id, txNo: txn.txNo, eventCode: txn.eventCode, postingStatus: txn.postingStatus,
  valueDate: String(txn.valueDate), bookingDate: txn.bookingDate ? String(txn.bookingDate) : null, valueDatedAdjustment: Boolean(txn.valueDatedAdjustment),
  amount: String(txn.amount), events: out ? out.events : [],
  journal: journal ? journal.lines.map(l => ({ event: l.eventCode, tag: l.amountTag, drCr: l.drCr, role: l.roleCode, qualifier: l.qualifier, chartAccountId: l.chartAccountId, amount: l.amount, ...(l.baseAmount !== undefined ? { currencyId: l.currency, baseAmount: l.baseAmount, isBaseOnly: Boolean(l.isBaseOnly) } : {}) })) : [],
  glRows: journal ? journal.glRows.map(r => r.id) : [],
  details: out ? out.details || null : null,
  ...extra
});

/**
 * Posts one transaction inside `transaction`. pending: an existing PENDING_AUTH row being authorized.
 */
const post = async ({ kind, accountId, input, ctxUser, pending, transaction, hook, tamper, dryRun }) => {
  await G.assertPostingEnabled(transaction);
  await G.assertTaxProfile(kind, transaction);
  const ctx = await S.loadAccount(accountId, transaction);
  const productRow = await db.lnProduct.findByPk(ctx.snapshot.product.id, { transaction });
  const dates = await G.resolveDates({ kind, valueDate: input.valueDate, product: productRow, transaction });
  // Phase 5: foreign-currency loans get the booking date's rate (fx = null for base-currency loans)
  const { currency, fx } = await fxFor({ account: ctx.account, bookingDate: dates.bookingDate, input, pending, dryRun, transaction });
  ctx.live = await loanCtx.classification(dates.valueDate);
  if (!(ctx.account.status in ctx.live.statusMaster)) throw new LoanError(409, `Status ${ctx.account.status} is not AUTHORIZED in the status master`);

  const txn = pending || await newTransactionRow({ kind, ctx, input, dates, ctxUser, status: 'POSTED', transaction });
  if (pending) await txn.update({ valueDate: dates.valueDate, postingDate: dates.businessDate, bookingDate: dates.bookingDate, valueDatedAdjustment: dates.valueDatedAdjustment }, { transaction });
  hook('AFTER_TRANSACTION');

  const effects = new S.Effects(transaction);
    // A checker approved only when an existing PENDING_AUTH row is being authorized
  const approverId = pending ? ctxUser.userId : null;
  const out = await handlers[kind](ctx, input, effects, { dates, transaction, txn, ctxUser, approverId });
  const check = await checkProductRow(ctx.product, { transaction, asOfDate: dates.valueDate, currencies: false });
  if (!check.ok) throw new LoanError(409, `${ctx.product.productCode} accounting entry rules are incomplete`, check.errors);

  // Phase 5: DISB settling the invoice carries the invoice base over (cross-currency via CCY_POSITION)
  let settled = null;
  if (fx && out.settlesInvoice) {
    const principal = ((out.events.find(e => e.event === 'DISB') || {}).tags || {}).PRINCIPAL;
    settled = await settlementFor({ ctx, fx, currency, principal, input, pending, ctxUser, transaction });
    fx.warnings.push(...settled.warnings);
  }

  const resolver = await makeResolver({ date: dates.valueDate, transaction });
  const journal = await postJournal(out.events, {
    product: ctx.product, account: ctx.account, bankAccountId: input.bankAccountId, currencyId: ctx.account.currencyId,
    valueDate: dates.valueDate, bookingDate: dates.bookingDate, transactionId: txn.id, postingReference: txn.txNo,
    description: `Loan ${ctx.account.accountNo} ${out.eventCode}${dates.valueDatedAdjustment ? ` (value-dated adjustment for ${dates.valueDate})` : ''}`,
    resolver, hook, tamper, fx: fx ? { ...fx, settlement: settled ? settled.settlement : undefined } : undefined
  }, transaction);

  let bankEntry = null;
  if (journal.cashNetUnits !== 0n) {
    bankEntry = await bankMovement({ transactionId: txn.id, txNo: txn.txNo, bankAccountId: input.bankAccountId, units: journal.cashNetUnits, currencyCode: currency.code, description: `${out.eventCode} ${ctx.account.accountNo}`, userId: ctxUser.userId, businessDate: await bankBusinessDate(dates, transaction) }, transaction);
  }
  hook('AFTER_BANK');
  let receipt = null;
  if (out.settlesInvoice && journal.saleReceivableCreditUnits > 0n) {
    if (!ctx.account.saleHeaderId) throw new LoanError(409, 'The account has no vehicle sale to settle');
    const lp = journal.lines.find(l => l.roleCode === 'LOAN_PORTFOLIO' && l.drCr === 'DR');
    const ar = journal.lines.find(l => l.roleCode === 'SALE_RECEIVABLE' && l.drCr === 'CR');
    const cross = Boolean(settled && Number(settled.settlement.invoiceCurrencyId) !== Number(ctx.account.currencyId));
    receipt = await settleInvoice({
      transactionId: txn.id, txNo: txn.txNo, saleHeaderId: ctx.account.saleHeaderId, units: journal.saleReceivableCreditUnits, downPayment: String(ctx.account.downPaymentAmount), date: dates.bookingDate, userId: ctxUser.userId, drAccountId: lp && lp.chartAccountId, crAccountId: ar && ar.chartAccountId,
      currencyId: cross ? settled.settlement.invoiceCurrencyId : ctx.account.currencyId, receiptRate: settled && !cross ? settled.settlement.invoiceRate : undefined, crossCurrency: cross
    }, transaction);
  }
  hook('AFTER_AR');

  const baseAmount = fx ? fromUnits(FX.toBase(toUnits(out.amount), FX.rateUnits(fx.rate), fx.baseDecimals)) : out.amount;
  await txn.update({
    eventCode: out.eventCode, amount: out.amount, baseAmount, postingStatus: 'POSTED', authStatus: 'AUTHORIZED',
    eventsJson: JSON.stringify(out.events), effectsJson: JSON.stringify(effects.list),
    ...(fx ? { exchangeRate: fx.rate, exchangeRateDate: fx.rateDate, fxWarning: (fx.warnings.join(' | ') || null) && fx.warnings.join(' | ').slice(0, 255) } : {}),
    ...(pending ? { checkerId: ctxUser.userId, authorizedAt: new Date() } : {})
  }, { transaction });
  await audit(txn, pending ? (ctxUser.self ? 'SELF_AUTH' : 'AUTH') : 'POST', ctxUser, { kind, amount: out.amount, ...(fx ? { rate: fx.rate, manualRate: fx.manual || undefined, rateDeviationReason: input.rateDeviationReason || undefined, acceptedRateDeviation: ctxUser.acceptRateDeviation || undefined } : {}) }, transaction);
  hook('BEFORE_COMMIT');
  return summary(txn, out, journal, { bankEntryId: bankEntry ? bankEntry.id : null, arReceiptId: receipt ? receipt.id : null, ...(fx ? { fx: fxSummary(fx), implied: settled ? settled.implied : undefined } : {}) });
};

/**
 * REVERSAL (LIFO): mirrors the target's journal legs and GL rows, reverses its bank movement, voids
 * its AR receipt and undoes its recorded subledger effects.
 */
const reverse = async ({ accountId, input, ctxUser, pending, transaction, hook }) => {
  await G.assertPostingEnabled(transaction);
  const ctx = await S.loadAccount(accountId, transaction);
  const target = await db.lnTransaction.findByPk(input.targetTransactionId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!target || Number(target.loanAccountId) !== Number(ctx.account.id)) throw new LoanError(404, `Transaction ${input.targetTransactionId} not found on this account`);
  if (target.postingStatus !== 'POSTED' || target.isReversed || target.eventCode === 'REVERSAL' || target.source !== 'ONLINE') {
    throw new LoanError(409, `${target.txNo} cannot be reversed (${target.postingStatus}${target.isReversed ? ', already reversed' : ''}, ${target.eventCode}, ${target.source})`);
  }
  const later = await db.lnTransaction.findOne({
    where: { loanAccountId: ctx.account.id, source: 'ONLINE', postingStatus: 'POSTED', isReversed: false, id: { [db.Sequelize.Op.gt]: target.id } },
    order: [['id', 'DESC']], transaction
  });
  if (later && later.eventCode !== 'REVERSAL') throw new LoanError(409, `Reversal is LIFO: reverse the later transaction ${later.txNo} (${later.eventCode}) first`);
  const dates = await G.resolveDates({ kind: 'REVERSAL', valueDate: input.valueDate, product: null, transaction });
  const txn = pending || await newTransactionRow({ kind: 'REVERSAL', ctx, input, dates, ctxUser, status: 'POSTED', transaction });
  hook('AFTER_TRANSACTION');

  await S.undoEffects(JSON.parse(target.effectsJson || '[]'), transaction);
  const legs = await findAllExact(db.lnJournalPosting, { where: { transactionId: target.id }, order: [['id', 'ASC']], transaction });
  const roles = await db.lnAccountingRole.findAll({ transaction });
  const roleTypes = Object.fromEntries(roles.map(r => [r.roleCode, r.expectedType]));
  // Exact mirror: same chart account, currency, amount, rate and base amount (Phase 5: base-only legs too)
  const mirrored = legs.map(l => ({ eventCode: 'REVERSAL', amountTag: l.amountTag, drCr: l.drCr === 'DR' ? 'CR' : 'DR', roleCode: l.roleCode, qualifier: l.statusQualifier, chartAccountId: l.chartAccountId, currency: l.currencyId, amount: l.amount, baseAmount: l.baseAmount, exchangeRate: l.exchangeRate, isBaseOnly: Boolean(l.isBaseOnly) }));
  const errors = validateJournal(mirrored, roleTypes);
  const base = await require('../services/fxRateService').baseCurrency(transaction);
  if (Number(ctx.account.currencyId) !== Number(base.id)) {
    const baseDecimals = Number((await require('../services/loanContext').currencyRule(base.id, String(target.bookingDate || target.valueDate), false)).decimalPlaces);
    errors.push(...validateBase(mirrored, roleTypes, { loanCurrencyId: ctx.account.currencyId, baseCurrencyId: base.id, baseDecimals, maxRoundDiff: Number.MAX_SAFE_INTEGER }));
  }
  if (errors.length) throw new LoanError(409, `Reversal journal failed validation: ${errors.join('; ')}`, errors);
  const postings = [];
  for (const m of mirrored) {
    postings.push(await db.lnJournalPosting.create({ transactionId: txn.id, loanAccountId: ctx.account.id, eventCode: 'REVERSAL', amountTag: m.amountTag, roleCode: m.roleCode, statusQualifier: m.qualifier, chartAccountId: m.chartAccountId, drCr: m.drCr, currencyId: m.currency, amount: m.amount, baseAmount: m.baseAmount, exchangeRate: m.exchangeRate, isBaseOnly: m.isBaseOnly }, { transaction }));
  }
  hook('AFTER_JOURNAL');

  const links = await db.lnPosLink.findAll({ where: { transactionId: target.id }, order: [['id', 'ASC']], transaction });
  const glIds = links.filter(l => l.posTable === 'general_ledger').map(l => l.posId);
  const glRows = glIds.length ? await findAllExact(db.gl, { where: { id: glIds }, order: [['id', 'ASC']], transaction }) : [];
  const newGl = await AccountingPostingService.postJournalPairs(glRows.map(r => ({
    drAccountId: r.crAccountId, crAccountId: r.drAccountId, amount: r.debit, localAmount: r.localDebit, currencyId: r.currencyId, rate: r.rate, description: `Reversal of ${target.txNo}: ${r.description}`
  })), { bookingDate: dates.bookingDate, postingReference: txn.txNo, description: `Reversal of ${target.txNo}` }, transaction);
  for (const row of newGl) await db.lnPosLink.create({ transactionId: txn.id, posTable: 'general_ledger', posId: row.id, role: 'GL' }, { transaction });
  hook('AFTER_GL');

  for (const l of links.filter(x => x.posTable === 'transactionEntry')) {
    const entry = await db.transactionEntry.findByPk(l.posId, { transaction });
    const units = l.role === 'BANK_IN' ? -toUnits(String(entry.credit)) : toUnits(String(entry.debit));
    await bankMovement({ transactionId: txn.id, txNo: txn.txNo, bankAccountId: entry.bankAccountId, units, currencyCode: null, description: `REVERSAL of ${target.txNo}`, userId: ctxUser.userId, businessDate: await bankBusinessDate(dates, transaction) }, transaction);
  }
  hook('AFTER_BANK');
  for (const l of links.filter(x => x.posTable === 'ARReceiveHeader')) {
    await voidReceipt({ receiptId: l.posId, txNo: txn.txNo, userId: ctxUser.userId }, transaction);
    await db.lnPosLink.create({ transactionId: txn.id, posTable: 'ARReceiveHeader', posId: l.posId, role: 'AR_VOID' }, { transaction });
  }
  hook('AFTER_AR');

  await target.update({ isReversed: true }, { transaction });
  await txn.update({
    eventCode: 'REVERSAL', reversalOfTxId: target.id, amount: target.amount, baseAmount: target.baseAmount, exchangeRate: target.exchangeRate, exchangeRateDate: target.exchangeRateDate, postingStatus: 'POSTED', authStatus: 'AUTHORIZED',
    eventsJson: JSON.stringify([{ event: 'REVERSAL', reverses: target.txNo }]), effectsJson: '[]',
    ...(pending ? { checkerId: ctxUser.userId, authorizedAt: new Date() } : {})
  }, { transaction });
  await audit(txn, ctxUser.self ? 'SELF_AUTH' : 'AUTH', ctxUser, { reverses: target.txNo }, transaction);
  hook('BEFORE_COMMIT');
  return summary(txn, null, { lines: mirrored, glRows: newGl }, { reverses: target.txNo });
};

const execute = (kind, args) => (kind === 'REVERSAL' ? reverse(args) : post({ kind, ...args }));

const transactionService = {
  KINDS,

  // body: { kind, valueDate?, amount?, bankAccountId?, ... }; returns { status, body }
  async create(accountId, body, ctxUser, idempotencyKey, failAt) {
    const kind = body && body.kind;
    if (!KINDS[kind]) throw new LoanError(400, `kind must be one of ${Object.keys(KINDS).join(', ')}`);
    const input = { ...body };
    delete input.kind;
    if (kind === 'REVERSAL' && !input.targetTransactionId) throw new LoanError(400, 'targetTransactionId is required for REVERSAL');
    const hash = G.requestHash({ accountId: Number(accountId), body });
    const hook = G.makeTestHook(failAt);
    try {
      return await db.sequelize.transaction(async (transaction) => {
        // Account row lock BEFORE the idempotency insert: the insert's foreign-key check takes a shared lock
        // on ln_account, and two requests that both hold it and then ask for FOR UPDATE would deadlock
        const locked = await db.lnAccount.findByPk(accountId, { attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
        if (!locked) throw new LoanError(404, `Account ${accountId} not found`);
        const claim = await G.claimIdempotency({ endpoint: ENDPOINT, accountId: Number(accountId), key: idempotencyKey, hash, transaction });
        if (claim.replay) return claim.replay;
        await G.assertPostingEnabled(transaction);
        let response;
        let status;
        // A manual exchange rate always needs a checker (Phase 5, D2)
        if (KINDS[kind].checker || input.exchangeRate !== undefined) {
          // Dry run in a savepoint: every guard, engine step and validator runs; nothing is kept
          let preview = null;
          try {
            await db.sequelize.transaction({ transaction }, async (sp) => {
              preview = await execute(kind, { accountId, input, ctxUser, pending: null, transaction: sp, hook: () => {}, dryRun: true });
              throw new DryRun();
            });
          } catch (err) {
            if (!(err instanceof DryRun)) throw err;
          }
          const ctx = await S.loadAccount(accountId, transaction);
          const dates = await G.resolveDates({ kind, valueDate: input.valueDate, product: kind === 'DISB' ? await db.lnProduct.findByPk(ctx.snapshot.product.id, { transaction }) : null, transaction });
          const txn = await newTransactionRow({ kind, ctx, input, dates, ctxUser, status: 'PENDING_AUTH', transaction });
          await txn.update({ amount: preview.amount, baseAmount: preview.amount, eventsJson: JSON.stringify(preview.events || []) }, { transaction });
          await audit(txn, 'CREATE', ctxUser, { kind, amount: preview.amount }, transaction);
          response = { transactionId: txn.id, txNo: txn.txNo, eventCode: kind, postingStatus: 'PENDING_AUTH', amount: preview.amount, preview: { events: preview.events, journal: preview.journal, ...(preview.fx ? { fx: preview.fx, implied: preview.implied } : {}) } };
          status = 202;
        } else {
          response = await execute(kind, { accountId, input, ctxUser, pending: null, transaction, hook, tamper: failAt === 'TAMPER_JOURNAL' });
          status = 201;
        }
        await claim.row.update({ status, responseBody: JSON.stringify(response), transactionId: response.transactionId }, { transaction });
        return { status, body: response };
      });
    } catch (err) {
      if (err && err.name === 'SequelizeUniqueConstraintError') {
        // A concurrent request with the same key committed first: replay its response
        const row = await db.lnIdempotency.findOne({ where: { endpoint: ENDPOINT, accountId: Number(accountId), idempotencyKey: idempotencyKey } });
        if (row && row.requestHash === hash && row.responseBody) return { status: row.status, body: JSON.parse(row.responseBody) };
        throw new LoanError(409, 'A request with this Idempotency-Key is still in progress or failed; retry');
      }
      throw err;
    }
  },

  // Read-only pre-submit preview for the 12 write/checker kinds. It runs the SAME guards, engine and
  // validators as create() (posting switch, tax gate, dates, FX / rate-age / implied-rate) inside a
  // transaction that is ALWAYS rolled back, so nothing is written: no idempotency claim, no PENDING_AUTH
  // row, no consumed document number (nextNumber uses the same transaction, so the rollback un-consumes
  // it). No FOR UPDATE lock is taken and the transaction ends at once, so a repayment can post on the
  // same account immediately after. The four simulation previews (due-date/payment/prepayment/status)
  // stay in accountService.preview; this serves the transaction kinds.
  async previewKind(accountId, body, ctxUser) {
    const kind = body && body.kind;
    if (!KINDS[kind]) throw new LoanError(400, `kind must be one of ${Object.keys(KINDS).join(', ')}`);
    const input = { ...body };
    delete input.kind;
    if (kind === 'REVERSAL' && !input.targetTransactionId) throw new LoanError(400, 'targetTransactionId is required for REVERSAL');
    let preview = null;
    try {
      await db.sequelize.transaction(async (transaction) => {
        const acct = await db.lnAccount.findByPk(accountId, { attributes: ['id'], transaction });
        if (!acct) throw new LoanError(404, `Account ${accountId} not found`);
        await G.assertPostingEnabled(transaction); // same posting-switch gate as create(), incl. REVERSAL
        preview = await execute(kind, { accountId, input, ctxUser, pending: null, transaction, hook: () => {}, dryRun: true });
        throw new DryRun(); // roll the whole transaction back: persist nothing, release the account at once
      });
    } catch (err) {
      if (!(err instanceof DryRun)) throw err;
    }
    return {
      status: 200,
      body: {
        kind, dryRun: true, previewedAt: new Date().toISOString(),
        eventCode: preview.eventCode, valueDate: preview.valueDate, bookingDate: preview.bookingDate,
        amount: preview.amount, events: preview.events, journal: preview.journal,
        ...(preview.fx ? { fx: preview.fx } : {}),
        ...(preview.implied ? { implied: preview.implied } : {}),
        ...(preview.reverses ? { reverses: preview.reverses } : {})
      }
    };
  },

  // options.acceptRateDeviation: the checker accepts an implied-rate deviation (LOAN_FX_IMPLIED_RATE_BREACH = CHECKER_OVERRIDE)
  async authorize(txId, ctxUser, failAt, options = {}) {
    const hook = G.makeTestHook(failAt);
    return db.sequelize.transaction(async (transaction) => {
      const txn = await db.lnTransaction.findByPk(txId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!txn) throw new LoanError(404, `Transaction ${txId} not found`);
      if (txn.postingStatus !== 'PENDING_AUTH') throw new LoanError(409, `${txn.txNo} is ${txn.postingStatus}, not PENDING_AUTH`);
      const self = Number(txn.makerId) === Number(ctxUser.userId);
      if (self && !(await selfAuthorizeAllowed(transaction))) throw new LoanError(403, 'Maker cannot authorize their own transaction (LOAN_ALLOW_SELF_AUTHORIZE is off)');
      const input = JSON.parse(txn.requestJson || '{}');
      const body = await execute(txn.eventCode, { accountId: txn.loanAccountId, input, ctxUser: { ...ctxUser, self, acceptRateDeviation: options.acceptRateDeviation === true }, pending: txn, transaction, hook });
      return { status: 200, body };
    });
  },

  async reject(txId, ctxUser, remarks) {
    return db.sequelize.transaction(async (transaction) => {
      const txn = await db.lnTransaction.findByPk(txId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!txn) throw new LoanError(404, `Transaction ${txId} not found`);
      if (txn.postingStatus !== 'PENDING_AUTH') throw new LoanError(409, `${txn.txNo} is ${txn.postingStatus}, not PENDING_AUTH`);
      if (Number(txn.makerId) === Number(ctxUser.userId) && !(await selfAuthorizeAllowed(transaction))) throw new LoanError(403, 'Maker cannot reject their own transaction');
      await txn.update({ postingStatus: 'REJECTED', authStatus: 'REJECTED', checkerId: ctxUser.userId, remarks: remarks || txn.remarks }, { transaction });
      await audit(txn, 'REJECT', ctxUser, { remarks }, transaction);
      return { status: 200, body: { transactionId: txn.id, txNo: txn.txNo, postingStatus: 'REJECTED' } };
    });
  },

  async list(accountId) {
    return findAllExact(db.lnTransaction, { where: { loanAccountId: accountId }, order: [['id', 'ASC']] });
  }
};

module.exports = transactionService;
