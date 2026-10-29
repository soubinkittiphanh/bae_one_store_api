/**
 * Exact rational arithmetic on BigInt for the loan engines. No floats anywhere:
 * values are { n, d } with d > 0, reduced. Decimal strings in, decimal strings out.
 */
const { LoanError } = require('../errors');

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

const abs = x => (x < 0n ? -x : x);
const gcd = (a, b) => {
  let x = abs(a);
  let y = abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1n;
};

const make = (n, d = 1n) => {
  if (d === 0n) throw new LoanError(400, 'Division by zero in loan calculation');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};

const ZERO = make(0n);
const ONE = make(1n);

// '123.4500' / 12 / 12n / { n, d } -> rational
const of = (v) => {
  if (v && typeof v === 'object' && typeof v.n === 'bigint') return v;
  if (typeof v === 'bigint') return make(v);
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new LoanError(400, `Non-integer number ${v} passed to the loan engine; use a decimal string`);
    return make(BigInt(v));
  }
  const s = String(v).trim();
  if (!DECIMAL_RE.test(s)) throw new LoanError(400, `Invalid decimal "${s}"`);
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  const n = BigInt(i + f) * (neg ? -1n : 1n);
  return make(n, 10n ** BigInt(f.length));
};

const add = (a, b) => { const x = of(a); const y = of(b); return make(x.n * y.d + y.n * x.d, x.d * y.d); };
const sub = (a, b) => { const x = of(a); const y = of(b); return make(x.n * y.d - y.n * x.d, x.d * y.d); };
const mul = (a, b) => { const x = of(a); const y = of(b); return make(x.n * y.n, x.d * y.d); };
const div = (a, b) => { const x = of(a); const y = of(b); return make(x.n * y.d, x.d * y.n); };
const neg = a => { const x = of(a); return make(-x.n, x.d); };
const cmp = (a, b) => { const x = of(a); const y = of(b); const l = x.n * y.d; const r = y.n * x.d; return l === r ? 0 : (l < r ? -1 : 1); };
const isZero = a => of(a).n === 0n;
const isNeg = a => of(a).n < 0n;
const max = (a, b) => (cmp(a, b) >= 0 ? of(a) : of(b));
const min = (a, b) => (cmp(a, b) <= 0 ? of(a) : of(b));
const sum = list => list.reduce((acc, v) => add(acc, v), ZERO);

const pow = (a, k) => {
  if (!Number.isInteger(k) || k < 0) throw new LoanError(400, 'pow needs a non-negative integer exponent');
  const x = of(a);
  return make(x.n ** BigInt(k), x.d ** BigInt(k));
};

// Half-up (away from zero on .5) to `decimals` places -> fixed decimal string
const roundHalfUp = (a, decimals) => {
  const x = of(a);
  const scale = 10n ** BigInt(decimals);
  const num = abs(x.n) * scale;
  let q = num / x.d;
  if ((num % x.d) * 2n >= x.d) q += 1n;
  return toDecimal(make(x.n < 0n ? -q : q, scale), decimals);
};

// Exact rational with a terminating representation at `decimals` places -> string
const toDecimal = (a, decimals) => {
  const x = of(a);
  const scale = 10n ** BigInt(decimals);
  if ((x.n * scale) % x.d !== 0n) throw new LoanError(500, 'Value is not exact at the requested scale; round it first');
  const units = (x.n * scale) / x.d;
  const negative = units < 0n;
  const digits = abs(units).toString().padStart(decimals + 1, '0');
  const body = decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
  return `${negative ? '-' : ''}${body}`;
};

// Integer part of a non-negative rational (used for counts, never for money)
const floorInt = (a) => {
  const x = of(a);
  if (x.n < 0n) throw new LoanError(500, 'floorInt expects a non-negative value');
  return x.n / x.d;
};

module.exports = { ZERO, ONE, of, make, add, sub, mul, div, neg, cmp, isZero, isNeg, max, min, sum, pow, roundHalfUp, toDecimal, floorInt };
