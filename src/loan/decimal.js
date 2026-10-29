/**
 * String-based decimal helpers. Money and rates are compared without floats.
 */
const normalize = (value) => {
  const s = String(value).trim();
  const negative = s.startsWith('-');
  const [intPart, fracPart = ''] = (negative ? s.slice(1) : s).split('.');
  return { negative, intPart: intPart.replace(/^0+(?=\d)/, '') || '0', fracPart };
};

// Returns -1, 0 or 1. Inputs must already be validated decimal strings or numbers.
const compareDecimal = (a, b) => {
  const x = normalize(a);
  const y = normalize(b);
  const scale = Math.max(x.fracPart.length, y.fracPart.length);
  const xs = x.intPart + x.fracPart.padEnd(scale, '0');
  const ys = y.intPart + y.fracPart.padEnd(scale, '0');
  const xi = BigInt(xs) * (x.negative ? -1n : 1n);
  const yi = BigInt(ys) * (y.negative ? -1n : 1n);
  return xi === yi ? 0 : (xi < yi ? -1 : 1);
};

module.exports = { compareDecimal };
