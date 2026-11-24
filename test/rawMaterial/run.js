/**
 * Raw-material stock + recipe (BOM) service tests. LOCAL DATABASE ONLY.
 *
 *   node test/rawMaterial/run.js
 *
 * Rebuilds RAW_TEST_DB (default dcommerce_raw_material_test, must end in "_test") from RAW_TEST_SOURCE_DB
 * (default dcommerce_dev) with the mariadb / mariadb-dump CLIs, applies the POS migrations, then runs
 * src/rawMaterial/service.js against it. Nothing touches the source database.
 *
 * Connection: RAW_TEST_SOCKET (default /tmp/mysql.sock, OS-user socket login) or, when DCOMMERCE_DB_PASSWORD
 * is set, TCP with DCOMMERCE_DB_HOST / _PORT / _USER / _PASSWORD. RAW_TEST_MYSQL_ARGS adds CLI arguments.
 */
const assert = require('assert');
const os = require('os');
const { execSync } = require('child_process');
const { Sequelize, DataTypes } = require('sequelize');

const TEST_DB = process.env.RAW_TEST_DB || 'dcommerce_raw_material_test';
const SOURCE_DB = process.env.RAW_TEST_SOURCE_DB || 'dcommerce_dev';
const CLI_ARGS = process.env.RAW_TEST_MYSQL_ARGS || '';
if (!TEST_DB.endsWith('_test')) throw new Error(`RAW_TEST_DB must end in _test (got ${TEST_DB})`);

const SRC = '../../src/';
const LOC_MAIN = 1;
const LOC_2 = 7;
const U = { pcs: 1, kg: 11, gramStandalone: 12, L: 13, gramOfKg: 16, mlOfL: 17 };

let passed = 0;
const failures = [];
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
};

// Expects an ApiError with this code
const rejects = async (promise, code) => {
  try {
    await promise;
  } catch (e) {
    assert.strictEqual(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  throw new Error(`expected ${code}, but it succeeded`);
};

const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(Number(a) - Number(b)) < eps, `${a} != ${b}`);

const rebuildDb = () => {
  execSync(`mariadb ${CLI_ARGS} -e "DROP DATABASE IF EXISTS \\\`${TEST_DB}\\\`; CREATE DATABASE \\\`${TEST_DB}\\\` CHARACTER SET utf8mb4;"`);
  execSync(`mariadb-dump ${CLI_ARGS} --single-transaction ${SOURCE_DB} | mariadb ${CLI_ARGS} ${TEST_DB}`, { stdio: ['ignore', 'ignore', 'inherit'] });
};

const connect = () => {
  const common = { dialect: 'mariadb', logging: false, timezone: '+07:00' };
  if (process.env.DCOMMERCE_DB_PASSWORD) {
    return new Sequelize(TEST_DB, process.env.DCOMMERCE_DB_USER || 'root', process.env.DCOMMERCE_DB_PASSWORD, {
      ...common, host: process.env.DCOMMERCE_DB_HOST || '127.0.0.1', port: Number(process.env.DCOMMERCE_DB_PORT || 3306)
    });
  }
  return new Sequelize(TEST_DB, os.userInfo().username, null, {
    ...common, dialectOptions: { socketPath: process.env.RAW_TEST_SOCKET || '/tmp/mysql.sock' }
  });
};

const loadModels = (sequelize) => {
  const db = {
    sequelize,
    product: require(SRC + 'product/model')(sequelize, DataTypes),
    location: require(SRC + 'location/model')(sequelize, DataTypes),
    unit: require(SRC + 'unit/model')(sequelize, DataTypes),
    card: require(SRC + 'card/model')(sequelize, DataTypes),
    recipe: require(SRC + 'recipe/model')(sequelize, DataTypes),
    stockBalance: require(SRC + 'stockBalance/model')(sequelize, DataTypes),
    stockTransactionModel: require(SRC + 'stockTransaction/model')(sequelize, DataTypes)
  };
  return db;
};

const main = async () => {
  console.log(`Rebuilding ${TEST_DB} from ${SOURCE_DB}...`);
  rebuildDb();
  const sequelize = connect();
  const { runPosMigrations } = require(SRC + 'posMigrations');
  assert.ok(await runPosMigrations(sequelize, { info: () => {}, error: m => console.log(m) }), 'POS migrations failed');

  const db = loadModels(sequelize);
  const { createRawMaterialService } = require(SRC + 'rawMaterial/service');
  const svc = createRawMaterialService(db, { allowConvert: true });
  const svcDefault = createRawMaterialService(db);
  const q = (sql, replacements = []) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });

  // ---------------------------------------------------------------- fixtures
  let proId = 990000;
  const mk = (attrs) => db.product.create({ pro_id: ++proId, pro_price: 0, cost_price: 0, ...attrs });
  const beans = await mk({ pro_name: 'TEST Coffee beans', stockUnitId: U.kg, _category: 'stock' });
  const syrup = await mk({ pro_name: 'TEST Sugar syrup', stockUnitId: U.L, _category: 'stock' });
  const cup = await mk({ pro_name: 'TEST Plastic cup', stockUnitId: U.pcs, _category: 'stock', cost_price: 500 });
  const noUnit = await mk({ pro_name: 'TEST No unit', _category: 'stock' });
  const crate = await mk({ pro_name: 'TEST Crate', stockUnitId: U.pcs, _category: 'stock', isReturnablePackaging: true });
  const latte = await mk({ pro_name: 'TEST Iced latte', pro_price: 25000 });
  const combo = await mk({ pro_name: 'TEST Latte combo', pro_price: 40000 });

  let cardNo = 0;
  const addCards = (productId, n, cost, locationId, extra = '') => {
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push(`(10010, ${productId}, ${productId}, ${cost}, ${cost}, 'TESTCARD${++cardNo}', 0, NOW(), 1, NOW(), NOW(), NOW(), NOW(), 1, ${locationId}${extra})`);
    }
    return sequelize.query(
      `INSERT INTO card (card_type_code, product_id, productId, cost, costLCY, card_number, card_isused, card_input_date,
         inputter, update_time, update_time_new, createdAt, updateTimestamp, isActive, locationId${extra ? ', ticketLineId' : ''})
       VALUES ${rows.join(',')}`);
  };
  await addCards(beans.id, 5, 100000, LOC_MAIN);
  await addCards(beans.id, 2, 120000, LOC_2);
  // already consumed card: must not move
  await sequelize.query(`UPDATE card SET card_isused = 1 WHERE card_number = 'TESTCARD1'`);

  const [openLine] = await q(`SELECT MIN(tl.id) AS id FROM ticketLine tl JOIN ticket t ON t.id = tl.ticketId WHERE t.status NOT IN ('paid','cancel','void')`);
  const [paidLine] = await q(`SELECT MIN(tl.id) AS id FROM ticketLine tl JOIN ticket t ON t.id = tl.ticketId WHERE t.status = 'paid'`);
  assert.ok(openLine.id && paidLine.id, 'source DB needs an open and a paid ticket');

  // ---------------------------------------------------------------- convert
  await test('convert is off by default until step 3', () => rejects(svcDefault.convertToQuantity(beans.id), 'CONVERT_DISABLED'));
  await test('convert refuses returnable packaging', () => rejects(svc.convertToQuantity(crate.id), 'PACKAGING_PRODUCT'));
  await test('convert needs a stock unit', () => rejects(svc.convertToQuantity(noUnit.id), 'STOCK_UNIT_REQUIRED'));

  await test('convert refuses while an open ticket holds a card', async () => {
    await sequelize.query(`UPDATE card SET card_isused = 1, ticketLineId = ? WHERE card_number = 'TESTCARD1'`, { replacements: [openLine.id] });
    await rejects(svc.convertToQuantity(beans.id), 'OPEN_TICKETS');
    await sequelize.query(`UPDATE card SET ticketLineId = ? WHERE card_number = 'TESTCARD1'`, { replacements: [paidLine.id] });
  });

  await test('convert moves available cards into balances per location', async () => {
    const r = await svc.convertToQuantity(beans.id, { userId: 7 });
    assert.strictEqual(r.stockMode, 'quantity');
    const bal = await q('SELECT location_id AS loc, quantity, avg_cost AS avg FROM stock_balances WHERE product_id = ? ORDER BY location_id', [beans.id]);
    assert.strictEqual(bal.length, 2);
    close(bal[0].quantity, 4); close(bal[0].avg, 100000); // TESTCARD1 was consumed: 4 left at main
    close(bal[1].quantity, 2); close(bal[1].avg, 120000);
    const [p] = await q('SELECT stockMode, stock_count FROM product WHERE id = ?', [beans.id]);
    assert.strictEqual(p.stockMode, 'quantity'); assert.strictEqual(Number(p.stock_count), 0);
    const [cards] = await q('SELECT SUM(isActive = 1 AND card_isused = 0) AS avail, SUM(card_isused = 1) AS used FROM card WHERE productId = ?', [beans.id]);
    assert.strictEqual(Number(cards.avail), 0); assert.strictEqual(Number(cards.used), 1);
    const tx = await q(`SELECT transaction_type t, reference_type r, created_by u FROM stock_transactions WHERE productId = ?`, [beans.id]);
    assert.deepStrictEqual(tx.map(x => [x.t, x.r, x.u]), [['opening', 'conversion', 7], ['opening', 'conversion', 7]]);
  });
  await test('convert twice is refused', () => rejects(svc.convertToQuantity(beans.id), 'ALREADY_RAW_MATERIAL'));
  await test('a product without cards converts to an empty balance', async () => {
    const r = await svc.convertToQuantity(syrup.id);
    assert.deepStrictEqual(r.balances, []);
    await svc.convertToQuantity(cup.id);
  });

  // ---------------------------------------------------------------- receive / adjust / count
  await test('receive 500 g into a kg item updates quantity and weighted average', async () => {
    const r = await svc.receive({ productId: beans.id, locationId: LOC_MAIN, quantity: 500, unitId: U.gramOfKg, totalCost: 60000, userId: 7 });
    close(r.after, 4.5);
    close(r.avgCost, (4 * 100000 + 0.5 * 120000) / 4.5);
    const [tx] = await q('SELECT transaction_quantity tq, transaction_rate tr, base_quantity_change ch, transactionUnitId u FROM stock_transactions WHERE id = ?', [r.transaction.id]);
    close(tx.tq, 500); close(tx.tr, 0.001); close(tx.ch, 0.5); assert.strictEqual(tx.u, U.gramOfKg);
  });
  await test('receive with a unit cost per purchase unit', async () => {
    const r = await svc.receive({ productId: syrup.id, locationId: LOC_MAIN, quantity: 2, unitId: U.L, unitCost: 30000 });
    close(r.after, 2); close(r.avgCost, 30000);
    await svc.receive({ productId: cup.id, locationId: LOC_MAIN, quantity: 100, unitCost: 500 });
  });
  await test('a unit with a different base is refused', () =>
    rejects(svc.receive({ productId: beans.id, locationId: LOC_MAIN, quantity: 1, unitId: U.gramStandalone }), 'UNIT_NOT_CONVERTIBLE'));
  await test('receive rejects 0 / a card product / an unknown location', async () => {
    await rejects(svc.receive({ productId: beans.id, locationId: LOC_MAIN, quantity: 0 }), 'INVALID_QUANTITY');
    await rejects(svc.receive({ productId: latte.id, locationId: LOC_MAIN, quantity: 1 }), 'NOT_RAW_MATERIAL');
    await rejects(svc.receive({ productId: beans.id, locationId: 999999, quantity: 1 }), 'LOCATION_NOT_FOUND');
  });

  await test('adjust -200 g for waste keeps the average cost', async () => {
    const before = (await q('SELECT avg_cost a FROM stock_balances WHERE product_id = ? AND location_id = ?', [beans.id, LOC_MAIN]))[0].a;
    const r = await svc.adjust({ productId: beans.id, locationId: LOC_MAIN, quantity: -200, unitId: U.gramOfKg, reason: 'Spilled' });
    close(r.after, 4.3); close(r.avgCost, before);
    const [tx] = await q('SELECT unit_cost uc, total_cost tc, notes FROM stock_transactions WHERE id = ?', [r.transaction.id]);
    close(tx.uc, before, 1e-3); close(tx.tc, 0.2 * before, 0.01); assert.strictEqual(tx.notes, 'Spilled');
  });
  await test('adjust needs a reason', () =>
    rejects(svc.adjust({ productId: beans.id, locationId: LOC_MAIN, quantity: -1 }), 'REASON_REQUIRED'));

  await test('going below zero is refused in the sales shortage format, nothing written', async () => {
    const txBefore = (await q('SELECT COUNT(*) n FROM stock_transactions'))[0].n;
    const e = await rejects(svc.adjust({ productId: beans.id, locationId: LOC_MAIN, quantity: -10, reason: 'x' }), 'STOCK_SHORTAGE');
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.shortages[0].productId, beans.id);
    close(e.shortages[0].required, 10); close(e.shortages[0].available, 4.3); close(e.shortages[0].shortage, 5.7);
    close((await q('SELECT quantity FROM stock_balances WHERE product_id = ? AND location_id = ?', [beans.id, LOC_MAIN]))[0].quantity, 4.3);
    assert.strictEqual((await q('SELECT COUNT(*) n FROM stock_transactions'))[0].n, txBefore);
  });

  await test('count sets the balance and records the difference', async () => {
    const r = await svc.count({ productId: beans.id, locationId: LOC_MAIN, countedQuantity: 4 });
    close(r.after, 4); close(r.change, -0.3);
    await rejects(svc.count({ productId: beans.id, locationId: LOC_MAIN, countedQuantity: -1 }), 'INVALID_QUANTITY');
  });

  await test('two concurrent withdrawals cannot both take the last stock (row lock)', async () => {
    const results = await Promise.allSettled([
      svc.adjust({ productId: beans.id, locationId: LOC_MAIN, quantity: -3, reason: 'a' }),
      svc.adjust({ productId: beans.id, locationId: LOC_MAIN, quantity: -3, reason: 'b' })
    ]);
    results.filter(r => r.status === 'rejected' && r.reason.code !== 'STOCK_SHORTAGE').forEach(r => console.log('      other error:', r.reason.message));
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const short = results.filter(r => r.status === 'rejected' && r.reason.code === 'STOCK_SHORTAGE').length;
    assert.deepStrictEqual([ok, short], [1, 1]);
    close((await q('SELECT quantity FROM stock_balances WHERE product_id = ? AND location_id = ?', [beans.id, LOC_MAIN]))[0].quantity, 1);
  });

  await test('ledger lists movements newest first with paging', async () => {
    const l = await svc.ledgerFor(beans.id, { locationId: LOC_MAIN, limit: 3 });
    assert.strictEqual(l.product.stockUnit, 'kg');
    assert.strictEqual(l.pagination.total, 5); // opening, receive, adjust, count, one concurrent withdrawal
    assert.strictEqual(l.items.length, 3);
    assert.strictEqual(l.items[l.items.length - 1].type, 'adjustment');
    assert.ok(l.items[0].id > l.items[1].id);
  });

  await test('stock list totals locations and flags low stock', async () => {
    await beans.update({ minStock: 10 });
    const all = await svc.listStock();
    const b = all.find(r => r.productId === beans.id);
    close(b.totalQuantity, 3); assert.strictEqual(b.stockUnit.symbol, 'kg'); assert.strictEqual(b.isLow, true);
    assert.strictEqual(b.locations.length, 2);
    const low = await svc.listStock({ lowOnly: true });
    assert.ok(low.some(r => r.productId === beans.id) && !low.some(r => r.productId === syrup.id));
    const main = await svc.listStock({ locationId: LOC_2 });
    close(main.find(r => r.productId === beans.id).totalQuantity, 2);
  });

  // ---------------------------------------------------------------- recipes
  const recipeItems = [
    { ingredientId: beans.id, quantity: 18, unitId: U.gramOfKg },
    { ingredientId: syrup.id, quantity: 20, unitId: U.mlOfL },
    { ingredientId: cup.id, quantity: 1 }
  ];
  await test('replace recipe converts units and costs each line', async () => {
    const r = await svc.replaceRecipe(latte.id, recipeItems);
    assert.strictEqual(r.items.length, 3);
    const [b, s, c] = r.items;
    close(b.stockQuantity, 0.018); assert.strictEqual(b.unit, 'g'); assert.strictEqual(b.stockUnit, 'kg');
    close(s.stockQuantity, 0.02); close(s.lineCost, 600, 0.01); // 0.02 L x 30,000
    close(c.stockQuantity, 1); close(c.lineCost, 500, 0.01);
    close(r.totalCost, b.lineCost + 600 + 500, 0.02);
    close(r.margin, 25000 - r.totalCost, 0.02);
  });

  const countLines = async id => Number((await q('SELECT COUNT(*) n FROM recipe WHERE productId = ?', [id]))[0].n);
  await test('invalid recipes are refused and the saved recipe is untouched', async () => {
    await rejects(svc.replaceRecipe(latte.id, [{ ingredientId: latte.id, quantity: 1 }]), 'SELF_INGREDIENT');
    await rejects(svc.replaceRecipe(latte.id, [recipeItems[0], recipeItems[0]]), 'DUPLICATE_INGREDIENT');
    await rejects(svc.replaceRecipe(latte.id, [{ ingredientId: beans.id, quantity: 5, unitId: U.mlOfL }]), 'UNIT_NOT_CONVERTIBLE');
    await rejects(svc.replaceRecipe(latte.id, [{ ingredientId: beans.id, quantity: 0 }]), 'INVALID_QUANTITY');
    await rejects(svc.replaceRecipe(latte.id, [{ ingredientId: 99999999, quantity: 1 }]), 'INGREDIENT_NOT_FOUND');
    await rejects(svc.replaceRecipe(latte.id, [{ ingredientId: noUnit.id, quantity: 1, unitId: U.gramOfKg }]), 'STOCK_UNIT_REQUIRED');
    await rejects(svc.replaceRecipe(latte.id, 'nope'), 'INVALID_INPUT');
    assert.strictEqual(await countLines(latte.id), 3);
  });
  await test('sub-recipes and recipes on raw materials are refused', async () => {
    await rejects(svc.replaceRecipe(combo.id, [{ ingredientId: latte.id, quantity: 1 }]), 'NESTED_RECIPE');
    await rejects(svc.replaceRecipe(beans.id, [{ ingredientId: cup.id, quantity: 1 }]), 'RAW_MATERIAL_RECIPE');
  });
  await test('getRecipe returns the same costed recipe', async () => {
    const r = await svc.getRecipe(latte.id);
    assert.deepStrictEqual(r.items.map(i => i.ingredientId), [beans.id, syrup.id, cup.id]);
  });
  await test('an empty list removes the recipe', async () => {
    const r = await svc.replaceRecipe(latte.id, []);
    assert.strictEqual(r.items.length, 0);
    assert.strictEqual(await countLines(latte.id), 0);
  });

  await test('step 1 rollback stays blocked once raw-material data exists', async () => {
    const step1 = require(SRC + 'posMigrations/20261124_recipe_bom_step1');
    const { sequelizeRunner } = require(SRC + 'posMigrations');
    await assert.rejects(step1.down(sequelizeRunner(sequelize)), /Refusing to roll back/);
  });

  await sequelize.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
