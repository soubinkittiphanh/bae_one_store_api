/**
 * Day-count conventions (ln_lookup_day_count). yearFraction returns an exact rational.
 *   30_360        30E/360 (European): day 31 counts as 30; days in year from the lookup row
 *   ACTUAL_360    actual days / lookup daysInYear
 *   ACTUAL_365    actual days / lookup daysInYear
 *   ACTUAL_ACTUAL ISDA: days in each calendar year / 365 or 366 of that year
 */
const N = require('./num');
const D = require('./dates');
const { LoanError } = require('../errors');

const days30E = (start, end) => {
  const a = D.parts(start);
  const b = D.parts(end);
  const d1 = a.d === 31 ? 30 : a.d;
  const d2 = b.d === 31 ? 30 : b.d;
  return 360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1);
};

// dayCount: { code, daysInYear } from the lookup row
const yearFraction = (start, end, dayCount) => {
  if (D.compare(end, start) < 0) throw new LoanError(400, `Period end ${end} is before start ${start}`);
  const { code, daysInYear } = dayCount || {};
  switch (code) {
    case '30_360':
      return N.make(BigInt(days30E(start, end)), BigInt(daysInYear));
    case 'ACTUAL_360':
    case 'ACTUAL_365':
      return N.make(BigInt(D.daysBetween(start, end)), BigInt(daysInYear));
    case 'ACTUAL_ACTUAL': {
      let total = N.ZERO;
      let cursor = start;
      while (D.compare(cursor, end) < 0) {
        const y = D.parts(cursor).y;
        const nextYear = D.format(y + 1, 1, 1);
        const stop = D.compare(nextYear, end) < 0 ? nextYear : end;
        total = N.add(total, N.make(BigInt(D.daysBetween(cursor, stop)), BigInt(D.isLeap(y) ? 366 : 365)));
        cursor = stop;
      }
      return total;
    }
    default:
      throw new LoanError(400, `Unsupported day count ${code}`);
  }
};

// Day count used for the penalty and daily figures: days in year of the convention
const daysInYearOf = (dayCount) => {
  if (!dayCount || !dayCount.daysInYear) throw new LoanError(400, 'Day count without daysInYear');
  return Number(dayCount.daysInYear);
};

module.exports = { yearFraction, days30E, daysInYearOf };
