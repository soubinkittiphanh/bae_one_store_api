/**
 * Loan account state for posting: exact (string) reads, the engine state built from the stored
 * schedule, and an effects recorder. Every subledger change a transaction makes is recorded as an
 * effect (stored in ln_transaction.effectsJson) so REVERSAL can undo exactly that change.
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const ctxLoader = require('../services/loanContext');
const { findOneExact, findAllExact } = require('../db/exact');
const { toUnits, fromUnits } = require('../accounting/journal');

const MODELS = ['lnScheduleComponent', 'lnSchedule', 'lnAccount', 'lnStatusHistory', 'lnProvisionLedger', 'lnAccrualLedger', 'lnTransactionAllocation', 'lnAmendmentHistory'];

const loadAccount = async (accountId, transaction, { lock = true } = {}) => {
  const account = await findOneExact(db.lnAccount, { where: { id: accountId }, transaction, lock: lock ? transaction.LOCK.UPDATE : undefined });
  if (!account) throw new LoanError(404, `Account ${accountId} not found`);
  const snapRow = await db.lnAccountParamSnapshot.findOne({ where: { loanAccountId: account.id }, transaction });
  if (!snapRow) throw new LoanError(409, `Account ${account.accountNo} has no parameter snapshot`);
  const snapshot = JSON.parse(snapRow.snapshotJson);
  const components = await db.lnComponent.findAll({ transaction });
  const idOf = Object.fromEntries(components.map(c => [c.componentCode, c.id]));
  const codeOf = Object.fromEntries(components.map(c => [c.id, c.componentCode]));
  return {
    account, snapshot, snapRow, idOf, codeOf,
    componentRows: components,
    product: { ...snapshot.product, id: snapshot.product.id, categoryId: snapshot.product.categoryId, allowBackdatedDisbursement: snapshot.product.allowBackdatedDisbursement },
    rounder: E.rounding.makeRounder(snapshot.currencyRule)
  };
};

const loadSchedule = async (ctx, transaction) => {
  const schedules = await db.lnSchedule.findAll({ where: { loanAccountId: ctx.account.id }, order: [['installmentNo', 'ASC']], transaction });
  const comps = schedules.length ? await findAllExact(db.lnScheduleComponent, { where: { scheduleId: schedules.map(s => s.id) }, transaction }) : [];
  return { schedules, comps };
};

const net = c => toUnits(c.amountDue) - toUnits(c.amountWaived);

// Engine state: due = amountDue - amountWaived; interest bucket from the INTEREST component
const engineState = (ctx, { schedules, comps }) => ({
  installments: schedules.map((s) => {
    const mine = comps.filter(c => c.scheduleId === s.id);
    const components = {};
    let bucket = null;
    for (const c of mine) {
      const code = ctx.codeOf[c.componentId];
      components[code] = { due: fromUnits(net(c)), paid: c.amountPaid };
      if (code === 'INTEREST') bucket = c.bucket;
    }
    components.PENALTY = components.PENALTY || { due: '0', paid: '0' };
    return { no: s.installmentNo, scheduleId: s.id, dueDate: String(s.dueDate), originalDueDate: String(s.originalDueDate), components, interestBucket: bucket || 'BOOKED', recognized: Boolean(bucket) };
  }),
  advanceBalance: ctx.account.advanceBalance
});

const outstanding = c => net(c) - toUnits(c.amountPaid);

class Effects {
  constructor(transaction) {
    this.transaction = transaction;
    this.list = [];
  }

  async delta(modelName, row, field, units) {
    if (units === 0n) return;
    const value = fromUnits(toUnits(String(row[field])) + units);
    await db[modelName].update({ [field]: value }, { where: { id: row.id }, transaction: this.transaction });
    row[field] = value;
    this.list.push({ t: 'delta', model: modelName, id: row.id, field, units: units.toString() });
  }

  async set(modelName, row, field, value) {
    const before = row[field] === undefined ? null : row[field];
    if (String(before) === String(value)) return;
    await db[modelName].update({ [field]: value }, { where: { id: row.id }, transaction: this.transaction });
    row[field] = value;
    this.list.push({ t: 'set', model: modelName, id: row.id, field, before: before === null ? null : String(before), after: value === null ? null : String(value) });
  }

  async create(modelName, values) {
    const row = await db[modelName].create(values, { transaction: this.transaction });
    this.list.push({ t: 'create', model: modelName, id: row.id });
    return row;
  }

  // Replace future installments (partial prepayment / disbursement date change); the old rows are kept in the effect
  async replaceSchedules(removedSchedules, removedComps, newRows, ctx) {
    const removed = removedSchedules.map(s => ({ schedule: s.get ? s.get({ plain: true }) : s, comps: removedComps.filter(c => c.scheduleId === s.id).map(c => (c.get ? c.get({ plain: true }) : c)) }));
    for (const r of removed) {
      await db.lnScheduleComponent.destroy({ where: { scheduleId: r.schedule.id }, transaction: this.transaction });
      await db.lnSchedule.destroy({ where: { id: r.schedule.id }, transaction: this.transaction });
    }
    const added = [];
    for (const row of newRows) {
      const s = await db.lnSchedule.create({ loanAccountId: ctx.account.id, installmentNo: row.no, dueDate: row.dueDate, originalDueDate: row.originalDueDate, status: 'UNPAID' }, { transaction: this.transaction });
      await db.lnScheduleComponent.bulkCreate([
        { scheduleId: s.id, componentId: ctx.idOf.PRINCIPAL, amountDue: row.principal, amountPaid: 0, amountWaived: 0, status: 'UNPAID' },
        { scheduleId: s.id, componentId: ctx.idOf.INTEREST, amountDue: row.interest, amountPaid: 0, amountWaived: 0, status: 'UNPAID' }
      ], { transaction: this.transaction });
      added.push(s.id);
    }
    this.list.push({ t: 'replaceSchedules', removed, added });
  }
}

// Undo recorded effects in reverse order. A 'set' is only undone if the value is still what the
// transaction set (otherwise something later changed it and the reversal is refused).
const undoEffects = async (effects, transaction) => {
  for (const e of [...effects].reverse()) {
    if (!MODELS.includes(e.model) && e.t !== 'replaceSchedules') throw new LoanError(500, `Unknown effect model ${e.model}`);
    if (e.t === 'delta') {
      const row = await findOneExact(db[e.model], { where: { id: e.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw new LoanError(409, `Cannot reverse: ${e.model} ${e.id} no longer exists`);
      await db[e.model].update({ [e.field]: fromUnits(toUnits(String(row[e.field])) - BigInt(e.units)) }, { where: { id: e.id }, transaction });
    } else if (e.t === 'set') {
      const row = await findOneExact(db[e.model], { where: { id: e.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw new LoanError(409, `Cannot reverse: ${e.model} ${e.id} no longer exists`);
      const current = row[e.field] === null || row[e.field] === undefined ? null : String(row[e.field]);
      if (current !== e.after) throw new LoanError(409, `Cannot reverse: ${e.model}.${e.field} changed since (now ${current}, expected ${e.after})`);
      await db[e.model].update({ [e.field]: e.before }, { where: { id: e.id }, transaction });
    } else if (e.t === 'create') {
      await db[e.model].destroy({ where: { id: e.id }, transaction });
    } else if (e.t === 'replaceSchedules') {
      for (const id of e.added) {
        await db.lnScheduleComponent.destroy({ where: { scheduleId: id }, transaction });
        await db.lnSchedule.destroy({ where: { id }, transaction });
      }
      for (const r of e.removed) {
        await db.lnSchedule.create(r.schedule, { transaction });
        if (r.comps.length) await db.lnScheduleComponent.bulkCreate(r.comps, { transaction });
      }
    }
  }
};

const liveClassification = date => ctxLoader.classification(date);

module.exports = { loadAccount, loadSchedule, engineState, outstanding, net, Effects, undoEffects, liveClassification };
