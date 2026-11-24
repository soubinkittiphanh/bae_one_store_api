/**
 * Raw-material + recipe API over HTTP against a real local server. LOCAL DATABASE ONLY.
 *
 *   DCOMMERCE_DB_HOST=127.0.0.1 DCOMMERCE_DB_USER=<user> DCOMMERCE_DB_PASSWORD=<pw> node test/rawMaterial/http.js
 *
 * Rebuilds RAW_HTTP_TEST_DB (default dcommerce_raw_http_test, must end in "_test") from RAW_TEST_SOURCE_DB
 * (default dcommerce_dev), starts src/index.js on a free port with RAW_MATERIAL_CONVERT=1 (startup applies the
 * POS migrations), and calls /api/raw-materials and /api/recipes. RAW_TEST_MYSQL_ARGS adds mariadb CLI args.
 */
const path = require('path');
const net = require('net');
const assert = require('assert');
const { execSync, spawn } = require('child_process');

const API_ROOT = path.resolve(__dirname, '../..');
const TEST_DB = process.env.RAW_HTTP_TEST_DB || 'dcommerce_raw_http_test';
const SOURCE_DB = process.env.RAW_TEST_SOURCE_DB || 'dcommerce_dev';
const CLI = `mariadb ${process.env.RAW_TEST_MYSQL_ARGS || ''}`;
if (!TEST_DB.endsWith('_test')) throw new Error(`RAW_HTTP_TEST_DB must end in _test (got ${TEST_DB})`);

const sh = cmd => execSync(cmd, { shell: '/bin/bash', encoding: 'utf8' });
// SQL goes through stdin, so backticks and quotes are never seen by the shell
const sql = query => execSync(`${CLI} -N -B ${TEST_DB}`, { input: query, encoding: 'utf8' }).trim();

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok    ${name}`); } catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`); }
};
const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(Number(a) - Number(b)) < eps, `${a} != ${b}`);

const startApi = (port) => new Promise((resolve, reject) => {
  const env = { ...process.env, PORT: String(port), TZ: 'Asia/Vientiane', DCOMMERCE_DB_NAME: TEST_DB, RAW_MATERIAL_CONVERT: '1' };
  delete env.NO_SYNC;
  const child = spawn(process.execPath, [path.join(API_ROOT, 'src/index.js')], { cwd: API_ROOT, env });
  let ready = false;
  let log = '';
  const timer = setTimeout(() => { if (!ready) { child.kill(); reject(new Error(`API did not start within 240s\n${log.slice(-2000)}`)); } }, 240000);
  const onData = (buf) => {
    log += buf.toString();
    if (!ready && /Database client is synchronized/.test(log)) { ready = true; clearTimeout(timer); resolve({ child, log: () => log }); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => { if (!ready) { clearTimeout(timer); reject(new Error(`API exited early (${code})\n${log.slice(-2000)}`)); } });
});

const main = async () => {
  const port = await freePort();
  process.env.PORT = String(port); // the JWT secret includes PORT (src/config/env.js)
  process.env.DCOMMERCE_DB_NAME = TEST_DB;
  const target = require('../../src/loan/dbGuard').assertLocalDb('test:raw-material-http');
  if (target.database !== TEST_DB) throw new Error(`Config resolves to ${target.database}, expected ${TEST_DB}`);

  console.log(`\n[setup] rebuilding ${TEST_DB} from local ${SOURCE_DB}`);
  sh(`${CLI} -e "DROP DATABASE IF EXISTS \\\`${TEST_DB}\\\`; CREATE DATABASE \\\`${TEST_DB}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"`);
  sh(`set -o pipefail; mariadb-dump ${process.env.RAW_TEST_MYSQL_ARGS || ''} --single-transaction ${SOURCE_DB} | ${CLI} ${TEST_DB}`);

  console.log('[setup] starting API (startup runs sync + POS migrations)');
  const api = await startApi(port);

  const axios = require('axios');
  const jwt = require('jsonwebtoken');
  const secret = require('../../src/config').actksecret;
  const userId = Number(sql('SELECT id FROM user WHERE isActive = 1 ORDER BY id LIMIT 1')) || 1;
  const token = jwt.sign({ id: userId, cus_name: 'raw-material-test' }, secret, { expiresIn: '1h' });
  const call = (method, url, data, auth = true) => axios({
    method, url: `http://127.0.0.1:${port}${url}`, data, validateStatus: () => true,
    headers: auth ? { Authorization: `Bearer ${token}` } : {}
  });
  const expect = (res, status, label) =>
    assert.strictEqual(res.status, status, `${label}: expected ${status}, got ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);

  // fixtures: kg / L / pcs raw materials, a menu item, and cards for the beans at two locations
  sql(`INSERT INTO product (pro_id, pro_name, pro_price, cost_price, stockUnitId, _category, createdAt, updateTimestamp) VALUES
    (991001, 'HTTP Coffee beans', 0, 0, 11, 'stock', NOW(), NOW()),
    (991002, 'HTTP Sugar syrup', 0, 0, 13, 'stock', NOW(), NOW()),
    (991003, 'HTTP Iced latte', 25000, 0, NULL, 'product', NOW(), NOW())`);
  const ids = Object.fromEntries(sql(`SELECT pro_id, id FROM product WHERE pro_id IN (991001, 991002, 991003)`)
    .split('\n').map(l => l.split('\t').map(Number)));
  const beans = ids[991001];
  const syrup = ids[991002];
  const latte = ids[991003];
  const cards = [];
  for (let i = 0; i < 3; i++) cards.push(`(10010, 991001, ${beans}, 100000, 100000, 'HTTPCARD${i}', 0, NOW(), 1, NOW(), NOW(), NOW(), NOW(), 1, 1)`);
  sql(`INSERT INTO card (card_type_code, product_id, productId, cost, costLCY, card_number, card_isused, card_input_date,
       inputter, update_time, update_time_new, createdAt, updateTimestamp, isActive, locationId) VALUES ${cards.join(',')}`);

  try {
    await test('server startup applied the step 1 migration', async () => {
      assert.strictEqual(sql(`SELECT name FROM pos_schema_migrations`), '20261124_recipe_bom_step1');
      assert.strictEqual(sql(`SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME IN ('fk_stock_balance_product', 'fk_rsi_stock_tx', 'fk_stock_tx_location')`), '3');
    });

    await test('requires login', async () => {
      expect(await call('get', '/api/raw-materials', null, false), 401, 'list without token');
      expect(await call('put', `/api/recipes/product/${latte}`, { items: [] }, false), 401, 'recipe without token');
    });

    await test('convert beans: 3 cards -> 3 kg at location 1', async () => {
      const r = await call('post', `/api/raw-materials/${beans}/convert`);
      expect(r, 200, 'convert');
      assert.strictEqual(r.data.data.stockMode, 'quantity');
      close(r.data.data.balances[0].quantity, 3);
      expect(await call('post', `/api/raw-materials/${syrup}/convert`), 200, 'convert syrup');
    });

    await test('receive 500 g with total cost', async () => {
      const r = await call('post', `/api/raw-materials/${beans}/receive`, { locationId: 1, quantity: 500, unitId: 16, totalCost: 60000, notes: 'Supplier A' });
      expect(r, 201, 'receive');
      close(r.data.data.after, 3.5);
      close(r.data.data.avgCost, (3 * 100000 + 0.5 * 120000) / 3.5);
      expect(await call('post', `/api/raw-materials/${syrup}/receive`, { locationId: 1, quantity: 2, unitCost: 30000 }), 201, 'receive syrup');
    });

    await test('bad input returns 400 JSON with a code', async () => {
      const r = await call('post', `/api/raw-materials/${beans}/receive`, { locationId: 1, quantity: 1, unitId: 12 });
      expect(r, 400, 'standalone gram');
      assert.strictEqual(r.data.code, 'UNIT_NOT_CONVERTIBLE');
      const r2 = await call('post', `/api/raw-materials/${beans}/adjust`, { locationId: 1, quantity: -1 });
      expect(r2, 400, 'no reason');
      assert.strictEqual(r2.data.code, 'REASON_REQUIRED');
      expect(await call('post', `/api/raw-materials/${latte}/receive`, { locationId: 1, quantity: 1 }), 409, 'menu item is not a raw material');
      expect(await call('get', '/api/raw-materials/abc/ledger'), 400, 'bad id');
    });

    await test('shortage returns 409 with stockErrors (format the Flutter app parses)', async () => {
      const r = await call('post', `/api/raw-materials/${beans}/adjust`, { locationId: 1, quantity: -10, reason: 'test' });
      expect(r, 409, 'shortage');
      assert.strictEqual(r.data.success, false);
      const e = r.data.stockErrors[0];
      assert.strictEqual(e.productId, beans);
      close(e.required, 10); close(e.available, 3.5); close(e.shortage, 6.5);
    });

    await test('adjust waste and count', async () => {
      const a = await call('post', `/api/raw-materials/${beans}/adjust`, { locationId: 1, quantity: -200, unitId: 16, reason: 'Spilled' });
      expect(a, 201, 'adjust');
      close(a.data.data.after, 3.3);
      const c = await call('post', `/api/raw-materials/${beans}/count`, { locationId: 1, countedQuantity: 3 });
      expect(c, 201, 'count');
      close(c.data.data.change, -0.3);
    });

    await test('stock list and ledger', async () => {
      sql(`UPDATE product SET minStock = 5 WHERE id = ${beans}`);
      const l = await call('get', '/api/raw-materials?lowOnly=1');
      expect(l, 200, 'list');
      const b = l.data.data.find(x => x.productId === beans);
      close(b.totalQuantity, 3); assert.strictEqual(b.stockUnit.symbol, 'kg'); assert.strictEqual(b.isLow, true);
      const g = await call('get', `/api/raw-materials/${beans}/ledger?limit=10`);
      expect(g, 200, 'ledger');
      assert.deepStrictEqual(g.data.data.items.map(i => i.type), ['count', 'adjustment', 'purchase', 'opening']);
      assert.strictEqual(g.data.data.items[0].createdBy, userId);
    });

    await test('save a recipe and read it back with costs', async () => {
      const r = await call('put', `/api/recipes/product/${latte}`, {
        items: [{ ingredientId: beans, quantity: 18, unitId: 16 }, { ingredientId: syrup, quantity: 20, unitId: 17 }]
      });
      expect(r, 200, 'save recipe');
      const [bl, sl] = r.data.data.items;
      close(bl.stockQuantity, 0.018); close(sl.stockQuantity, 0.02); close(sl.lineCost, 600, 0.01);
      const g = await call('get', `/api/recipes/product/${latte}/bom`);
      expect(g, 200, 'read recipe');
      assert.strictEqual(g.data.data.items.length, 2);
      // the old endpoint still sees the rows
      const old = await call('get', `/api/recipes/product/${latte}`);
      expect(old, 200, 'old recipe endpoint');
    });

    await test('invalid recipe is refused and the saved one kept', async () => {
      const r = await call('put', `/api/recipes/product/${latte}`, { items: [{ ingredientId: beans, quantity: 5, unitId: 17 }] });
      expect(r, 400, 'ml for a kg item');
      assert.strictEqual(r.data.code, 'UNIT_NOT_CONVERTIBLE');
      assert.strictEqual(sql(`SELECT COUNT(*) FROM recipe WHERE productId = ${latte}`), '2');
    });

    await test('existing product and stock-transaction endpoints still respond', async () => {
      expect(await call('get', '/api/unit/find'), 200, 'units');
      // the existing ledger endpoint reads the new rows (locationId, createdBy, new types)
      const st = await call('get', `/api/stock-transactions/product/${beans}`);
      expect(st, 200, 'stock transactions by product');
    });
  } finally {
    api.child.kill();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
