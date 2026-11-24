/**
 * Raw materials (product.stockMode = 'quantity') and recipe (BOM) setup.
 *
 * Built from a `db` object (src/models) so tests can run it against a throwaway database.
 * Every write runs in one sequelize transaction; balances change only through ledger.applyMovement.
 */
const { QueryTypes, Transaction } = require('sequelize');
const { ApiError } = require('./errors');
const { createLedger, round2, round6 } = require('./ledger');
const { convert, factorBetween, canConvert, stockUnitIdOf, loadUnitMap, round4 } = require('./units');

// Cards that are still on the shelf (same filter as product/service.updateProductCountGroup)
const AVAILABLE_CARD_SQL = `card_isused = 0 AND saleLineId IS NULL AND ticketLineId IS NULL AND isActive = 1`;

const toNumber = (value, field) => {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} must be a number`);
  }
  return n;
};

const toId = (value, field) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'INVALID_INPUT', `${field} must be a positive id`);
  return n;
};

// MariaDB errors after which the whole transaction can simply be run again
const RETRYABLE = new Set([1213 /* deadlock */, 1020 /* record changed since last read (snapshot isolation) */]);
const errno = e => (e && (e.errno || (e.parent && e.parent.errno) || (e.original && e.original.errno))) || null;

const createRawMaterialService = (db, options = {}) => {
  const {
    sequelize, product: Product, location: Location, unit: Unit, card: Card,
    recipe: Recipe, stockBalance: StockBalance, stockTransactionModel: StockTransaction
  } = db;
  const ledger = createLedger(db);

  /**
   * Stock writes run at READ COMMITTED: the balance row is locked (FOR UPDATE) after other reads, and at
   * REPEATABLE READ with innodb_snapshot_isolation (MariaDB 11.6+) that lock fails once another sale has
   * changed the row. A deadlock / changed-row error re-runs the whole transaction (up to 3 attempts).
   */
  const runTx = async (fn) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, fn);
      } catch (e) {
        if (attempt >= 3 || !RETRYABLE.has(Number(errno(e)))) throw e;
      }
    }
  };

  // On by default: ticket sales deduct 'quantity' ingredients (recipeEngine.js) and cards sold before the
  // conversion are credited back to the balance when returned (cardBridge.js). RAW_MATERIAL_CONVERT=0 turns it off.
  const allowConvert = options.allowConvert ?? process.env.RAW_MATERIAL_CONVERT !== '0';

  const getProduct = async (productId, transaction, lock = false) => {
    const product = await Product.findByPk(productId, {
      transaction,
      ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
    });
    if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', `Product #${productId} not found`);
    return product;
  };

  const getRawMaterial = async (productId, transaction) => {
    const product = await getProduct(productId, transaction);
    if (product.stockMode !== 'quantity') {
      throw new ApiError(409, 'NOT_RAW_MATERIAL',
        `${product.pro_name} is not a raw material; convert it first (POST /api/raw-materials/${productId}/convert)`);
    }
    if (!stockUnitIdOf(product)) {
      throw new ApiError(409, 'STOCK_UNIT_REQUIRED', `${product.pro_name} has no stock unit`);
    }
    return product;
  };

  const assertLocation = async (locationId, transaction) => {
    const location = await Location.findByPk(locationId, { transaction });
    if (!location) throw new ApiError(404, 'LOCATION_NOT_FOUND', `Location #${locationId} not found`);
    return location;
  };

  const unitSymbol = (unitMap, id) => (id && unitMap.get(Number(id)) ? unitMap.get(Number(id)).symbol : null);

  // ------------------------------------------------------------------ queries
  const listStock = async ({ locationId, lowOnly } = {}) => {
    const unitMap = await loadUnitMap(Unit);
    const products = await Product.findAll({
      where: { stockMode: 'quantity' },
      attributes: ['id', 'pro_name', 'product_code', 'stockUnitId', 'baseUnitId', 'minStock', 'cost_price', 'isActive'],
      order: [['pro_name', 'ASC']]
    });
    if (!products.length) return [];

    const balanceWhere = { productId: products.map(p => p.id) };
    if (locationId) balanceWhere.locationId = toId(locationId, 'locationId');
    const balances = await StockBalance.findAll({ where: balanceWhere });
    const locations = await Location.findAll({ attributes: ['id', 'name'] });
    const locationName = new Map(locations.map(l => [l.id, l.name]));

    const rows = products.map(p => {
      const own = balances.filter(b => b.productId === p.id).map(b => ({
        locationId: b.locationId,
        locationName: locationName.get(b.locationId) || null,
        quantity: Number(b.quantity),
        avgCost: Number(b.avgCost),
        value: round2(Number(b.quantity) * Number(b.avgCost))
      }));
      const totalQuantity = round4(own.reduce((s, b) => s + b.quantity, 0));
      const unitId = stockUnitIdOf(p);
      return {
        productId: p.id,
        name: p.pro_name,
        code: p.product_code,
        isActive: p.isActive,
        stockUnit: unitId ? { id: unitId, symbol: unitSymbol(unitMap, unitId) } : null,
        minStock: Number(p.minStock) || 0,
        totalQuantity,
        totalValue: round2(own.reduce((s, b) => s + b.value, 0)),
        isLow: totalQuantity <= (Number(p.minStock) || 0),
        locations: own
      };
    });
    return lowOnly ? rows.filter(r => r.isLow) : rows;
  };

  const ledgerFor = async (productId, { locationId, from, to, page = 1, limit = 50 } = {}) => {
    const product = await getProduct(toId(productId, 'productId'));
    const { Op } = require('sequelize');
    const where = { productId: product.id };
    if (locationId) where.locationId = toId(locationId, 'locationId');
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const pageNo = Math.max(parseInt(page, 10) || 1, 1);
    const unitMap = await loadUnitMap(Unit);
    const { count, rows } = await StockTransaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset: (pageNo - 1) * pageSize
    });
    return {
      product: { id: product.id, name: product.pro_name, stockUnitId: stockUnitIdOf(product), stockUnit: unitSymbol(unitMap, stockUnitIdOf(product)) },
      items: rows.map(r => ({
        id: r.id,
        createdAt: r.createdAt,
        type: r.transactionType,
        locationId: r.locationId,
        quantity: Number(r.transactionQuantity),
        unit: unitSymbol(unitMap, r.transactionUnitId),
        change: Number(r.baseQuantityChange),
        before: Number(r.baseQuantityBefore),
        after: Number(r.baseQuantityAfter),
        unitCost: r.unitCost === null ? null : Number(r.unitCost),
        totalCost: r.totalCost === null ? null : Number(r.totalCost),
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        reversalOfId: r.reversalOfId,
        notes: r.notes,
        createdBy: r.createdBy
      })),
      pagination: { page: pageNo, limit: pageSize, total: count, pages: Math.ceil(count / pageSize) }
    };
  };

  // ------------------------------------------------------------------ convert card -> quantity
  /**
   * Moves a product from one-card-per-unit stock to a decimal balance: each location's available cards
   * become an 'opening' movement (cost = their average costLCY) and the cards are deactivated (kept for history).
   */
  const convertToQuantity = async (productIdRaw, { userId } = {}) => {
    if (!allowConvert) {
      throw new ApiError(409, 'CONVERT_DISABLED',
        'Converting to raw-material stock is switched off on this server (RAW_MATERIAL_CONVERT=0)');
    }
    const productId = toId(productIdRaw, 'productId');

    return runTx(async (t) => {
      const product = await getProduct(productId, t, true);
      if (product.stockMode === 'quantity') throw new ApiError(409, 'ALREADY_RAW_MATERIAL', `${product.pro_name} is already a raw material`);
      if (product.isReturnablePackaging || product.isPackagingAsset) {
        throw new ApiError(409, 'PACKAGING_PRODUCT', `${product.pro_name} is returnable packaging and must keep per-unit stock`);
      }
      const stockUnitId = stockUnitIdOf(product);
      if (!stockUnitId) throw new ApiError(400, 'STOCK_UNIT_REQUIRED', `Set the stock unit of ${product.pro_name} first (e.g. g or ml)`);

      // A card reserved by an unfinished ticket would come back as a card when that ticket is cancelled
      const [{ openTickets }] = await sequelize.query(
        `SELECT COUNT(DISTINCT tl.ticketId) AS openTickets
           FROM card c
           JOIN ticketLine tl ON tl.id = c.ticketLineId
           JOIN ticket tk ON tk.id = tl.ticketId
          WHERE c.productId = ? AND tk.status NOT IN ('paid', 'cancel', 'void')`,
        { replacements: [productId], type: QueryTypes.SELECT, transaction: t }
      );
      if (Number(openTickets) > 0) {
        throw new ApiError(409, 'OPEN_TICKETS', `${openTickets} open ticket(s) hold stock of ${product.pro_name}; close them first`);
      }

      const groups = await sequelize.query(
        `SELECT locationId, COUNT(*) AS qty, AVG(COALESCE(costLCY, cost, 0)) AS avgCost
           FROM card WHERE productId = ? AND ${AVAILABLE_CARD_SQL}
          GROUP BY locationId`,
        { replacements: [productId], type: QueryTypes.SELECT, transaction: t }
      );
      const withoutLocation = groups.find(g => g.locationId === null);
      if (withoutLocation) {
        throw new ApiError(409, 'CARDS_WITHOUT_LOCATION',
          `${withoutLocation.qty} card(s) of ${product.pro_name} have no location; assign one before converting`);
      }

      const movements = [];
      for (const g of groups) {
        const qty = Number(g.qty);
        movements.push(await ledger.applyMovement({
          productId, locationId: g.locationId, type: 'opening', change: qty, unitCost: round6(Number(g.avgCost)),
          transactionQuantity: qty, stockUnitId, referenceType: 'conversion', referenceId: productId,
          notes: `Converted from ${qty} stock card(s)`, userId
        }, t));
      }

      await sequelize.query(
        `UPDATE card SET isActive = 0 WHERE productId = ? AND ${AVAILABLE_CARD_SQL}`,
        { replacements: [productId], type: QueryTypes.UPDATE, transaction: t }
      );
      await product.update({ stockMode: 'quantity', stock_count: 0 }, { transaction: t });

      return {
        productId,
        stockMode: 'quantity',
        balances: movements.map(mv => ({ locationId: mv.transaction.locationId, quantity: mv.after, avgCost: mv.avgCost }))
      };
    });
  };

  // ------------------------------------------------------------------ movements
  const prepare = async (input, t) => {
    const productId = toId(input.productId, 'productId');
    const locationId = toId(input.locationId, 'locationId');
    const product = await getRawMaterial(productId, t);
    await assertLocation(locationId, t);
    const stockUnitId = stockUnitIdOf(product);
    const unitMap = await loadUnitMap(Unit, t);
    const unitId = input.unitId ? toId(input.unitId, 'unitId') : stockUnitId;
    const factor = factorBetween(unitId, stockUnitId, unitMap); // throws when not convertible
    return { product, productId, locationId, stockUnitId, unitId, factor };
  };

  /** Stock in: quantity in unitId, cost as unitCost (per unitId) or totalCost (LCY). */
  const receive = (input) => runTx(async (t) => {
    const p = await prepare(input, t);
    const quantity = toNumber(input.quantity, 'quantity');
    if (quantity <= 0) throw new ApiError(400, 'INVALID_QUANTITY', 'quantity must be greater than 0');
    const qtyStock = round4(quantity * p.factor);
    if (qtyStock <= 0) throw new ApiError(400, 'INVALID_QUANTITY', 'quantity is too small for the stock unit');

    let costPerStockUnit = null;
    if (input.totalCost !== undefined && input.totalCost !== null && input.totalCost !== '') {
      const total = toNumber(input.totalCost, 'totalCost');
      if (total < 0) throw new ApiError(400, 'INVALID_COST', 'totalCost cannot be negative');
      costPerStockUnit = total / qtyStock;
    } else if (input.unitCost !== undefined && input.unitCost !== null && input.unitCost !== '') {
      const unitCost = toNumber(input.unitCost, 'unitCost');
      if (unitCost < 0) throw new ApiError(400, 'INVALID_COST', 'unitCost cannot be negative');
      costPerStockUnit = unitCost / p.factor;
    }

    return ledger.applyMovement({
      productId: p.productId, locationId: p.locationId, type: 'purchase', change: qtyStock,
      unitCost: costPerStockUnit === null ? null : round6(costPerStockUnit),
      transactionQuantity: quantity, transactionUnitId: p.unitId, transactionRate: p.factor, stockUnitId: p.stockUnitId,
      referenceType: 'manual', notes: input.notes, userId: input.userId
    }, t);
  });

  /** Signed correction (waste, spoilage, found stock). A reason is required. */
  const adjust = (input) => runTx(async (t) => {
    const p = await prepare(input, t);
    const quantity = toNumber(input.quantity, 'quantity');
    if (quantity === 0) throw new ApiError(400, 'INVALID_QUANTITY', 'quantity cannot be 0');
    const reason = (input.reason || input.notes || '').trim();
    if (!reason) throw new ApiError(400, 'REASON_REQUIRED', 'A reason is required for an adjustment');
    const change = round4(quantity * p.factor);

    return ledger.applyMovement({
      productId: p.productId, locationId: p.locationId, type: 'adjustment', change,
      transactionQuantity: Math.abs(quantity), transactionUnitId: p.unitId, transactionRate: p.factor, stockUnitId: p.stockUnitId,
      referenceType: 'adjustment', notes: reason, userId: input.userId
    }, t);
  });

  /** Physical count: sets the balance to what was counted; the ledger records the difference. */
  const count = (input) => runTx(async (t) => {
    const p = await prepare(input, t);
    const counted = toNumber(input.countedQuantity, 'countedQuantity');
    if (counted < 0) throw new ApiError(400, 'INVALID_QUANTITY', 'countedQuantity cannot be negative');
    const setTo = round4(counted * p.factor);

    return ledger.applyMovement({
      productId: p.productId, locationId: p.locationId, type: 'count', setTo,
      transactionQuantity: counted, transactionUnitId: p.unitId, transactionRate: p.factor, stockUnitId: p.stockUnitId,
      referenceType: 'adjustment', notes: input.notes || 'Stock count', userId: input.userId,
      allowNegative: true // setTo >= 0 always; a negative "before" must still be correctable
    }, t);
  });

  // ------------------------------------------------------------------ recipes
  // Ingredient cost per stock unit: average over locations for raw materials, cost_price otherwise
  const ingredientCosts = async (ingredients, t) => {
    const ids = ingredients.filter(i => i.stockMode === 'quantity').map(i => i.id);
    const costs = new Map();
    if (ids.length) {
      const rows = await sequelize.query(
        `SELECT product_id AS productId,
                SUM(GREATEST(quantity, 0) * avg_cost) / NULLIF(SUM(GREATEST(quantity, 0)), 0) AS weighted,
                MAX(avg_cost) AS anyCost
           FROM stock_balances WHERE product_id IN (?) GROUP BY product_id`,
        { replacements: [ids], type: QueryTypes.SELECT, transaction: t }
      );
      for (const r of rows) costs.set(Number(r.productId), Number(r.weighted ?? r.anyCost ?? 0));
    }
    for (const i of ingredients) if (!costs.has(i.id)) costs.set(i.id, Number(i.cost_price) || 0);
    return costs;
  };

  const describeRecipe = async (product, t) => {
    const lines = await Recipe.findAll({ where: { productId: product.id }, order: [['id', 'ASC']], transaction: t });
    const ingredients = lines.length
      ? await Product.findAll({ where: { id: lines.map(l => l.ingredientId) }, transaction: t })
      : [];
    const byId = new Map(ingredients.map(i => [i.id, i]));
    const unitMap = await loadUnitMap(Unit, t);
    const costs = await ingredientCosts(ingredients, t);

    const items = lines.map(l => {
      const ing = byId.get(l.ingredientId);
      const stockUnitId = ing ? stockUnitIdOf(ing) : null;
      let stockQuantity = null;
      try { stockQuantity = convert(l.quantity, l.unitId, stockUnitId, unitMap); } catch (e) { /* unit no longer convertible */ }
      const unitCost = costs.get(l.ingredientId) || 0;
      return {
        id: l.id,
        ingredientId: l.ingredientId,
        ingredientName: ing ? ing.pro_name : null,
        ingredientStockMode: ing ? ing.stockMode : null,
        quantity: Number(l.quantity),
        unitId: l.unitId,
        unit: unitSymbol(unitMap, l.unitId),
        stockQuantity,
        stockUnit: unitSymbol(unitMap, stockUnitId),
        unitCost,
        lineCost: stockQuantity === null ? null : round2(stockQuantity * unitCost)
      };
    });
    const totalCost = round2(items.reduce((s, i) => s + (i.lineCost || 0), 0));
    const price = Number(product.pro_price) || 0;
    return {
      productId: product.id,
      productName: product.pro_name,
      price,
      items,
      totalCost,
      margin: round2(price - totalCost),
      marginPercent: price > 0 ? round2(((price - totalCost) / price) * 100) : null
    };
  };

  const getRecipe = async (productIdRaw) => describeRecipe(await getProduct(toId(productIdRaw, 'productId')));

  /**
   * Replaces the whole recipe of a menu item in one transaction. items: [{ ingredientId, quantity, unitId? }]
   * An empty list removes the recipe.
   */
  const replaceRecipe = async (productIdRaw, itemsRaw) => {
    const productId = toId(productIdRaw, 'productId');
    if (!Array.isArray(itemsRaw)) throw new ApiError(400, 'INVALID_INPUT', 'items must be an array');
    if (itemsRaw.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'A recipe can have at most 100 ingredients');

    return runTx(async (t) => {
      const product = await getProduct(productId, t, true);
      if (product.stockMode === 'quantity') {
        throw new ApiError(400, 'RAW_MATERIAL_RECIPE', `${product.pro_name} is a raw material and cannot have a recipe`);
      }

      const items = itemsRaw.map((it, index) => {
        const label = `items[${index}]`;
        const ingredientId = toId(it && it.ingredientId, `${label}.ingredientId`);
        const quantity = toNumber(it.quantity, `${label}.quantity`);
        if (quantity <= 0) throw new ApiError(400, 'INVALID_QUANTITY', `${label}.quantity must be greater than 0`);
        const unitId = it.unitId === null || it.unitId === undefined || it.unitId === '' ? null : toId(it.unitId, `${label}.unitId`);
        return { ingredientId, quantity, unitId, label };
      });

      const seen = new Set();
      for (const it of items) {
        if (it.ingredientId === productId) throw new ApiError(400, 'SELF_INGREDIENT', `${it.label}: a product cannot be its own ingredient`);
        if (seen.has(it.ingredientId)) throw new ApiError(400, 'DUPLICATE_INGREDIENT', `${it.label}: ingredient #${it.ingredientId} is listed twice`);
        seen.add(it.ingredientId);
      }

      const ingredients = items.length ? await Product.findAll({ where: { id: [...seen] }, transaction: t }) : [];
      const byId = new Map(ingredients.map(i => [i.id, i]));
      const unitMap = await loadUnitMap(Unit, t);

      // Sub-recipes are not supported: an ingredient must not have its own recipe
      const nested = items.length
        ? await Recipe.findAll({ where: { productId: [...seen] }, attributes: ['productId'], group: ['productId'], transaction: t })
        : [];
      const nestedIds = new Set(nested.map(n => n.productId));

      for (const it of items) {
        const ing = byId.get(it.ingredientId);
        if (!ing) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', `${it.label}: product #${it.ingredientId} not found`);
        if (nestedIds.has(it.ingredientId)) {
          throw new ApiError(400, 'NESTED_RECIPE', `${it.label}: ${ing.pro_name} has its own recipe; sub-recipes are not supported`);
        }
        const stockUnitId = stockUnitIdOf(ing);
        if (ing.stockMode === 'quantity' && !stockUnitId) {
          throw new ApiError(400, 'STOCK_UNIT_REQUIRED', `${it.label}: ${ing.pro_name} has no stock unit`);
        }
        if (it.unitId && !unitMap.has(it.unitId)) throw new ApiError(404, 'UNIT_NOT_FOUND', `${it.label}: unit #${it.unitId} not found`);
        if (it.unitId && !stockUnitId) {
          throw new ApiError(400, 'STOCK_UNIT_REQUIRED', `${it.label}: set the stock unit of ${ing.pro_name} before using a recipe unit`);
        }
        if (it.unitId && !canConvert(it.unitId, stockUnitId, unitMap)) {
          throw new ApiError(400, 'UNIT_NOT_CONVERTIBLE',
            `${it.label}: ${unitSymbol(unitMap, it.unitId)} cannot be converted to ${ing.pro_name}'s stock unit ${unitSymbol(unitMap, stockUnitId)}`);
        }
      }

      await Recipe.destroy({ where: { productId }, transaction: t });
      if (items.length) {
        await Recipe.bulkCreate(items.map(it => ({
          name: `${product.pro_name} - ${byId.get(it.ingredientId).pro_name}`.slice(0, 255),
          productId,
          ingredientId: it.ingredientId,
          quantity: it.quantity,
          unitId: it.unitId
        })), { transaction: t });
      }
      return describeRecipe(product, t);
    });
  };

  return { listStock, ledgerFor, convertToQuantity, receive, adjust, count, getRecipe, replaceRecipe, ledger };
};

module.exports = { createRawMaterialService };
