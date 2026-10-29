/**
 * VAT rate resolution. The rate always comes from the POS `tax` row referenced by
 * ln_tax_profile.posTaxId, effective on the given date. There is no literal fallback.
 */
const db = require('../../models');
const { LoanError } = require('../errors');

const { Op } = db.Sequelize;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });

// Returns { posTaxId, code, rate, effectiveFrom, effectiveTo } or throws LoanError(409)
const getVatRate = async (asOfDate = today(), transaction) => {
  const profile = await db.lnTaxProfile.findOne({ transaction });
  if (!profile) throw new LoanError(409, 'Tax profile is missing; run the loan seed');
  if (!profile.posTaxId) throw new LoanError(409, 'Tax profile has no POS tax (posTaxId) selected');

  const tax = await db.tax.findOne({
    where: {
      id: profile.posTaxId,
      isActive: true,
      [Op.and]: [
        { [Op.or]: [{ effectiveFrom: null }, { effectiveFrom: { [Op.lte]: asOfDate } }] },
        { [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: asOfDate } }] }
      ]
    },
    transaction
  });
  if (!tax) throw new LoanError(409, `POS tax ${profile.posTaxId} is inactive or not effective on ${asOfDate}`);
  return { posTaxId: tax.id, code: tax.code, rate: String(tax.rate), effectiveFrom: tax.effectiveFrom, effectiveTo: tax.effectiveTo };
};

module.exports = { getVatRate, today };
