/**
 * Recipe deduction for raw materials (product.stockMode = 'quantity') when menu items are sold.
 *
 * Card-based ingredients keep the existing card logic (pos/ticket/controller.js); this engine only handles
 * 'quantity' ingredients, inside the caller's sequelize transaction:
 *
 *   consume   sold line -> deduct each raw-material ingredient (recipe + option ingredients), converted
 *             to its stock unit, one recipe_stock_impacts row per ingredient
 *   dispose   cancelled / voided / deleted line -> kitchen rule:
 *               ticket line 'ordered'                      -> ingredients returned to stock
 *               ticket line 'preparing' | 'ready' | 'served' -> wasted (stock stays deducted, cost reported)
 *               merchant sale line (no kitchen)            -> wasted
 *             a manager can return them instead (forceReturn)
 *   carry     ticket edit (lines are re-created): deductions move to the new lines, only real changes
 *             touch stock: added quantity is deducted, removed quantity is disposed by the kitchen rule
 *
 * Shortages: an ingredient with validateStockOnSale blocks the sale (StockShortageError, sales `stockErrors`
 * shape); other ingredients may go negative.
 */
const { QueryTypes } = require('sequelize');
const { ApiError, StockShortageError } = require('./errors');
const { createLedger, round2 } = require('./ledger');
const { convert, stockUnitIdOf, loadUnitMap, round4 } = require('./units');

const MADE_STATUSES = ['preparing', 'ready', 'served'];
const MANAGER_GROUP_CODES = ['ADMIN', 'SUPER_ADMIN'];

// Same key the ticket edit uses to carry kitchen status over (pos/ticket/controller.js kitchenLineKey)
const lineKey = (productId, selectedOptions) => {
  let opts = selectedOptions;
  if (typeof opts === 'string') {
    try { opts = JSON.parse(opts); } catch (e) { opts = []; }
  }
  const ids = (Array.isArray(opts) ? opts : [])
    .map(o => (o && typeof o === 'object' ? (o.id ?? o.optionId ?? o.name ?? o.optionName) : o))
    .map(String)
    .sort();
  return `${productId}|${ids.join(',')}`;
};

const optionIdsOf = (selectedOptions) => {
  let opts = selectedOptions;
  if (typeof opts === 'string') {
    try { opts = JSON.parse(opts); } catch (e) { return []; }
  }
  return (Array.isArray(opts) ? opts : [])
    .map(o => Number(o && typeof o === 'object' ? (o.id ?? o.optionId) : o))
    .filter(n => Number.isInteger(n) && n > 0);
};

const createRecipeEngine = (db, options = {}) => {
  const {
    sequelize, product: Product, recipe: Recipe, unit: Unit,
    recipeStockImpact: Impact
  } = db;
  const ProductOption = db.ProductOption || db.productOption; // registered as ProductOption in src/models
  const ledger = createLedger(db);
  const merchantReturnsByDefault = options.merchantReturnsByDefault ?? false;

  // ------------------------------------------------------------------ what a line needs
  /**
   * Raw-material ingredients for ONE unit of the product (+ its selected options), in each ingredient's
   * stock unit. Card-based ingredients are left out (the card logic handles them).
   */
  const needsFor = async (productId, selectedOptions, transaction) => {
    const recipes = await Recipe.findAll({ where: { productId }, transaction });
    const optionIds = optionIdsOf(selectedOptions);
    const optionRows = optionIds.length && ProductOption
      ? await ProductOption.findAll({ where: { id: optionIds }, transaction })
      : [];
    const optionNeeds = optionRows.filter(o => o.ingredientProductId && o.ingredientQuantity !== null && o.ingredientQuantity !== undefined);

    const ingredientIds = [...new Set([...recipes.map(r => r.ingredientId), ...optionNeeds.map(o => o.ingredientProductId)])];
    if (!ingredientIds.length) return { hasRecipe: recipes.length > 0, needs: [] };

    const ingredients = await Product.findAll({ where: { id: ingredientIds, stockMode: 'quantity' }, transaction });
    const byId = new Map(ingredients.map(i => [i.id, i]));
    if (!byId.size) return { hasRecipe: recipes.length > 0, needs: [] };
    const unitMap = await loadUnitMap(Unit, transaction);

    const needs = [];
    const add = (ingredient, quantity, unitId, recipeId, label) => {
      const stockUnitId = stockUnitIdOf(ingredient);
      if (!stockUnitId) throw new ApiError(409, 'STOCK_UNIT_REQUIRED', `${ingredient.pro_name} has no stock unit`);
      const perUnit = convert(quantity, unitId, stockUnitId, unitMap);
      if (perUnit > 0) needs.push({ ingredient, perUnit, recipeQuantity: Number(quantity), recipeUnitId: unitId || null, stockUnitId, recipeId, label });
    };
    for (const r of recipes) {
      const ing = byId.get(r.ingredientId);
      if (ing) add(ing, r.quantity, r.unitId, r.id, 'recipe');
    }
    for (const o of optionNeeds) {
      const ing = byId.get(o.ingredientProductId);
      if (ing) add(ing, o.ingredientQuantity, o.ingredientUnitId, null, `option ${o.optionName}`);
    }
    return { hasRecipe: recipes.length > 0, needs };
  };

  // ------------------------------------------------------------------ consume
  /**
   * Deducts `quantity` units of the sold product. Returns the impacts created.
   * sourceType 'ticket' (ticketLine) | 'sale' (saleLine).
   */
  const consume = async ({ sourceType, lineId, productId, quantity, selectedOptions, locationId, userId }, transaction) => {
    const qty = Number(quantity);
    if (!(qty > 0)) return [];
    const { needs } = await needsFor(productId, selectedOptions, transaction);
    if (!needs.length) return [];
    if (!locationId) {
      throw new ApiError(400, 'LOCATION_REQUIRED', 'This sale has no location, so its raw-material ingredients cannot be deducted');
    }

    const product = await Product.findByPk(productId, { attributes: ['id', 'pro_name'], transaction });
    const shortages = [];
    const impacts = [];
    for (const need of needs) {
      const total = round4(need.perUnit * qty);
      if (total <= 0) continue;
      let movement;
      try {
        movement = await ledger.applyMovement({
          productId: need.ingredient.id, locationId, type: 'recipe_deduction', change: -total,
          transactionQuantity: total, stockUnitId: need.stockUnitId,
          referenceType: sourceType, referenceId: lineId,
          notes: `${product ? product.pro_name : `#${productId}`} x ${qty} (${need.label})`,
          userId, allowNegative: !need.ingredient.validateStockOnSale
        }, transaction);
      } catch (e) {
        if (!(e instanceof StockShortageError)) throw e;
        shortages.push(...e.shortages.map(s => ({ ...s, productName: need.ingredient.pro_name, forProductId: productId })));
        continue;
      }
      impacts.push(await Impact.create({
        stockTransactionId: movement.transaction.id,
        sourceType, sourceLineId: lineId,
        productSoldId: productId, ingredientId: need.ingredient.id, recipeId: need.recipeId, locationId,
        quantitySold: qty, recipeQuantityPerUnit: need.recipeQuantity, recipeUnitId: need.recipeUnitId,
        ingredientQuantity: total, ingredientUnitId: need.stockUnitId,
        unitCost: movement.unitCost, totalCost: round2(total * movement.unitCost)
      }, { transaction }));
    }
    if (shortages.length) throw new StockShortageError(shortages);
    return impacts;
  };

  // ------------------------------------------------------------------ dispose
  const openImpacts = (sourceType, lineIds, transaction) => Impact.findAll({
    where: { sourceType, sourceLineId: lineIds, disposition: 'consumed' },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  /**
   * Splits `units` (of quantitySold) off an impact. Returns the row holding exactly `units`:
   * the impact itself when all of it is taken, else a new row (same stock transaction) with the share.
   */
  const splitImpact = async (impact, units, transaction) => {
    const sold = Number(impact.quantitySold);
    if (units >= sold - 1e-9) return impact;
    const share = units / sold;
    const partQty = round4(Number(impact.ingredientQuantity) * share);
    const partCost = round2(Number(impact.totalCost) * share);
    // copy: get({ plain: true }) can hand back the instance's own dataValues
    const { id, ...fields } = { ...impact.get({ plain: true }) };
    const part = await Impact.create({
      ...fields, quantitySold: round4(units), ingredientQuantity: partQty, totalCost: partCost, createdAt: impact.createdAt
    }, { transaction });
    await impact.update({
      quantitySold: round4(sold - units),
      ingredientQuantity: round4(Number(impact.ingredientQuantity) - partQty),
      totalCost: round2(Number(impact.totalCost) - partCost)
    }, { transaction });
    return part;
  };

  const settle = async (impact, returnIt, { userId, note }, transaction) => {
    const now = new Date();
    if (!returnIt) {
      await impact.update({ disposition: 'wasted', dispositionAt: now, dispositionBy: userId || null, dispositionNote: note || null }, { transaction });
      return 'wasted';
    }
    const movement = await ledger.applyMovement({
      productId: impact.ingredientId, locationId: impact.locationId, type: 'recipe_reversal',
      change: Number(impact.ingredientQuantity), unitCost: Number(impact.unitCost),
      transactionQuantity: Number(impact.ingredientQuantity), stockUnitId: impact.ingredientUnitId,
      referenceType: impact.sourceType, referenceId: impact.sourceLineId, reversalOfId: impact.stockTransactionId,
      notes: note || 'Returned to stock', userId, allowNegative: true
    }, transaction);
    await impact.update({
      disposition: 'returned', reversedAt: now, reversalTransactionId: movement.transaction.id,
      dispositionAt: now, dispositionBy: userId || null, dispositionNote: note || null
    }, { transaction });
    return 'returned';
  };

  const shouldReturn = (sourceType, lineStatus, forceReturn) => {
    if (forceReturn) return true;
    if (sourceType === 'sale') return merchantReturnsByDefault;
    return !MADE_STATUSES.includes(lineStatus || 'ordered');
  };

  /**
   * Cancel / void / delete: settles every open deduction of the given lines.
   * lines: [{ id, status }] (status = ticketLine kitchen status; ignored for sales)
   */
  const disposeLines = async ({ sourceType, lines, forceReturn = false, userId, note }, transaction) => {
    const result = { returned: 0, wasted: 0 };
    if (!lines || !lines.length) return result;
    const statusById = new Map(lines.map(l => [Number(l.id), l.status]));
    const impacts = await openImpacts(sourceType, [...statusById.keys()], transaction);
    for (const impact of impacts) {
      const outcome = await settle(impact, shouldReturn(sourceType, statusById.get(impact.sourceLineId), forceReturn), { userId, note }, transaction);
      result[outcome]++;
    }
    return result;
  };

  // ------------------------------------------------------------------ ticket edit
  /**
   * The edit deleted oldLines and created newLines. Per dish (product + options): made units are kept first,
   * deductions move to the new lines, extra quantity is deducted, removed quantity is disposed.
   * oldLines: [{ id, productId, quantity, status, selectedOptions }]   newLines: same, with the new ids
   */
  const carryOverTicketEdit = async ({ oldLines, newLines, locationId, forceReturn = false, userId, note }, transaction) => {
    const result = { carried: 0, consumed: 0, returned: 0, wasted: 0 };
    const impacts = await openImpacts('ticket', oldLines.map(l => l.id), transaction);
    const impactsByLine = new Map();
    for (const i of impacts) {
      if (!impactsByLine.has(i.sourceLineId)) impactsByLine.set(i.sourceLineId, []);
      impactsByLine.get(i.sourceLineId).push(i);
    }

    // Pool of old units per dish; made ones first so they are the ones kept
    const pools = new Map();
    for (const l of oldLines) {
      const key = lineKey(l.productId, l.selectedOptions);
      if (!pools.has(key)) pools.set(key, []);
      pools.get(key).push({ line: l, left: Number(l.quantity) || 0, made: MADE_STATUSES.includes(l.status) });
    }
    for (const pool of pools.values()) pool.sort((a, b) => Number(b.made) - Number(a.made));

    // Moves `units` of an old line's deductions to a new line
    const move = async (oldLineId, units, newLineId) => {
      for (const impact of impactsByLine.get(oldLineId) || []) {
        const piece = await splitImpact(impact, units, transaction);
        await piece.update({ sourceLineId: newLineId }, { transaction });
        if (piece === impact) impactsByLine.set(oldLineId, (impactsByLine.get(oldLineId) || []).filter(x => x !== impact));
      }
    };

    for (const nl of newLines) {
      let need = Number(nl.quantity) || 0;
      const pool = pools.get(lineKey(nl.productId, nl.selectedOptions)) || [];
      for (const entry of pool) {
        if (need <= 1e-9) break;
        if (entry.left <= 1e-9) continue;
        const units = Math.min(need, entry.left);
        await move(entry.line.id, units, nl.id);
        entry.left = round4(entry.left - units);
        need = round4(need - units);
        result.carried += units;
      }
      if (need > 1e-9) {
        const created = await consume({
          sourceType: 'ticket', lineId: nl.id, productId: nl.productId, quantity: need,
          selectedOptions: nl.selectedOptions, locationId, userId
        }, transaction);
        if (created.length) result.consumed += need;
      }
    }

    // Whatever is left of the old lines was removed by the edit
    for (const pool of pools.values()) {
      for (const entry of pool) {
        if (entry.left <= 1e-9) continue;
        const returnIt = shouldReturn('ticket', entry.line.status, forceReturn);
        for (const impact of [...(impactsByLine.get(entry.line.id) || [])]) {
          const piece = await splitImpact(impact, entry.left, transaction);
          const outcome = await settle(piece, returnIt, { userId, note: note || 'Removed from ticket' }, transaction);
          result[outcome]++;
        }
      }
    }
    return result;
  };

  // ------------------------------------------------------------------ manager check
  /** Owner / admin, or a group allowed to cancel tickets. Read from the database, not the token. */
  const isManager = async (userId, transaction) => {
    if (!userId) return false;
    const rows = await sequelize.query(
      `SELECT g.code, g.ticketCancel FROM user u JOIN userGroup g ON g.id = u.groupId WHERE u.id = ? AND u.isActive = 1`,
      { replacements: [userId], type: QueryTypes.SELECT, transaction }
    );
    return rows.some(r => MANAGER_GROUP_CODES.includes(r.code) || Number(r.ticketCancel) === 1);
  };

  const assertCanForceReturn = async (forceReturn, userId, transaction) => {
    if (forceReturn && !(await isManager(userId, transaction))) {
      throw new ApiError(403, 'MANAGER_REQUIRED', 'Only a manager can return made items to stock');
    }
  };

  return { needsFor, consume, disposeLines, carryOverTicketEdit, isManager, assertCanForceReturn, lineKey, MADE_STATUSES };
};

module.exports = { createRecipeEngine, lineKey, MADE_STATUSES };
