/**
 * Cards of a product that was converted to a raw material (stockMode 'quantity') after they were sold.
 *
 * A sale / ticket made before the conversion consumed stock cards. When it is cancelled or edited, the old
 * code makes those cards available again; for a 'quantity' product that would count the stock twice
 * (once as cards, once in stock_balances). returnCardsToStock credits the balance instead (one card = one
 * stock unit, at the card's cost) and retires the cards (isActive 0, card_isused 2), then hands back the ids
 * of the other cards for the normal card logic.
 *
 * Runs inside the caller's transaction.
 */
const { QueryTypes } = require('sequelize');
const { createLedger, round6 } = require('./ledger');

const createCardBridge = (db, logger = console) => {
  const { sequelize } = db;
  const ledger = createLedger(db);

  /**
   * @param cardIds   cards the caller is about to make available again
   * @param ref       { referenceType: 'sale' | 'ticket', referenceId, userId, note }
   * @returns ids of the cards the caller should still process (not raw materials)
   */
  const returnCardsToStock = async (cardIds, ref, transaction) => {
    const ids = [...new Set((cardIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return [];

    const rows = await sequelize.query(
      `SELECT c.id, c.productId, c.locationId, COALESCE(c.costLCY, c.cost, 0) AS cost,
              COALESCE(p.stockUnitId, p.baseUnitId) AS stockUnitId
         FROM card c JOIN product p ON p.id = c.productId
        WHERE c.id IN (?) AND p.stockMode = 'quantity'`,
      { replacements: [ids], type: QueryTypes.SELECT, transaction }
    );
    if (!rows.length) return ids;

    // One movement per product and location
    const groups = new Map();
    for (const r of rows) {
      const key = `${r.productId}|${r.locationId}`;
      if (!groups.has(key)) groups.set(key, { productId: r.productId, locationId: r.locationId, stockUnitId: r.stockUnitId, cards: [], cost: 0 });
      const g = groups.get(key);
      g.cards.push(r.id);
      g.cost += Number(r.cost) || 0;
    }

    for (const g of groups.values()) {
      if (!g.locationId) {
        // No location to credit: retire the cards anyway so they never come back as card stock
        logger.warn(`[raw-material] ${g.cards.length} returned card(s) of product ${g.productId} have no location; not credited`);
        continue;
      }
      await ledger.applyMovement({
        productId: g.productId, locationId: g.locationId, type: 'return', change: g.cards.length,
        unitCost: round6(g.cost / g.cards.length), transactionQuantity: g.cards.length, stockUnitId: g.stockUnitId,
        referenceType: ref.referenceType, referenceId: ref.referenceId,
        notes: ref.note || `Returned ${g.cards.length} card(s) sold before the product became a raw material`,
        userId: ref.userId, allowNegative: true
      }, transaction);
    }

    const bridged = rows.map(r => r.id);
    await sequelize.query(
      `UPDATE card SET isActive = 0, card_isused = 2 WHERE id IN (?)`,
      { replacements: [bridged], type: QueryTypes.UPDATE, transaction }
    );
    const bridgedSet = new Set(bridged);
    return ids.filter(id => !bridgedSet.has(id));
  };

  return { returnCardsToStock };
};

module.exports = { createCardBridge };
