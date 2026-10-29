/**
 * Interest recognition and memo penalty (pure).
 *   interestRecognitionCode DUE_DATE  ACCR on the due date for the installment's billed interest
 *                           DAILY     pro-rata of the billed interest to a date (month-end), rest on the due date
 *                           CASH      nothing recognized until paid (LIQD INT_CASH)
 * Status interestTreatment decides ACCR (CONTINUE_ACCRUAL), ACCR_SUSP (SUSPEND_ACCRUAL) or nothing
 * (STOP_ACCRUAL: tracked in the schedule only).
 */
const N = require('./num');
const { yearFraction } = require('./dayCount');
const { LoanError } = require('../errors');

const ACCRUAL_EVENT = { CONTINUE_ACCRUAL: 'ACCR', SUSPEND_ACCRUAL: 'ACCR_SUSP', STOP_ACCRUAL: null };

const eventFor = (interestTreatment) => {
  if (!(interestTreatment in ACCRUAL_EVENT)) throw new LoanError(400, `Unknown interest treatment ${interestTreatment}`);
  return ACCRUAL_EVENT[interestTreatment];
};

// Interest recognized for an installment on its due date: [{ event, tags }] (empty = nothing posted)
const dueDateProcessing = ({ installment, recognition, interestTreatment, alreadyRecognized = '0', rounder }) => {
  const event = eventFor(interestTreatment);
  if (recognition === 'CASH' || !event) return [];
  if (!['DUE_DATE', 'DAILY'].includes(recognition)) throw new LoanError(400, `Unknown interest recognition ${recognition}`);
  const amount = N.sub(installment.interest, alreadyRecognized);
  if (N.isNeg(amount)) throw new LoanError(409, `Installment ${installment.no}: more interest recognized than billed`);
  if (N.isZero(amount)) return [];
  return [{ event, tags: { INT_ACCR: rounder.round(amount) } }];
};

// DAILY recognition: interest of the period earned up to `date` (pro-rata by the day count, rounded)
const accruedToDate = ({ installment, periodStart, date, dayCount, rounder }) => {
  const full = yearFraction(periodStart, installment.originalDueDate, dayCount);
  if (N.isZero(full)) return rounder.zero;
  const part = yearFraction(periodStart, date, dayCount);
  const fraction = N.min(N.div(part, full), N.ONE);
  return rounder.round(N.mul(installment.interest, fraction));
};

// Memo penalty on an overdue installment (decision D9): base = overdue installment amount,
// daily rate = PENALTY_RATE / daysInYear, capped at PENALTY_CAP_PCT of the base; within
// GRACE_DAYS no penalty, beyond it the penalty counts from the due date.
const memoPenalty = ({ overdueAmount, daysLate, penaltyRate, capPct, graceDays = 0, daysInYear, rounder }) => {
  if (!Number.isInteger(daysLate) || daysLate <= 0 || daysLate <= Number(graceDays)) return rounder.zero;
  const raw = N.div(N.mul(N.mul(overdueAmount, penaltyRate), daysLate), daysInYear);
  const capped = capPct === undefined || capPct === null ? raw : N.min(raw, N.mul(overdueAmount, capPct));
  return rounder.round(capped);
};

module.exports = { dueDateProcessing, accruedToDate, memoPenalty, eventFor };
