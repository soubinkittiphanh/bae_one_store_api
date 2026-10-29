/**
 * Engine-side reader: only AUTHORIZED, effective-dated parameter rows.
 * Later phases (schedule, accrual, provisioning) must read parameters through this.
 */
const db = require('../../models');

const { Op } = db.Sequelize;

// Effective-date column pairs, checked in this order
const DATE_COLUMNS = [
  ['effectiveFrom', 'effectiveTo'],
  ['effectiveDate', 'expiryDate'],
  ['effectiveDate', null]
];

const effectiveWhere = (model, asOfDate) => {
  for (const [from, to] of DATE_COLUMNS) {
    if (!model.rawAttributes[from] || (to && !model.rawAttributes[to])) continue;
    const where = { [from]: { [Op.lte]: asOfDate } };
    if (to) where[Op.or] = [{ [to]: null }, { [to]: { [Op.gte]: asOfDate } }];
    return { where, orderBy: from };
  }
  return { where: {}, orderBy: null };
};

// Returns AUTHORIZED rows effective on asOfDate (YYYY-MM-DD), newest effective date first.
const getEffective = async (model, where = {}, asOfDate) => {
  if (!asOfDate) throw new Error('getEffective requires asOfDate (YYYY-MM-DD)');
  const eff = effectiveWhere(model, asOfDate);
  return model.findAll({
    where: { ...where, ...eff.where, authStatus: 'AUTHORIZED' },
    order: eff.orderBy ? [[eff.orderBy, 'DESC']] : undefined
  });
};

const getEffectiveOne = async (model, where, asOfDate) => (await getEffective(model, where, asOfDate))[0] || null;

module.exports = { getEffective, getEffectiveOne };
