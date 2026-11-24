/**
 * The one place that changes a raw-material balance. Every movement (opening, purchase, adjustment, count,
 * and in Step 3 recipe deduction / reversal) goes through applyMovement inside the caller's transaction:
 *
 *   lock stock_balances row (SELECT ... FOR UPDATE) -> compute after -> write stock_transactions -> update balance
 *
 * Quantities are in the product's stock unit; callers convert first (units.js).
 */
const { StockShortageError, ApiError } = require('./errors');
const { round4 } = require('./units');

const round2 = n => Math.round(n * 100) / 100;
const round6 = n => Math.round(n * 1e6) / 1e6;

const createLedger = (db) => {
  const { stockBalance: StockBalance, stockTransactionModel: StockTransaction } = db;

  // Locking read FIRST, never a plain read before it: with innodb_snapshot_isolation (MariaDB 11.6+ default)
  // a row read without a lock and changed by another sale before we lock it fails with
  // "Record has changed since last read". A missing row is inserted; a concurrent insert of the same
  // row loses on the unique key and then waits on the lock like any other writer.
  const lockBalance = async (productId, locationId, transaction) => {
    if (!transaction) throw new Error('lockBalance needs a transaction');
    const where = { productId, locationId };
    const lockOpts = { where, transaction, lock: transaction.LOCK.UPDATE };
    const existing = await StockBalance.findOne(lockOpts);
    if (existing) return existing;
    try {
      await StockBalance.create({ productId, locationId, quantity: 0, avgCost: 0 }, { transaction });
    } catch (e) {
      if (e.name !== 'SequelizeUniqueConstraintError') throw e;
    }
    return StockBalance.findOne(lockOpts);
  };

  /**
   * @param {object} m
   *   productId, locationId, type (stock_transactions.transaction_type)
   *   change      signed quantity in stock unit, or
   *   setTo       target quantity (stock count); change is computed after the lock
   *   unitCost    LCY per stock unit for incoming stock (updates the weighted average); outgoing uses the average
   *   transactionQuantity / transactionUnitId / transactionRate   what the user entered, for the ledger
   *   stockUnitId, referenceType, referenceId, notes, userId, reversalOfId
   *   allowNegative  let the balance go below zero (default false)
   */
  const applyMovement = async (m, transaction) => {
    const balance = await lockBalance(m.productId, m.locationId, transaction);
    const before = Number(balance.quantity);
    const avgBefore = Number(balance.avgCost);

    const change = m.setTo !== undefined ? round4(Number(m.setTo) - before) : round4(Number(m.change));
    if (!Number.isFinite(change)) throw new ApiError(400, 'INVALID_QUANTITY', 'Quantity must be a number');
    const after = round4(before + change);

    if (change < 0 && after < 0 && !m.allowNegative) {
      const required = -change;
      const available = Math.max(before, 0);
      throw new StockShortageError([{
        productId: m.productId,
        locationId: m.locationId,
        required,
        available,
        shortage: round4(required - available)
      }]);
    }

    // Weighted average: only incoming stock with a known cost moves it
    let avgAfter = avgBefore;
    const incomingCost = m.unitCost !== undefined && m.unitCost !== null ? Number(m.unitCost) : null;
    if (change > 0 && incomingCost !== null) {
      const onHand = Math.max(before, 0);
      avgAfter = onHand + change > 0 ? round6((onHand * avgBefore + change * incomingCost) / (onHand + change)) : incomingCost;
    }
    const costPerUnit = change > 0 && incomingCost !== null ? incomingCost : avgBefore;

    const row = await StockTransaction.create({
      transactionType: m.type,
      transactionQuantity: Math.abs(Number(m.transactionQuantity ?? change)),
      transactionRate: m.transactionRate || 1,
      baseQuantityChange: change,
      baseQuantityBefore: before,
      baseQuantityAfter: after,
      unitCost: round6(costPerUnit),
      totalCost: round2(Math.abs(change) * costPerUnit),
      referenceType: m.referenceType || null,
      referenceId: m.referenceId || null,
      notes: m.notes || null,
      productId: m.productId,
      transactionUnitId: m.transactionUnitId || m.stockUnitId || null,
      baseUnitId: m.stockUnitId || null,
      locationId: m.locationId,
      createdBy: m.userId || null,
      reversalOfId: m.reversalOfId || null,
      createdAt: new Date()
    }, { transaction });

    await balance.update({ quantity: after, avgCost: avgAfter, lastTransactionId: row.id }, { transaction });

    return { transaction: row, before, after, change, unitCost: costPerUnit, avgCost: avgAfter };
  };

  return { lockBalance, applyMovement };
};

module.exports = { createLedger, round2, round6 };
