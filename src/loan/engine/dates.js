/**
 * Calendar arithmetic on 'YYYY-MM-DD' strings using whole UTC days (integers only).
 */
const { LoanError } = require('../errors');

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const parts = (date) => {
  const m = DATE_RE.exec(String(date));
  if (!m) throw new LoanError(400, `Invalid date "${date}" (expected YYYY-MM-DD)`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) throw new LoanError(400, `Invalid date "${date}"`);
  return { y, m: mo, d };
};

const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const format = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

// Date.UTC at midnight is an exact multiple of a day, so the division is an exact integer
const toDayNumber = (date) => { const p = parts(date); return Date.UTC(p.y, p.m - 1, p.d) / MS_PER_DAY; };
const fromDayNumber = n => new Date(n * MS_PER_DAY).toISOString().slice(0, 10);

const addDays = (date, n) => fromDayNumber(toDayNumber(date) + n);
const daysBetween = (from, to) => toDayNumber(to) - toDayNumber(from);
const weekday = date => WEEKDAYS[new Date(toDayNumber(date) * MS_PER_DAY).getUTCDay()];
const compare = (a, b) => (a === b ? 0 : (a < b ? -1 : 1));

// Adds months keeping the anchor day, clamped to the month end (31 Jan -> 28/29 Feb -> 31 Mar)
const addMonths = (anchor, months, anchorDay) => {
  const p = parts(anchor);
  const total = p.y * 12 + (p.m - 1) + months;
  const y = (total - (total % 12)) / 12;
  const m = (total % 12) + 1;
  const day = anchorDay || p.d;
  return format(y, m, day > daysInMonth(y, m) ? daysInMonth(y, m) : day);
};

module.exports = { WEEKDAYS, parts, isLeap, daysInMonth, format, toDayNumber, fromDayNumber, addDays, daysBetween, weekday, compare, addMonths };
