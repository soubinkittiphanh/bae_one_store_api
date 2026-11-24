/**
 * Sold before the product became a raw material, cancelled after (src/rawMaterial/cardBridge.js).
 * LOCAL DATABASE ONLY.
 *
 *   DCOMMERCE_DB_HOST=127.0.0.1 DCOMMERCE_DB_USER=<user> DCOMMERCE_DB_PASSWORD=<pw> node test/rawMaterial/bridgeFlow.js
 *
 * The returned cards must be credited to stock_balances (and retired), never come back as card stock.
 */
const assert = require('assert');
const { setup, test, results, close, expectStatus } = require('./harness');

const TEST_DB = process.env.RAW_BRIDGE_TEST_DB || 'dcommerce_raw_bridge_test';
const LOC = 1;

const main = async () => {
  const { sql, call, stop } = await setup(TEST_DB);
  const num = q => Number(sql(q));
  const MANAGER = num(`SELECT MIN(u.id) FROM user u JOIN userGroup g ON g.id = u.groupId WHERE g.code = 'ADMIN' AND u.isActive = 1`);
  const CANCEL_USER = num(`SELECT MIN(u.id) FROM user u JOIN userGroup g ON g.id = u.groupId WHERE g.ticketCancel = 1 AND u.isActive = 1`) || MANAGER;
  const PAYMENT = num('SELECT id FROM payment ORDER BY id LIMIT 1');
  const CCY = num('SELECT id FROM currency ORDER BY isLocalCCY DESC, id LIMIT 1');

  // Two card-tracked stock items (kg), 10 cards each at LOC, cost 50,000 per card
  sql(`INSERT INTO product (pro_id, pro_name, pro_price, cost_price, stockUnitId, _category, validateStockOnSale, createdAt, updateTimestamp) VALUES
    (994001, 'BR Flour', 60000, 50000, 11, 'stock', 1, NOW(), NOW()),
    (994002, 'BR Butter', 0, 50000, 11, 'stock', 1, NOW(), NOW()),
    (994003, 'BR Croissant', 25000, 0, NULL, 'product', 0, NOW(), NOW())`);
  const id = p => num(`SELECT id FROM product WHERE pro_id = ${p}`);
  const flour = id(994001); const butter = id(994002); const croissant = id(994003);
  const cards = (pid, pro, prefix) => Array.from({ length: 10 }, (_, i) =>
    `(10010, ${pro}, ${pid}, 50000, 50000, '${prefix}${i}', 0, NOW(), 1, NOW(), NOW(), NOW(), NOW(), 1, ${LOC})`).join(',');
  sql(`INSERT INTO card (card_type_code, product_id, productId, cost, costLCY, card_number, card_isused, card_input_date,
       inputter, update_time, update_time_new, createdAt, updateTimestamp, isActive, locationId)
       VALUES ${cards(flour, 994001, 'BRF')}, ${cards(butter, 994002, 'BRB')}`);
  sql(`INSERT INTO recipe (name, productId, ingredientId, quantity, unitId, createdAt, updatedAt)
       VALUES ('croissant butter', ${croissant}, ${butter}, 2, NULL, NOW(), NOW())`);
  sql(`UPDATE product SET stock_count = 10 WHERE id IN (${flour}, ${butter})`);

  const free = pid => num(`SELECT COUNT(*) FROM card WHERE productId = ${pid} AND card_isused = 0 AND saleLineId IS NULL AND ticketLineId IS NULL AND isActive = 1`);
  const bal = pid => num(`SELECT COALESCE(SUM(quantity), 0) FROM stock_balances WHERE product_id = ${pid} AND location_id = ${LOC}`);

  try {
    await test('merchant sale before conversion, cancelled after: cards credited to the balance', async () => {
      const line = { productId: flour, quantity: 3, unitRate: 1, price: 60000, total: 180000, discount: 0, currencyId: CCY, exchangeRate: 1,
        taxRate: 0, taxAmount: 0, taxType: 'INC', validateStockOnSale: 1, isActive: true, isGift: false, focQty: 0 };
      const r = await call('post', '/api/sale/create-v3', {
        bookingDate: new Date().toISOString().slice(0, 10), remark: 'bridge-test', discount: 0, total: 180000, exchangeRate: 1,
        isActive: true, clientId: null, paymentId: PAYMENT, currencyId: CCY, userId: MANAGER, referenceNo: '', locationId: LOC,
        lines: [line], payments: [{ paymentId: PAYMENT, amount: 180000, isActive: true }]
      }, MANAGER);
      expectStatus(r, 200, 'sale');
      const saleId = Number(String(r.data).split('-')[1]);
      assert.strictEqual(free(flour), 7);

      expectStatus(await call('post', `/api/raw-materials/${flour}/convert`, null, MANAGER), 200, 'convert flour');
      close(bal(flour), 7);
      assert.strictEqual(free(flour), 0);

      expectStatus(await call('put', `/api/sale/reverse/${saleId}`, { isActive: false, remark: 'bridge-test cancel', cancel_fee: 0, customerId: null }, CANCEL_USER), 200, 'reverse sale');
      close(bal(flour), 10);                 // 7 + the 3 returned
      assert.strictEqual(free(flour), 0);    // not back as card stock
      assert.strictEqual(num(`SELECT COUNT(*) FROM card WHERE productId = ${flour} AND isActive = 0 AND card_isused = 2`), 3);
      const tx = sql(`SELECT CONCAT(transaction_type, '/', reference_type, '/', ROUND(base_quantity_change)) FROM stock_transactions
                      WHERE productId = ${flour} ORDER BY id DESC LIMIT 1`);
      assert.strictEqual(tx, 'return/sale/3');
    });

    await test('ticket still open at conversion, cancelled after: ingredient cards credited', async () => {
      const r = await call('post', '/api/ticket', {
        locationId: LOC, createUserId: MANAGER, status: 'pending', paymentStatus: 'pending', subtotal: 25000, tax: 0, total: 25000,
        ticketLines: [{ productId: croissant, quantity: 1, unitPrice: 25000 }]
      }, MANAGER);
      expectStatus(r, 201, 'ticket');
      const tid = num('SELECT MAX(id) FROM ticket');
      assert.strictEqual(free(butter), 8);   // 2 butter cards reserved by the recipe (card logic); ticket stays open

      expectStatus(await call('post', `/api/raw-materials/${butter}/convert`, null, MANAGER), 200, 'convert butter');
      close(bal(butter), 8);

      expectStatus(await call('patch', `/api/ticket/${tid}/status`, { status: 'cancel', cancelReason: 'bridge-test' }, CANCEL_USER), 200, 'cancel ticket');
      close(bal(butter), 10);
      assert.strictEqual(free(butter), 0);
    });

    await test('after conversion the same recipe deducts from the balance (no cards)', async () => {
      // recipe quantity 2 with no unit = 2 kg of butter (its stock unit)
      const r = await call('post', '/api/ticket', {
        locationId: LOC, createUserId: MANAGER, status: 'pending', paymentStatus: 'pending', subtotal: 25000, tax: 0, total: 25000,
        ticketLines: [{ productId: croissant, quantity: 1, unitPrice: 25000 }]
      }, MANAGER);
      expectStatus(r, 201, 'ticket');
      close(bal(butter), 8);
      assert.strictEqual(num(`SELECT COUNT(*) FROM card WHERE productId = ${butter} AND isActive = 1`), 0);
    });
  } finally {
    stop();
  }
  const { passed, failed } = results();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch(err => { console.error(err); process.exit(1); });
