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
const { validateJournal } = require('../accounting/validators');
const { toUnits } = require('../accounting/journal');
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

const baseCurrency = async (account, transaction) => {
  const currency = await db.currency.findByPk(account.currencyId, { transaction });
  if (!currency) throw new LoanError(409, `Currency ${account.currencyId} not found`);
  if (!(currency.isLocalCCY === true || currency.isLocalCCY === 1)) {
    throw new LoanError(409, `Posting supports base-currency loans only in Phase 4 (this loan is ${currency.code})`);
  }
  return currency;
};

const newTransactionRow = async ({ kind, ctx, input, dates, ctxUser, status, transaction }) => db.lnTransaction.create({
  txNo: await nextNumber('LOAN_TRANSACTION', dates.businessDate, transaction),
  branchId: ctx.account.branchId, loanAccountId: ctx.account.id, eventCode: kind, valueDate: dates.valueDate,
  postingDate: dates.businessDate, bookingDate: dates.bookingDate, valueDatedAdjustment: dates.valueDatedAdjustment,
  amount: 0, baseAmount: 0, currencyId: ctx.account.currencyId, exchangeRate: '1',
  paymentMethod: input.paymentMethod || (input.bankAccountId ? 'BANK' : 'NONE'), paymentMethodId: input.paymentMethodId || null,
  bankAccountId: input.bankAccountId || null, postingStatus: status, authStatus: status === 'PENDING_AUTH' ? 'PENDING' : 'AUTHORIZED',
  makerId: ctxUser.userId, source: 'ONLINE', requestJson: JSON.stringify(input), remarks: input.remarks || null
}, { transaction });

const summary = (txn, out, journal, extra = {}) => ({
  transactionId: txn.id, txNo: txn.txNo, eventCode: txn.eventCode, postingStatus: txn.postingStatus,
  valueDate: String(txn.valueDate), bookingDate: txn.bookingDate ? String(txn.bookingDate) : null, valueDatedAdjustment: Boolean(txn.valueDatedAdjustment),
  amount: String(txn.amount), events: out ? out.events : [],
  journal: journal ? journal.lines.map(l => ({ event: l.eventCode, tag: l.amountTag, drCr: l.drCr, role: l.roleCode, qualifier: l.qualifier, chartAccountId: l.chartAccountId, amount: l.amount })) : [],
  glRows: journal ? journal.glRows.map(r => r.id) : [],
  details: out ? out.details || null : null,
  ...extra
});

/**
 * Posts one transaction inside `transaction`. pending: an existing PENDING_AUTH row being authorized.
 */
const post = async ({ kind, accountId, input, ctxUser, pending, transaction, hook, tamper }) => {
  await G.assertPostingEnabled(transaction);
  await G.assertTaxProfile(kind, transaction);
  const ctx = await S.loadAccount(accountId, transaction);
  const currency = await baseCurrency(ctx.account, transaction);
  const productRow = await db.lnProduct.findByPk(ctx.snapshot.product.id, { transaction });
  const dates = await G.resolveDates({ kind, valueDate: input.valueDate, product: productRow, transaction });
  ctx.live = await loanCtx.classification(dates.valueDate);
  if (!(ctx.account.status in ctx.live.statusMaster)) throw new LoanError(409, `Status ${ctx.account.status} is not AUTHORIZED in the status master`);

  const txn = pending || await newTransactionRow({ kind, ctx, input, dates, ctxUser, status: 'POSTED', transaction });
  if (pending) await txn.update({ valueDate: dates.valueDate, postingDate: dates.businessDate, bookingDate: dates.bookingDate, valueDatedAdjustment: dates.valueDatedAdjustment }, { transaction });
  hook('AFTER_TRANSACTION');

  const effects = new S.Effects(transaction);
  const out = await handlers[kind](ctx, input, effects, { dates, transaction, txn, ctxUser });
  const check = await checkProductRow(ctx.product, { transaction, asOfDate: dates.valueDate });
  if (!check.ok) throw new LoanError(409, `${ctx.product.productCode} accounting entry rules are incomplete`, check.errors);

  const resolver = await makeResolver({ date: dates.valueDate, transaction });
  const journal = await postJournal(out.events, {
    product: ctx.product, account: ctx.account, bankAccountId: input.bankAccountId, currencyId: ctx.account.currencyId,
    valueDate: dates.valueDate, bookingDate: dates.bookingDate, transactionId: txn.id, postingReference: txn.txNo,
    description: `Loan ${ctx.account.accountNo} ${out.eventCode}${dates.valueDatedAdjustment ? ` (value-dated adjustment for ${dates.valueDate})` : ''}`,
    resolver, hook, tamper
  }, transaction);

  let bankEntry = null;
  if (journal.cashNetUnits !== 0n) {
    bankEntry = await bankMovement({ transactionId: txn.id, txNo: txn.txNo, bankAccountId: input.bankAccountId, units: journal.cashNetUnits, currencyCode: currency.code, description: `${out.eventCode} ${ctx.account.accountNo}`, userId: ctxUser.userId }, transaction);
  }
  hook('AFTER_BANK');
  let receipt = null;
  if (out.settlesInvoice && journal.saleReceivableCreditUnits > 0n) {
    if (!ctx.account.saleHeaderId) throw new LoanError(409, 'The account has no vehicle sale to settle');
    const lp = journal.lines.find(l => l.roleCode === 'LOAN_PORTFOLIO' && l.drCr === 'DR');
    const ar = journal.lines.find(l => l.roleCode === 'SALE_RECEIVABLE' && l.drCr === 'CR');
    receipt = await settleInvoice({ transactionId: txn.id, txNo: txn.txNo, saleHeaderId: ctx.account.saleHeaderId, units: journal.saleReceivableCreditUnits, downPayment: String(ctx.account.downPaymentAmount), date: dates.bookingDate, userId: ctxUser.userId, drAccountId: lp && lp.chartAccountId, crAccountId: ar && ar.chartAccountId, currencyId: ctx.account.currencyId }, transaction);
  }
  hook('AFTER_AR');

  await txn.update({
    eventCode: out.eventCode, amount: out.amount, baseAmount: out.amount, postingStatus: 'POSTED', authStatus: 'AUTHORIZED',
    eventsJson: JSON.stringify(out.events), effectsJson: JSON.stringify(effects.list),
    ...(pending ? { checkerId: ctxUser.userId, authorizedAt: new Date() } : {})
  }, { transaction });
  await audit(txn, pending ? (ctxUser.self ? 'SELF_AUTH' : 'AUTH') : 'POST', ctxUser, { kind, amount: out.amount }, transaction);
  hook('BEFORE_COMMIT');
  return summary(txn, out, journal, { bankEntryId: bankEntry ? bankEntry.id : null, arReceiptId: receipt ? receipt.id : null });
};

/**
 * REVERSAL (LIFO): mirrors the target's journal legs and GL rows, reverses its bank movement, voids
 * its AR receipt and undoes its recorded subledger effects.
 */
const reverse = async ({ accountId, input, ctxUser, pending, transaction, hook }) => {
  await G.assertPostingEnabled(transaction);
  const ctx = await S.loadAccount(accountId, transaction);
  await baseCurrency(ctx.account, transaction);
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
  const mirrored = legs.map(l => ({ eventCode: 'REVERSAL', amountTag: l.amountTag, drCr: l.drCr === 'DR' ? 'CR' : 'DR', roleCode: l.roleCode, qualifier: l.statusQualifier, chartAccountId: l.chartAccountId, currency: l.currencyId, amount: l.amount }));
  const errors = validateJournal(mirrored, roleTypes);
  if (errors.length) throw new LoanError(409, `Reversal journal failed validation: ${errors.join('; ')}`, errors);
  const postings = [];
  for (const m of mirrored) {
    postings.push(await db.lnJournalPosting.create({ transactionId: txn.id, loanAccountId: ctx.account.id, eventCode: 'REVERSAL', amountTag: m.amountTag, roleCode: m.roleCode, statusQualifier: m.qualifier, chartAccountId: m.chartAccountId, drCr: m.drCr, currencyId: m.currency, amount: m.amount, baseAmount: m.amount, exchangeRate: '1' }, { transaction }));
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
    await bankMovement({ transactionId: txn.id, txNo: txn.txNo, bankAccountId: entry.bankAccountId, units, currencyCode: null, description: `REVERSAL of ${target.txNo}`, userId: ctxUser.userId }, transaction);
  }
  hook('AFTER_BANK');
  for (const l of links.filter(x => x.posTable === 'ARReceiveHeader')) {
    await voidReceipt({ receiptId: l.posId, txNo: txn.txNo, userId: ctxUser.userId }, transaction);
    await db.lnPosLink.create({ transactionId: txn.id, posTable: 'ARReceiveHeader', posId: l.posId, role: 'AR_VOID' }, { transaction });
  }
  hook('AFTER_AR');

  await target.update({ isReversed: true }, { transaction });
  await txn.update({
    eventCode: 'REVERSAL', reversalOfTxId: target.id, amount: target.amount, baseAmount: target.amount, postingStatus: 'POSTED', authStatus: 'AUTHORIZED',
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
        if (KINDS[kind].checker) {
          // Dry run in a savepoint: every guard, engine step and validator runs; nothing is kept
          let preview = null;
          try {
            await db.sequelize.transaction({ transaction }, async (sp) => {
              preview = await execute(kind, { accountId, input, ctxUser, pending: null, transaction: sp, hook: () => {} });
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
          response = { transactionId: txn.id, txNo: txn.txNo, eventCode: kind, postingStatus: 'PENDING_AUTH', amount: preview.amount, preview: { events: preview.events, journal: preview.journal } };
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

  async authorize(txId, ctxUser, failAt) {
    const hook = G.makeTestHook(failAt);
    return db.sequelize.transaction(async (transaction) => {
      const txn = await db.lnTransaction.findByPk(txId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!txn) throw new LoanError(404, `Transaction ${txId} not found`);
      if (txn.postingStatus !== 'PENDING_AUTH') throw new LoanError(409, `${txn.txNo} is ${txn.postingStatus}, not PENDING_AUTH`);
      const self = Number(txn.makerId) === Number(ctxUser.userId);
      if (self && !(await selfAuthorizeAllowed(transaction))) throw new LoanError(403, 'Maker cannot authorize their own transaction (LOAN_ALLOW_SELF_AUTHORIZE is off)');
      const input = JSON.parse(txn.requestJson || '{}');
      const body = await execute(txn.eventCode, { accountId: txn.loanAccountId, input, ctxUser: { ...ctxUser, self }, pending: txn, transaction, hook });
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
