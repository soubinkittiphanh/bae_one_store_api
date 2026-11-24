/**
 * Minimart sale save tests (POST /api/sale/create-v3, /create, /reverse, auto-cancel). LOCAL DATABASE ONLY.
 *
 *   DCOMMERCE_DB_HOST=127.0.0.1 DCOMMERCE_DB_USER=<user> DCOMMERCE_DB_PASSWORD=<pw> npm run test:sales
 *
 * Rebuilds SALES_TEST_DB (default dcommerce_sales_test, must end in "_test") from the local
 * SALES_TEST_SOURCE_DB (default dcommerce_dev), starts the API against it and checks that a sale is saved
 * completely or not at all: no inactive "ghost" bills, no payments or used stock left behind, and two
 * tills cannot sell the same stock card.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const assert = require('assert');
const { execFileSync, spawn } = require('child_process');

const API_ROOT = path.resolve(__dirname, '../..');
const TEST_DB = process.env.SALES_TEST_DB || 'dcommerce_sales_test';
const SOURCE_DB = process.env.SALES_TEST_SOURCE_DB || 'dcommerce_dev';
const MYSQL_ARGS = process.env.SALES_TEST_MYSQL_ARGS || '';
const RUN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-test-'));
process.chdir(RUN_DIR);

if (!/^\w+_test$/.test(TEST_DB) || !/^\w+$/.test(SOURCE_DB)) throw new Error('SALES_TEST_DB must be a plain name ending in _test');

const sh = (cmd) => execFileSync('bash', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const q = (sql) => sh(`mariadb ${MYSQL_ARGS} -N -B ${TEST_DB} -e ${JSON.stringify(sql)}`).trim();
const n = (sql) => Number(q(sql));
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok    ${name}`); } catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`); }
};

const startApi = (port) => new Promise((resolve, reject) => {
  const env = { ...process.env, PORT: String(port), TZ: 'Asia/Vientiane', DCOMMERCE_DB_NAME: TEST_DB, NO_SYNC: 'true' };
  const child = spawn(process.execPath, [path.join(API_ROOT, 'src/index.js')], { cwd: RUN_DIR, env });
  let log = '';
  let ready = false;
  const timer = setTimeout(() => { if (!ready) { child.kill(); reject(new Error(`API did not start within 240s\n${log.slice(-2000)}`)); } }, 240000);
  const onData = (buf) => {
    log += buf.toString();
    if (!ready && /(Dcommerce is up|Database client is synchronized)/.test(log)) { ready = true; clearTimeout(timer); setTimeout(() => resolve(child), 1500); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => { if (!ready) { clearTimeout(timer); reject(new Error(`API exited early (${code})\n${log.slice(-2000)}`)); } });
});

const main = async () => {
  const port = await freePort();
  process.env.DCOMMERCE_DB_NAME = TEST_DB;
  process.env.NO_SYNC = 'true'; // the in-process model load (auto-cancel test) must not sync the schema
  const target = require('../../src/loan/dbGuard').assertLocalDb('test:sales');
  if (target.database !== TEST_DB) throw new Error(`Config resolves to ${target.database}, expected ${TEST_DB}`);

  console.log(`\n[setup] rebuilding ${TEST_DB} from local ${SOURCE_DB}`);
  sh(`mariadb ${MYSQL_ARGS} -e "DROP DATABASE IF EXISTS \\\`${TEST_DB}\\\`; CREATE DATABASE \\\`${TEST_DB}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"`);
  sh(`set -o pipefail; mariadb-dump ${MYSQL_ARGS} --single-transaction ${SOURCE_DB} | mariadb ${MYSQL_ARGS} ${TEST_DB}`);

  // ---------- fixtures (test DB only) ----------
  const FREE = (pid, loc) => `card_isused = 0 AND saleLineId IS NULL AND ticketLineId IS NULL AND isActive = 1 AND productId = ${pid} AND locationId = ${loc}`;
  const pick = q(`SELECT c.productId, c.locationId FROM card c JOIN product p ON p.id = c.productId
    WHERE p.validateStockOnSale = 1 AND c.card_isused = 0 AND c.saleLineId IS NULL AND c.ticketLineId IS NULL AND c.isActive = 1
    GROUP BY c.productId, c.locationId HAVING COUNT(*) >= 10 ORDER BY c.productId LIMIT 2`).split('\n').map((r) => r.split('\t').map(Number));
  if (pick.length < 2) throw new Error(`Need two stock-validated products with 10+ free cards at one location in ${SOURCE_DB}`);
  const [[P, LOC], [P2, LOC2]] = pick;
  // keep exactly `count` free cards of a product at a location (others marked unusable)
  const setFree = (pid, loc, count) => {
    q(`UPDATE card SET card_isused = 2 WHERE id IN (SELECT id FROM (SELECT id FROM card WHERE ${FREE(pid, loc)} ORDER BY id LIMIT 1000000 OFFSET ${count}) x)`);
    assert.strictEqual(n(`SELECT COUNT(*) FROM card WHERE ${FREE(pid, loc)}`), count, `fixture: ${count} free cards of ${pid}`);
  };
  const freeCount = (pid = P, loc = LOC) => n(`SELECT COUNT(*) FROM card WHERE ${FREE(pid, loc)}`);
  const PAYMENT = n('SELECT id FROM payment ORDER BY id LIMIT 1');
  const CCY = n('SELECT id FROM currency ORDER BY isLocalCCY DESC, id LIMIT 1');
  const USER = n('SELECT id FROM user WHERE isActive = 1 ORDER BY id LIMIT 1');
  let CANCEL_USER = n('SELECT u.id FROM user u JOIN userGroup g ON g.id = u.groupId WHERE g.ticketCancel = 1 AND u.isActive = 1 ORDER BY u.id LIMIT 1');
  if (!CANCEL_USER) { q(`UPDATE userGroup SET ticketCancel = 1 WHERE id = (SELECT groupId FROM user WHERE id = ${USER})`); CANCEL_USER = USER; }

  console.log(`[setup] product ${P} at location ${LOC}, product ${P2} at location ${LOC2}; starting API`);
  const child = await startApi(port);

  const axios = require('axios');
  const jwt = require('jsonwebtoken');
  const secret = require('../../src/config').actksecret;
  const tokenFor = (id) => jwt.sign({ id, cus_name: `sales-test-${id}` }, secret, { expiresIn: '1h' });
  const call = (method, url, data, userId = USER) => axios({
    method, url: `http://127.0.0.1:${port}${url}`, data, validateStatus: () => true, timeout: 60000,
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
  });
  const line = (productId, quantity, price = 10000, extra = {}) => ({
    productId, quantity, unitRate: 1, price, total: price * quantity, discount: 0, currencyId: CCY, exchangeRate: 1,
    taxRate: 0, taxAmount: 0, taxType: 'INC', validateStockOnSale: 1, isActive: true, isGift: false, focQty: 0, ...extra,
  });
  const sale = (lines, loc = LOC, extra = {}) => ({
    bookingDate: new Date().toISOString().slice(0, 10), remark: 'sales-test', discount: 0,
    total: lines.reduce((s, l) => s + (Number(l.total) || 0), 0), exchangeRate: 1, isActive: true,
    clientId: null, paymentId: PAYMENT, currencyId: CCY, userId: USER, referenceNo: '', locationId: loc,
    lines, payments: [{ paymentId: PAYMENT, amount: lines.reduce((s, l) => s + (Number(l.total) || 0), 0), isActive: true }],
    ...extra,
  });
  const idFrom = (res) => {
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status} ${JSON.stringify(res.data)}`);
    assert.match(String(res.data), /^Transaction completed-\d+$/, 'reply format the POS parses');
    return Number(String(res.data).split('-')[1]);
  };
  const headers = () => n('SELECT COUNT(*) FROM saleHeader');
  const payments = () => n('SELECT COUNT(*) FROM salePayment');

  try {
    console.log('\nSale save');
    let firstSale;
    await test('a sale saves header, line, payment and links its stock card; stock count follows', async () => {
      setFree(P, LOC, 3);
      firstSale = idFrom(await call('post', '/api/sale/create-v3', sale([line(P, 1)])));
      assert.strictEqual(n(`SELECT isActive FROM saleHeader WHERE id = ${firstSale}`), 1);
      assert.strictEqual(n(`SELECT COUNT(*) FROM saleLine WHERE headerId = ${firstSale} AND isActive = 1`), 1);
      assert.strictEqual(n(`SELECT COUNT(*) FROM salePayment WHERE saleHeaderId = ${firstSale} AND isActive = 1`), 1);
      assert.strictEqual(n(`SELECT COUNT(*) FROM card c JOIN saleLine l ON l.id = c.saleLineId WHERE l.headerId = ${firstSale} AND c.card_isused = 1`), 1);
      assert.strictEqual(freeCount(), 2);
      assert.strictEqual(n(`SELECT stock_count FROM product WHERE id = ${P}`), n(`SELECT COUNT(*) FROM card WHERE productId = ${P} AND card_isused = 0 AND saleLineId IS NULL AND ticketLineId IS NULL AND isActive = 1`));
    });
    await test('the same product on two lines gets two different cards', async () => {
      const id = idFrom(await call('post', '/api/sale/create-v3', sale([line(P, 1), line(P, 1, 12000)])));
      const perLine = q(`SELECT COUNT(*) FROM card c JOIN saleLine l ON l.id = c.saleLineId WHERE l.headerId = ${id} GROUP BY l.id`).split('\n').map(Number);
      assert.deepStrictEqual(perLine, [1, 1]);
      assert.strictEqual(freeCount(), 0);
    });
    await test('not enough stock: refused, and no bill or payment is created', async () => {
      const h = headers(); const p = payments();
      const res = await call('post', '/api/sale/create-v3', sale([line(P, 1)]));
      assert.ok([400, 409].includes(res.status), `got ${res.status}`);
      assert.ok(Array.isArray(res.data.stockErrors) && res.data.stockErrors.length, 'stockErrors for the POS message');
      assert.strictEqual(headers(), h, 'no saleHeader row');
      assert.strictEqual(payments(), p, 'no salePayment row');
    });
    await test('5 tills buy the last unit at the same moment: exactly one sale, one card, no ghost bills', async () => {
      setFree(P2, LOC2, 1);
      const h = headers(); const p = payments();
      const results = await Promise.all(Array.from({ length: 5 }, () => call('post', '/api/sale/create-v3', sale([line(P2, 1)], LOC2))));
      const ok = results.filter((r) => r.status === 200);
      const refused = results.filter((r) => r.status === 400 || r.status === 409);
      assert.strictEqual(ok.length, 1, `successes: ${results.map((r) => r.status).join(',')}`);
      assert.strictEqual(refused.length, 4, `statuses: ${results.map((r) => r.status).join(',')}`);
      assert.strictEqual(headers(), h + 1, 'exactly one new bill');
      assert.strictEqual(payments(), p + 1, 'exactly one new payment');
      assert.strictEqual(n(`SELECT COUNT(*) FROM saleHeader WHERE id > 0 AND remark = 'sales-test' AND isActive = 0`), 0, 'no inactive ghost bills');
      assert.strictEqual(freeCount(P2, LOC2), 0);
      const id = Number(String(ok[0].data).split('-')[1]);
      assert.strictEqual(n(`SELECT COUNT(*) FROM card c JOIN saleLine l ON l.id = c.saleLineId WHERE l.headerId = ${id}`), 1);
    });
    await test('a failure while saving lines rolls everything back (no bill, no payment, stock untouched)', async () => {
      setFree(P, LOC, 2);
      const h = headers(); const p = payments();
      // second line is invalid (quantity is required), so the line insert fails after the stock was reserved
      const res = await call('post', '/api/sale/create-v3', sale([line(P, 1), line(P2, null, 5000, { validateStockOnSale: 0, total: 5000 })]));
      assert.strictEqual(res.status, 500, `got ${res.status} ${JSON.stringify(res.data)}`);
      assert.ok(res.data && res.data.message, 'the POS gets a message (before, it got no reply at all)');
      assert.strictEqual(headers(), h, 'no saleHeader row');
      assert.strictEqual(payments(), p, 'no salePayment row');
      assert.strictEqual(freeCount(), 2, 'reserved stock released by the rollback');
    });
    await test('the old POST /create endpoint saves the same way', async () => {
      const id = idFrom(await call('post', '/api/sale/create', sale([line(P, 1)])));
      assert.strictEqual(n(`SELECT COUNT(*) FROM card c JOIN saleLine l ON l.id = c.saleLineId WHERE l.headerId = ${id} AND c.card_isused = 1`), 1);
      assert.strictEqual(freeCount(), 1);
    });
    await test('an empty sale is refused without creating anything', async () => {
      const h = headers();
      const res = await call('post', '/api/sale/create-v3', sale([]));
      assert.strictEqual(res.status, 400);
      assert.strictEqual(headers(), h);
    });

    console.log('\nCancel');
    await test('cancel switches off header, lines and payments together and gives the stock back', async () => {
      const before = freeCount();
      const res = await call('put', `/api/sale/reverse/${firstSale}`, { isActive: false, remark: 'sales-test cancel', cancel_fee: 0, customerId: null }, CANCEL_USER);
      assert.strictEqual(res.status, 200, `got ${res.status} ${JSON.stringify(res.data)}`);
      assert.strictEqual(n(`SELECT isActive FROM saleHeader WHERE id = ${firstSale}`), 0);
      assert.strictEqual(n(`SELECT COUNT(*) FROM saleLine WHERE headerId = ${firstSale} AND isActive = 1`), 0);
      assert.strictEqual(n(`SELECT COUNT(*) FROM salePayment WHERE saleHeaderId = ${firstSale} AND isActive = 1`), 0);
      assert.strictEqual(freeCount(), before + 1);
    });

    console.log('\nAuto-cancel safety net (used by the two-step header-only / line-only flow)');
    await test('auto-cancel also switches off payments and lines and gives the stock back', async () => {
      const id = idFrom(await call('post', '/api/sale/create-v3', sale([line(P, 1)])));
      const before = freeCount();
      process.env.DCOMMERCE_DB_NAME = TEST_DB;
      const service = require('../../src/sales/service');
      await service.saleHeaderReversal(id, 'sales-test');
      assert.strictEqual(n(`SELECT isActive FROM saleHeader WHERE id = ${id}`), 0);
      assert.match(q(`SELECT remark FROM saleHeader WHERE id = ${id}`), /AUTO-CANCEL: sales-test/);
      assert.strictEqual(n(`SELECT COUNT(*) FROM salePayment WHERE saleHeaderId = ${id} AND isActive = 1`), 0, 'payments off');
      assert.strictEqual(n(`SELECT COUNT(*) FROM saleLine WHERE headerId = ${id} AND isActive = 1`), 0, 'lines off');
      assert.strictEqual(freeCount(), before + 1, 'stock given back');
    });
  } finally {
    child.kill();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 500); // the in-process model pool keeps the loop alive
};

main().catch((err) => { console.error(err); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
