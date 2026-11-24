/**
 * Unit conversion for raw materials and recipes.
 *
 * unitModel convention: a base unit has conversionRate 1; a derived unit is `1 derived = conversionRate x base`
 * (g -> kg 0.001, pack x12 -> bag 12). Derived units may chain. Two units convert only when they share
 * the same root base unit; otherwise convert() throws instead of guessing (e.g. a standalone "Gram" base unit
 * does not convert to "kg").
 */
const { ApiError } = require('./errors');

const MAX_DEPTH = 10;

// unitMap: Map<id, { id, symbol, baseUnitId, conversionRate }>
const rootOf = (unitId, unitMap) => {
  let factor = 1;
  let current = unitMap.get(Number(unitId));
  if (!current) throw new ApiError(400, 'UNIT_NOT_FOUND', `Unit #${unitId} not found`);
  for (let depth = 0; current.baseUnitId && depth < MAX_DEPTH; depth++) {
    factor *= Number(current.conversionRate) || 1;
    const parent = unitMap.get(Number(current.baseUnitId));
    if (!parent) throw new ApiError(400, 'UNIT_NOT_FOUND', `Base unit #${current.baseUnitId} of unit #${current.id} not found`);
    current = parent;
  }
  if (current.baseUnitId) throw new ApiError(400, 'UNIT_CYCLE', `Unit #${unitId} has a base-unit cycle`);
  return { rootId: current.id, factor };
};

const canConvert = (fromUnitId, toUnitId, unitMap) => {
  if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return true;
  try {
    return rootOf(fromUnitId, unitMap).rootId === rootOf(toUnitId, unitMap).rootId;
  } catch (e) {
    return false;
  }
};

/**
 * Factor to multiply a quantity in `fromUnitId` by to get it in `toUnitId`.
 * A missing unit on either side means "already in the stock unit" (factor 1).
 */
const factorBetween = (fromUnitId, toUnitId, unitMap) => {
  if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
  const from = rootOf(fromUnitId, unitMap);
  const to = rootOf(toUnitId, unitMap);
  if (from.rootId !== to.rootId) {
    const a = unitMap.get(Number(fromUnitId));
    const b = unitMap.get(Number(toUnitId));
    throw new ApiError(400, 'UNIT_NOT_CONVERTIBLE',
      `Cannot convert ${a.symbol} to ${b.symbol}: they do not share a base unit`);
  }
  return from.factor / to.factor;
};

// Rounded to the 4 decimals the ledger stores
const round4 = n => Math.round(n * 10000) / 10000;

const convert = (quantity, fromUnitId, toUnitId, unitMap) =>
  round4(Number(quantity) * factorBetween(fromUnitId, toUnitId, unitMap));

// The unit a product's stock is counted in
const stockUnitIdOf = product => product.stockUnitId || product.baseUnitId || null;

const loadUnitMap = async (Unit, transaction) => {
  const units = await Unit.findAll({ attributes: ['id', 'symbol', 'baseUnitId', 'conversionRate'], transaction });
  return new Map(units.map(u => [u.id, {
    id: u.id,
    symbol: u.symbol,
    baseUnitId: u.baseUnitId,
    conversionRate: Number(u.getDataValue('conversionRate'))
  }]));
};

module.exports = { rootOf, canConvert, factorBetween, convert, round4, stockUnitIdOf, loadUnitMap };
