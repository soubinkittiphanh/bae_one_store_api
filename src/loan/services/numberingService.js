/**
 * Document numbers from ln_numbering_sequence ({PREFIX}-{YEAR}{MONTH}-{NUMBER}), taken under a row
 * lock inside the caller's transaction so two bookings never get the same number.
 */
const db = require('../../models');
const { LoanError } = require('../errors');

const nextNumber = async (sequenceCode, date, transaction) => {
  const seq = await db.lnNumberingSequence.findOne({ where: { sequenceCode }, transaction, lock: transaction.LOCK.UPDATE });
  if (!seq) throw new LoanError(409, `Numbering sequence ${sequenceCode} not found`);
  const [y, m] = String(date).split('-');
  const number = String(seq.nextNumber).padStart(seq.paddingLength || 1, '0');
  const value = (seq.formatPattern || '{PREFIX}-{NUMBER}')
    .replace('{PREFIX}', seq.prefix || '')
    .replace('{YEAR}', y)
    .replace('{MONTH}', m)
    .replace('{NUMBER}', number);
  await seq.update({ nextNumber: seq.nextNumber + 1 }, { transaction });
  return value;
};

module.exports = { nextNumber };
