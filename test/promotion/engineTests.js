/**
 * Promotion engine tests (pure functions, no database).
 *   npm run test:promotion
 * Also checks that dc_web/utils/promotionEngine.js (the POS copy) has the same code, when that repo
 * sits next to this one.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calculatePromotions, isPromotionLive, isLineEligible } = require('../../src/pos/promotion/engine');

const NOW = new Date('2026-11-22T12:00:00+07:00');
const promo = (o) => ({
  id: o.id || 1, name: o.name || `P${o.id || 1}`, type: o.type, priority: o.priority || 1, is_active: true,
  start_date: '2026-11-01T00:00:00+07:00', end_date: '2026-12-31T23:59:00+07:00',
  max_uses: null, current_uses: 0, conditions: o.conditions || {}, ...o.extra,
});
const line = (key, productId, unitPrice, quantity, categoryId = 10) => ({ key, productId, categoryId, unitPrice, quantity });

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

console.log('Promotion engine');

// ---------- buy X get Y ----------
const b2g1 = promo({ type: 'buy_x_get_y', conditions: { buy_quantity: 2, get_quantity: 1, applicable_products: [5] } });

test('buy 2 get 1: two units give nothing (the free one must be in the cart)', () => {
  const r = calculatePromotions([line('a', 5, 20000, 2)], [b2g1], NOW);
  assert.strictEqual(r.total, 0);
});
test('buy 2 get 1: three units give one free', () => {
  const r = calculatePromotions([line('a', 5, 20000, 3)], [b2g1], NOW);
  assert.strictEqual(r.total, 20000);
  assert.deepStrictEqual(r.applied[0].allocations, [{ key: 'a', amount: 20000 }]);
});
test('buy 2 get 1: seven units give two free', () => {
  assert.strictEqual(calculatePromotions([line('a', 5, 10000, 7)], [b2g1], NOW).total, 20000);
});
test('buy 2 get 1: the cheapest unit of each group is free', () => {
  const p = promo({ type: 'buy_x_get_y', conditions: { buy_quantity: 2, get_quantity: 1 } });
  // prices 30k, 25k, 10k -> one group, 10k free
  const r = calculatePromotions([line('a', 1, 30000, 1), line('b', 2, 25000, 1), line('c', 3, 10000, 1)], [p], NOW);
  assert.strictEqual(r.total, 10000);
  assert.deepStrictEqual(r.applied[0].allocations, [{ key: 'c', amount: 10000 }]);
});
test('buy 1 get 1 with max 1 free item', () => {
  const p = promo({ type: 'buy_x_get_y', conditions: { buy_quantity: 1, get_quantity: 1, max_free_items: 1 } });
  assert.strictEqual(calculatePromotions([line('a', 1, 15000, 6)], [p], NOW).total, 15000);
});
test('buy X get Y only counts eligible products', () => {
  const r = calculatePromotions([line('a', 5, 20000, 2), line('b', 6, 20000, 5)], [b2g1], NOW);
  assert.strictEqual(r.total, 0);
});

// ---------- percentage ----------
test('percentage on a category', () => {
  const p = promo({ type: 'percentage', conditions: { discount_percentage: 10, applicable_categories: [10] } });
  const r = calculatePromotions([line('a', 1, 50000, 2, 10), line('b', 2, 30000, 1, 20)], [p], NOW);
  assert.strictEqual(r.total, 10000);
});
test('percentage respects the maximum discount', () => {
  const p = promo({ type: 'percentage', conditions: { discount_percentage: 50, max_discount_amount: 15000 } });
  assert.strictEqual(calculatePromotions([line('a', 1, 100000, 1)], [p], NOW).total, 15000);
});
test('percentage respects the minimum order', () => {
  const p = promo({ type: 'percentage', conditions: { discount_percentage: 10, minimum_order: 100000 } });
  assert.strictEqual(calculatePromotions([line('a', 1, 90000, 1)], [p], NOW).total, 0);
  assert.strictEqual(calculatePromotions([line('a', 1, 100000, 1)], [p], NOW).total, 10000);
});
test('percentage allocations add up to the discount', () => {
  const p = promo({ type: 'percentage', conditions: { discount_percentage: 33 } });
  const r = calculatePromotions([line('a', 1, 10001, 1), line('b', 2, 20003, 2)], [p], NOW);
  const sum = r.applied[0].allocations.reduce((s, a) => s + a.amount, 0);
  assert.strictEqual(Math.round(sum * 100) / 100, r.total);
});
test('excluded product is not discounted', () => {
  const p = promo({ type: 'percentage', conditions: { discount_percentage: 10, excluded_products: [2] } });
  assert.strictEqual(calculatePromotions([line('a', 1, 10000, 1), line('b', 2, 90000, 1)], [p], NOW).total, 1000);
});

// ---------- fixed amount ----------
test('fixed amount is never more than the eligible amount', () => {
  const p = promo({ type: 'fixed_amount', conditions: { discount_amount: 50000, applicable_products: [1] } });
  assert.strictEqual(calculatePromotions([line('a', 1, 20000, 1), line('b', 2, 90000, 1)], [p], NOW).total, 20000);
});
test('fixed amount with minimum order', () => {
  const p = promo({ type: 'fixed_amount', conditions: { discount_amount: 10000, minimum_order: 200000 } });
  assert.strictEqual(calculatePromotions([line('a', 1, 150000, 1)], [p], NOW).total, 0);
  assert.strictEqual(calculatePromotions([line('a', 1, 250000, 1)], [p], NOW).total, 10000);
});

// ---------- combo ----------
const combo = promo({ type: 'combo_deal', conditions: { combo_price: 45000, required_items: [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }] } });
test('combo: burger 35k + drink 15k for 45k', () => {
  const r = calculatePromotions([line('a', 1, 35000, 1), line('b', 2, 15000, 1)], [combo], NOW);
  assert.strictEqual(r.total, 5000);
});
test('combo: counts complete sets only', () => {
  const r = calculatePromotions([line('a', 1, 35000, 3), line('b', 2, 15000, 2)], [combo], NOW);
  assert.strictEqual(r.total, 10000);
});
test('combo: missing item gives nothing', () => {
  assert.strictEqual(calculatePromotions([line('a', 1, 35000, 2)], [combo], NOW).total, 0);
});
test('combo: price above the items gives nothing', () => {
  const p = promo({ type: 'combo_deal', conditions: { combo_price: 60000, required_items: [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }] } });
  assert.strictEqual(calculatePromotions([line('a', 1, 35000, 1), line('b', 2, 15000, 1)], [p], NOW).total, 0);
});

// ---------- priority / stacking ----------
test('no double discount: higher priority takes the units first', () => {
  const p10 = promo({ id: 1, priority: 5, type: 'percentage', conditions: { discount_percentage: 10 } });
  const p50 = promo({ id: 2, priority: 1, type: 'percentage', conditions: { discount_percentage: 50 } });
  const r = calculatePromotions([line('a', 1, 100000, 1)], [p50, p10], NOW);
  assert.strictEqual(r.total, 10000);
  assert.strictEqual(r.applied.length, 1);
});
test('different items can get different promotions', () => {
  const pA = promo({ id: 1, priority: 2, type: 'percentage', conditions: { discount_percentage: 10, applicable_products: [1] } });
  const pB = promo({ id: 2, priority: 1, type: 'fixed_amount', conditions: { discount_amount: 5000, applicable_products: [2] } });
  const r = calculatePromotions([line('a', 1, 100000, 1), line('b', 2, 20000, 1)], [pA, pB], NOW);
  assert.strictEqual(r.total, 15000);
});
test('buy X get Y leaves unused units for the next promotion', () => {
  const bxgy = promo({ id: 1, priority: 5, type: 'buy_x_get_y', conditions: { buy_quantity: 2, get_quantity: 1 } });
  const pct = promo({ id: 2, priority: 1, type: 'percentage', conditions: { discount_percentage: 10 } });
  // 4 units of 10k: 3 go to buy-2-get-1 (10k off), the 4th gets 10% (1k off)
  assert.strictEqual(calculatePromotions([line('a', 1, 10000, 4)], [bxgy, pct], NOW).total, 11000);
});

// ---------- live checks ----------
test('inactive, not started, expired and used-up promotions do not apply', () => {
  const base = { type: 'percentage', conditions: { discount_percentage: 10 } };
  const lines = [line('a', 1, 100000, 1)];
  assert.strictEqual(calculatePromotions(lines, [promo({ ...base, extra: { is_active: false } })], NOW).total, 0);
  assert.strictEqual(calculatePromotions(lines, [promo({ ...base, extra: { start_date: '2026-11-23T00:00:00+07:00' } })], NOW).total, 0);
  assert.strictEqual(calculatePromotions(lines, [promo({ ...base, extra: { end_date: '2026-11-22T11:00:00+07:00' } })], NOW).total, 0);
  assert.strictEqual(calculatePromotions(lines, [promo({ ...base, extra: { max_uses: 5, current_uses: 5 } })], NOW).total, 0);
  assert.strictEqual(isPromotionLive(promo({ ...base, extra: { max_uses: 5, current_uses: 4 } }), NOW), true);
});
test('conditions stored as a JSON string are read', () => {
  const p = promo({ type: 'percentage', conditions: JSON.stringify({ discount_percentage: 20 }) });
  assert.strictEqual(calculatePromotions([line('a', 1, 10000, 1)], [p], NOW).total, 2000);
});
test('product ids match whether stored as numbers or strings', () => {
  const p = promo({ type: 'percentage', conditions: { discount_percentage: 10, applicable_products: ['7'] } });
  assert.strictEqual(isLineEligible(p, line('a', 7, 1, 1)), true);
});

// ---------- the POS copy is the same code ----------
test('dc_web/utils/promotionEngine.js matches this engine', () => {
  const webPath = path.resolve(__dirname, '../../../dc_web/utils/promotionEngine.js');
  if (!fs.existsSync(webPath)) { console.log('       (dc_web not found next to dc_api, skipped)'); return; }
  const norm = (s) => s
    .replace(/^\/\/ Same rules as .*$/m, '')
    .replace(/^export function /gm, 'function ')
    .replace(/^export default \{/m, 'module.exports = {');
  const api = fs.readFileSync(path.resolve(__dirname, '../../src/pos/promotion/engine.js'), 'utf8');
  assert.strictEqual(norm(fs.readFileSync(webPath, 'utf8')), norm(api), 'the two engine files differ');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
