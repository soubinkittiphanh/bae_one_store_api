/**
 * Holiday calendar: weekend days (ln_holiday_calendar.weekendDays) plus dated holidays
 * (ln_holiday_date, read live). adjust() moves a due date per holidayHandlingCode.
 */
const D = require('./dates');
const { LoanError } = require('../errors');

const MAX_SHIFT_DAYS = 366;

const makeCalendar = ({ weekendDays = '', holidays = [] } = {}) => {
  const weekend = new Set(String(weekendDays).split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
  for (const w of weekend) if (!D.WEEKDAYS.includes(w)) throw new LoanError(400, `Unknown weekend day ${w}`);
  const dated = new Set(holidays.map(String));
  const isBusinessDay = date => !weekend.has(D.weekday(date)) && !dated.has(date);

  const adjust = (date, handling) => {
    if (handling === 'EXACT_DATE' || !handling) return date;
    const step = { NEXT_WORKING_DAY: 1, PREV_WORKING_DAY: -1 }[handling];
    if (!step) throw new LoanError(400, `Unsupported holiday handling ${handling}`);
    let d = date;
    for (let i = 0; i < MAX_SHIFT_DAYS && !isBusinessDay(d); i++) d = D.addDays(d, step);
    if (!isBusinessDay(d)) throw new LoanError(400, `No working day within ${MAX_SHIFT_DAYS} days of ${date}`);
    return d;
  };
  return { isBusinessDay, adjust };
};

module.exports = { makeCalendar };
