/**
 * Exact decimal reads for the loan module. The global mariadb dialect returns DECIMAL columns as JS
 * numbers (supportBigNumbers), which loses precision for large amounts. These helpers select every
 * DECIMAL attribute as CAST(... AS CHAR), so values arrive as exact strings. Nothing global changes:
 * no driver option and no POS model type is touched; any model (loan or POS) can be read this way.
 */
const isDecimal = attr => attr && attr.type && (attr.type.key === 'DECIMAL' || attr.type.constructor.key === 'DECIMAL');

const exactAttributes = (model) => Object.entries(model.rawAttributes).map(([name, attr]) => (
  isDecimal(attr) ? [model.sequelize.cast(model.sequelize.col(`${model.name}.${attr.field || name}`), 'CHAR'), name] : name
));

const findAllExact = (model, options = {}) => model.findAll({ ...options, attributes: exactAttributes(model) });
const findOneExact = (model, options = {}) => model.findOne({ ...options, attributes: exactAttributes(model) });
const findByPkExact = (model, id, options = {}) => findOneExact(model, { ...options, where: { [model.primaryKeyAttribute]: id } });

module.exports = { exactAttributes, findAllExact, findOneExact, findByPkExact };
