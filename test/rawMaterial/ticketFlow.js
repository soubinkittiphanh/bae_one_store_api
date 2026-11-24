/**
 * Restaurant tickets with raw-material recipes, over HTTP on a local API. LOCAL DATABASE ONLY.
 *
 *   DCOMMERCE_DB_HOST=127.0.0.1 DCOMMERCE_DB_USER=<user> DCOMMERCE_DB_PASSWORD=<pw> node test/rawMaterial/ticketFlow.js
 *
 * Covers: create (recipe + option ingredients, unit conversion), shortage, edit carry-over (kept / added /
 * removed made -> waste), cancel kitchen rule, manager override + permission, delete, concurrent tickets,
 * card-based ingredients unchanged.
 */
const assert = require('assert');
const { setup, test, results, close, expectStatus } = require('./harness');

const TEST_DB = process.env.RAW_TICKET_TEST_DB || 'dcommerce_raw_ticket_test';
const LOC = 1;
const U = { pcs: 1, kg: 11, L: 13, g: 16, ml: 17 };

const main = async () => {
  const { sql, call, stop } = await setup(TEST_DB, { RAW_MATERIAL_CONVERT: '1' });
  const one = q => sql(q);
  const num = q => Number(sql(q));
  const CASHIER = num(`SELECT MIN(u.id) FROM user u JOIN userGroup g ON g.id = u.groupId WHERE g.code = 'CASHIER' AND u.isActive = 1`);
  const MANAGER = num(`SELECT MIN(u.id) FROM user u JOIN userGroup g ON g.id = u.groupId WHERE g.code = 'ADMIN' AND u.isActive = 1`);
  assert.ok(CASHIER && MANAGER, 'source DB needs an active CASHIER and ADMIN user');

  // ---------------------------------------------------------------- fixtures
  sql(`INSERT INTO product (pro_id, pro_name, pro_price, cost_price, stockUnitId, _category, validateStockOnSale, createdAt, updateTimestamp) VALUES
    (992001, 'TK Coffee beans', 0, 0, ${U.kg}, 'stock', 1, NOW(), NOW()),
    (992002, 'TK Milk', 0, 0, ${U.L}, 'stock', 0, NOW(), NOW()),
    (992003, 'TK Iced latte', 25000, 0, NULL, 'product', 0, NOW(), NOW()),
    (992004, 'TK Cup', 0, 500, ${U.pcs}, 'stock', 0, NOW(), NOW()),
    (992005, 'TK Tea', 15000, 0, NULL, 'product', 0, NOW(), NOW())`);
  const id = proId => num(`SELECT id FROM product WHERE pro_id = ${proId}`);
  const beans = id(992001); const milk = id(992002); const latte = id(992003); const cup = id(992004); const tea = id(992005);

  sql(`INSERT INTO recipe (name, productId, ingredientId, quantity, unitId, createdAt, updatedAt) VALUES
    ('latte beans', ${latte}, ${beans}, 18, ${U.g}, NOW(), NOW()),
    ('latte milk', ${latte}, ${milk}, 150, ${U.ml}, NOW(), NOW()),
    ('tea cup', ${tea}, ${cup}, 1, NULL, NOW(), NOW())`);
  sql(`INSERT INTO productOptionGroup (productId, groupName, createdAt, updatedAt) VALUES (${latte}, 'TK extras', NOW(), NOW())`);
  const groupId = num(`SELECT id FROM productOptionGroup WHERE groupName = 'TK extras'`);
  sql(`INSERT INTO productOption (groupId, optionName, priceAdjustment, costAdjustment, ingredientProductId, ingredientQuantity, ingredientUnitId, createdAt, updatedAt)
       VALUES (${groupId}, 'Extra shot', 5000, 0, ${beans}, 9, ${U.g}, NOW(), NOW())`);
  const shot = num(`SELECT id FROM productOption WHERE optionName = 'Extra shot' AND groupId = ${groupId}`);
  const withShot = [{ id: shot, optionName: 'Extra shot' }];

  const bal = pid => num(`SELECT COALESCE(SUM(quantity), 0) FROM stock_balances WHERE product_id = ${pid} AND location_id = ${LOC}`);
  const impacts = (where) => sql(`SELECT disposition, COUNT(*) FROM recipe_stock_impacts WHERE ${where} GROUP BY disposition ORDER BY disposition`);
  const lineIds = ticketId => sql(`SELECT id FROM ticketLine WHERE ticketId = ${ticketId} ORDER BY id`).split('\n').map(Number);
  const ticket = (lines, userId = CASHIER) => {
    const ticketLines = lines.map(l => ({ unitPrice: 25000, ...l }));
    const subtotal = ticketLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    return call('post', '/api/ticket', {
      locationId: LOC, createUserId: userId, status: 'pending', paymentStatus: 'pending',
      subtotal, tax: 0, total: subtotal, ticketLines
    }, userId);
  };

  for (const p of [beans, milk]) expectStatus(await call('post', `/api/raw-materials/${p}/convert`, null, MANAGER), 200, 'convert');
  expectStatus(await call('post', `/api/raw-materials/${beans}/receive`, { locationId: LOC, quantity: 1000, unitId: U.g, totalCost: 300000 }, MANAGER), 201, 'receive beans');
  expectStatus(await call('post', `/api/raw-materials/${milk}/receive`, { locationId: LOC, quantity: 2, unitId: U.L, totalCost: 40000 }, MANAGER), 201, 'receive milk');

  let t1;
  try {
    await test('create: recipe + option ingredients are deducted in stock units', async () => {
      const r = await ticket([{ productId: latte, quantity: 2 }, { productId: latte, quantity: 1, selectedOptions: withShot }]);
      expectStatus(r, 201, 'create ticket');
      t1 = r.data.data ? (r.data.data.id || r.data.data.ticket?.id) : r.data.id;
      t1 = t1 || num(`SELECT MAX(id) FROM ticket`);
      close(bal(beans), 1 - (2 * 0.018 + 0.018 + 0.009)); // 0.937 kg
      close(bal(milk), 2 - 3 * 0.15);                     // 1.55 L
      const [a, b] = lineIds(t1);
      assert.strictEqual(num(`SELECT COUNT(*) FROM recipe_stock_impacts WHERE source_type = 'ticket' AND source_line_id = ${a}`), 2);
      assert.strictEqual(num(`SELECT COUNT(*) FROM recipe_stock_impacts WHERE source_type = 'ticket' AND source_line_id = ${b}`), 3);
      close(num(`SELECT total_cost FROM recipe_stock_impacts WHERE source_line_id = ${a} AND ingredient_id = ${beans}`), 0.036 * 300000, 0.02);
    });

    await test('shortage of a validated ingredient refuses the whole ticket (409 stockErrors)', async () => {
      const before = [bal(beans), bal(milk), num('SELECT COUNT(*) FROM ticket')];
      const r = await ticket([{ productId: latte, quantity: 100 }]);
      expectStatus(r, 409, 'shortage');
      assert.strictEqual(r.data.stockErrors[0].productId, beans);
      close(r.data.stockErrors[0].required, 1.8);
      assert.deepStrictEqual([bal(beans), bal(milk), num('SELECT COUNT(*) FROM ticket')], before);
    });

    await test('edit: kept dishes carry over, added are deducted, removed made ones are waste', async () => {
      const [a] = lineIds(t1);
      sql(`UPDATE ticketLine SET status = 'served' WHERE id = ${a}`); // the 2 plain lattes were served
      const txBefore = num('SELECT COUNT(*) FROM stock_transactions');
      // 2 served lattes -> 1 kept; latte+shot 1 -> 2
      const r = await call('put', `/api/ticket/${t1}`, {
        ticketLines: [
          { productId: latte, quantity: 1, unitPrice: 25000, status: 'served' },
          { productId: latte, quantity: 2, unitPrice: 30000, selectedOptions: withShot }
        ]
      }, CASHIER);
      expectStatus(r, 200, 'edit ticket');
      close(bal(beans), 0.937 - 0.027); // only the added latte+shot is deducted
      close(bal(milk), 1.55 - 0.15);
      // exactly 3 new ledger rows (beans, milk, shot for the added one); no return/re-deduct churn
      assert.strictEqual(num('SELECT COUNT(*) FROM stock_transactions') - txBefore, 3);
      const [n1, n2] = lineIds(t1);
      close(num(`SELECT SUM(quantity_sold) FROM recipe_stock_impacts WHERE source_line_id = ${n1} AND ingredient_id = ${milk} AND disposition = 'consumed'`), 1);
      close(num(`SELECT SUM(quantity_sold) FROM recipe_stock_impacts WHERE source_line_id = ${n2} AND ingredient_id = ${milk} AND disposition = 'consumed'`), 2);
      // the removed served latte: its beans + milk are waste, stock not given back
      assert.strictEqual(num(`SELECT COUNT(*) FROM recipe_stock_impacts WHERE disposition = 'wasted' AND quantity_sold = 1`), 2);
    });

    await test('a cashier cannot force a return (403), nothing changes', async () => {
      const before = [bal(beans), bal(milk)];
      const r = await call('patch', `/api/ticket/${t1}/status`, { status: 'cancel', cancelReason: 'test', returnIngredients: true }, CASHIER);
      expectStatus(r, 403, 'cashier override');
      assert.strictEqual(r.data.code, 'MANAGER_REQUIRED');
      assert.deepStrictEqual([bal(beans), bal(milk)], before);
      assert.notStrictEqual(one(`SELECT status FROM ticket WHERE id = ${t1}`), 'cancel');
    });

    await test('cancel: ordered lines return to stock, served lines are waste', async () => {
      const r = await call('patch', `/api/ticket/${t1}/status`, { status: 'cancel', cancelReason: 'Customer left' }, CASHIER);
      expectStatus(r, 200, 'cancel');
      // the 2 latte+shot (ordered) come back; the served latte stays used
      close(bal(beans), 0.910 + 2 * 0.027);
      close(bal(milk), 1.40 + 2 * 0.15);
      const [n1, n2] = lineIds(t1);
      assert.strictEqual(impacts(`source_line_id = ${n1}`), 'wasted\t2');
      assert.strictEqual(impacts(`source_line_id = ${n2}`), 'returned\t6');
      assert.strictEqual(num(`SELECT COUNT(*) FROM stock_transactions WHERE transaction_type = 'recipe_reversal' AND reversal_of_id IS NOT NULL`), 6);
      assert.strictEqual(one(`SELECT DISTINCT disposition_note FROM recipe_stock_impacts WHERE source_line_id = ${n2}`), 'Customer left');
    });

    await test('manager can return a served dish to stock', async () => {
      const before = bal(beans);
      const r = await ticket([{ productId: latte, quantity: 1 }]);
      expectStatus(r, 201, 'create');
      const tid = num('SELECT MAX(id) FROM ticket');
      sql(`UPDATE ticketLine SET status = 'served' WHERE ticketId = ${tid}`);
      const c = await call('patch', `/api/ticket/${tid}/status`, { status: 'cancel', cancelReason: 'Wrong order', returnIngredients: true }, MANAGER);
      expectStatus(c, 200, 'cancel with return');
      close(bal(beans), before);
      assert.strictEqual(impacts(`source_line_id = ${lineIds(tid)[0]}`), 'returned\t2');
    });

    await test('delete: an ordered ticket gives its ingredients back', async () => {
      const before = [bal(beans), bal(milk)];
      expectStatus(await ticket([{ productId: latte, quantity: 2 }]), 201, 'create');
      const tid = num('SELECT MAX(id) FROM ticket');
      expectStatus(await call('delete', `/api/ticket/${tid}`, null, CASHIER), 200, 'delete');
      close(bal(beans), before[0]); close(bal(milk), before[1]);
    });

    await test('concurrent edits never take more than is on hand', async () => {
      // Edits, not creates: concurrent creates collide on ticketNumber (existing race in Ticket.generateTicketNumber)
      const tids = [];
      for (let i = 0; i < 3; i++) {
        expectStatus(await ticket([{ productId: tea, quantity: 1 }]), 201, 'tea ticket');
        tids.push(num('SELECT MAX(id) FROM ticket'));
      }
      expectStatus(await call('post', `/api/raw-materials/${beans}/count`, { locationId: LOC, countedQuantity: 36, unitId: U.g }, MANAGER), 201, 'count to 36 g');
      const rs = await Promise.all(tids.map(tid => call('put', `/api/ticket/${tid}`, {
        ticketLines: [{ productId: tea, quantity: 1, unitPrice: 15000 }, { productId: latte, quantity: 1, unitPrice: 25000 }]
      }, CASHIER)));
      const codes = rs.map(r => r.status).sort();
      assert.deepStrictEqual(codes, [200, 200, 409], `statuses ${codes} ${rs.filter(r => ![200, 409].includes(r.status)).map(r => JSON.stringify(r.data).slice(0, 200))}`);
      close(bal(beans), 0);
    });

    await test('card-based recipe ingredients keep the card logic', async () => {
      expectStatus(await ticket([{ productId: tea, quantity: 2 }]), 201, 'tea');
      const tid = num('SELECT MAX(id) FROM ticket');
      assert.strictEqual(num(`SELECT COUNT(*) FROM card WHERE productId = ${cup} AND ticketLineId = ${lineIds(tid)[0]}`), 2);
      assert.strictEqual(num(`SELECT COUNT(*) FROM recipe_stock_impacts WHERE source_line_id = ${lineIds(tid)[0]}`), 0);
    });
  } finally {
    stop();
  }

  const { passed, failed } = results();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
