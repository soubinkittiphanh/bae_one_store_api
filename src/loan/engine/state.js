/**
 * Account state used by the allocation, prepayment and status engines (pure data).
 *
 *   state = {
 *     installments: [{
 *       no, dueDate, originalDueDate,
 *       components: { PRINCIPAL: { due, paid }, INTEREST: { due, paid }, PENALTY: { due, paid }, <FEE code>: { due, paid } },
 *       interestBucket: 'BOOKED' | 'SUSPENDED' | 'UNBOOKED'   // how the due interest is held in the books
 *     }],
 *     advanceBalance
 *   }
 * PENALTY is the memo penalty (MEMO_ONLY default) unless penaltyBooked is set (BILL option).
 */
const N = require('./num');
const D = require('./dates');

const outstandingOf = c => (c ? N.sub(c.due, c.paid || 0) : N.ZERO);

const isDue = (inst, date) => D.compare(inst.dueDate, date) <= 0;

const componentTotal = (state, code, filter = () => true) => N.sum(
  state.installments.filter(filter).map(i => outstandingOf(i.components[code]))
);

const interestByBucket = (state, date, bucket) => N.sum(state.installments
  .filter(i => isDue(i, date) && i.interestBucket === bucket)
  .map(i => outstandingOf(i.components.INTEREST)));

const installmentOutstanding = inst => N.sum(Object.entries(inst.components)
  .filter(([code]) => code !== 'PENALTY')
  .map(([, c]) => outstandingOf(c)));

// Days past due: from the oldest installment with an unpaid amount whose due date has passed
const dpd = (state, date) => {
  const overdue = state.installments.find(i => D.compare(i.dueDate, date) < 0 && N.cmp(installmentOutstanding(i), 0) > 0);
  return overdue ? D.daysBetween(overdue.dueDate, date) : 0;
};

// Initial state from a generated schedule (nothing paid). Fees billed per installment can be added
// by the caller; interestBucket is set when interest is recognized (BOOKED / SUSPENDED / UNBOOKED).
const fromSchedule = (schedule, { interestBucket = 'BOOKED', advanceBalance = '0' } = {}) => ({
  installments: schedule.rows.map(r => ({
    no: r.no,
    dueDate: r.dueDate,
    originalDueDate: r.originalDueDate,
    components: {
      PRINCIPAL: { due: r.principal, paid: '0' },
      INTEREST: { due: r.interest, paid: '0' },
      PENALTY: { due: '0', paid: '0' }
    },
    interestBucket
  })),
  advanceBalance
});

module.exports = { outstandingOf, isDue, componentTotal, interestByBucket, installmentOutstanding, dpd, fromSchedule };
