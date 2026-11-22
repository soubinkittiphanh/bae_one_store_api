/**
 * Restaurant API tests: table reservations and promotions. LOCAL DATABASE ONLY.
 *
 *   npm run test:restaurant
 *
 * Rebuilds RESTAURANT_TEST_DB (default dcommerce_restaurant_test, must end in "_test") from the local
 * RESTAURANT_TEST_SOURCE_DB (default dcommerce_dev), starts the API on a free port against it (with model
 * sync, so new tables are created) and calls the HTTP endpoints. Nothing touches the source database.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const assert = require('assert');
const { execFileSync, spawn } = require('child_process');

const API_ROOT = path.resolve(__dirname, '../..');
const TEST_DB = process.env.RESTAURANT_TEST_DB || 'dcommerce_restaurant_test';
const SOURCE_DB = process.env.RESTAURANT_TEST_SOURCE_DB || 'dcommerce_dev';
const MYSQL_ARGS = process.env.RESTAURANT_TEST_MYSQL_ARGS || '';
const RUN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurant-test-'));
process.chdir(RUN_DIR); // the API logger writes a relative logs.log

if (!/^\w+_test$/.test(TEST_DB) || !/^\w+$/.test(SOURCE_DB)) throw new Error('RESTAURANT_TEST_DB must be a plain name ending in _test');

const sh = (cmd) => execFileSync('bash', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
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

const startApi = (port) => new Promise((resolve, reject) => {
  const env = { ...process.env, PORT: String(port), TZ: 'Asia/Vientiane', DCOMMERCE_DB_NAME: TEST_DB };
  delete env.NO_SYNC; // sync creates the new tableReservation table
  const child = spawn(process.execPath, [path.join(API_ROOT, 'src/index.js')], { cwd: RUN_DIR, env });
  let ready = false;
  let log = '';
  const timer = setTimeout(() => { if (!ready) { child.kill(); reject(new Error(`API did not start within 240s\n${log.slice(-2000)}`)); } }, 240000);
  const onData = (buf) => {
    log += buf.toString();
    if (!ready && /Database client is synchronized/.test(log)) { ready = true; clearTimeout(timer); resolve(child); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => { if (!ready) { clearTimeout(timer); reject(new Error(`API exited early (${code})\n${log.slice(-2000)}`)); } });
});

const main = async () => {
  const port = await freePort();
  process.env.DCOMMERCE_DB_NAME = TEST_DB;
  const target = require('../../src/loan/dbGuard').assertLocalDb('test:restaurant');
  if (target.database !== TEST_DB) throw new Error(`Config resolves to ${target.database}, expected ${TEST_DB}`);

  console.log(`\n[setup] rebuilding ${TEST_DB} from local ${SOURCE_DB}`);
  sh(`mariadb ${MYSQL_ARGS} -e "DROP DATABASE IF EXISTS \\\`${TEST_DB}\\\`; CREATE DATABASE \\\`${TEST_DB}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"`);
  sh(`set -o pipefail; mariadb-dump ${MYSQL_ARGS} --single-transaction ${SOURCE_DB} | mariadb ${MYSQL_ARGS} ${TEST_DB}`);
  const q = (sql) => sh(`mariadb ${MYSQL_ARGS} -N -B ${TEST_DB} -e ${JSON.stringify(sql)}`).trim();

  console.log('[setup] starting API (with model sync)');
  const child = await startApi(port);

  const axios = require('axios');
  const jwt = require('jsonwebtoken');
  const secret = require('../../src/config').actksecret;
  const userId = Number(q('SELECT id FROM user WHERE isActive = 1 ORDER BY id LIMIT 1')) || 1;
  const token = jwt.sign({ id: userId, cus_name: 'restaurant-test' }, secret, { expiresIn: '1h' });
  const call = (method, url, data, auth = true) => axios({
    method, url: `http://127.0.0.1:${port}${url}`, data, validateStatus: () => true,
    headers: auth ? { Authorization: `Bearer ${token}` } : {},
  });
  const expect = (res, status, label) => assert.strictEqual(res.status, status, `${label}: expected ${status}, got ${res.status} ${JSON.stringify(res.data && res.data.message)}`);

  try {
    // ---------- fixtures ----------
    const mkTable = async (number, capacity = 4) => {
      const res = await call('post', '/api/tables', { number, name: `Test ${number}`, capacity });
      expect(res, 201, `create table ${number}`);
      return res.data.data;
    };
    const t1 = await mkTable('9901', 4);
    const t2 = await mkTable('9902', 2);
    const at = (dayOffset, hh, mm = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      d.setHours(hh, mm, 0, 0);
      return d.toISOString();
    };
    const R = '/api/table-reservations';

    console.log('\nTable reservations');
    let r1;
    await test('create a booking with a table', async () => {
      const res = await call('post', R, { customerName: 'Noy', phone: '020 5555 1234', partySize: 4, reservedAt: at(1, 19), durationMinutes: 90, tableId: t1.id, notes: 'birthday' });
      expect(res, 201, 'create');
      r1 = res.data.data;
      assert.strictEqual(r1.status, 'booked');
      assert.strictEqual(r1.table.number, '9901');
    });
    await test('requires a name, a valid party size and a time', async () => {
      expect(await call('post', R, { partySize: 2, reservedAt: at(1, 12) }), 400, 'no name');
      expect(await call('post', R, { customerName: 'A', partySize: 0, reservedAt: at(1, 12) }), 400, 'party 0');
      expect(await call('post', R, { customerName: 'A', partySize: 2 }), 400, 'no time');
      expect(await call('post', R, { customerName: 'A', partySize: 2, reservedAt: at(-1, 12) }), 400, 'in the past');
    });
    await test('overlapping booking on the same table is refused (409)', async () => {
      const res = await call('post', R, { customerName: 'Kham', partySize: 2, reservedAt: at(1, 20), durationMinutes: 60, tableId: t1.id });
      expect(res, 409, 'overlap');
      assert.match(res.data.message, /Noy/);
    });
    await test('back-to-back booking right after the first one ends is accepted', async () => {
      expect(await call('post', R, { customerName: 'Kham', partySize: 2, reservedAt: at(1, 20, 30), durationMinutes: 60, tableId: t1.id }), 201, 'after');
    });
    await test('same time on another table is accepted', async () => {
      expect(await call('post', R, { customerName: 'Bee', partySize: 2, reservedAt: at(1, 19), tableId: t2.id }), 201, 'other table');
    });
    await test('list by day returns the bookings in time order with their table', async () => {
      const res = await call('get', `${R}?from=${encodeURIComponent(at(1, 0))}&to=${encodeURIComponent(at(2, 0))}`);
      expect(res, 200, 'list');
      const mine = res.data.data.filter((r) => ['Noy', 'Kham', 'Bee'].includes(r.customerName));
      assert.strictEqual(mine.length, 3);
      const times = mine.map((r) => new Date(r.reservedAt).getTime());
      assert.deepStrictEqual(times, times.slice().sort((a, b) => a - b));
      assert.ok(mine.every((r) => r.table && r.table.number));
    });
    await test('edit moves the time; moving onto a busy slot is refused', async () => {
      expect(await call('put', `${R}/${r1.id}`, { reservedAt: at(1, 18) }), 200, 'move earlier');
      const res = await call('put', `${R}/${r1.id}`, { reservedAt: at(1, 20, 45) });
      expect(res, 409, 'move onto Kham');
    });
    await test('confirm, then hold puts the table in status reserved', async () => {
      expect(await call('patch', `${R}/${r1.id}/status`, { status: 'confirmed' }), 200, 'confirm');
      const res = await call('patch', `${R}/${r1.id}/hold`, { hold: true });
      expect(res, 200, 'hold');
      assert.strictEqual(res.data.data.tableHeld, true);
      assert.strictEqual(q(`SELECT status FROM \`table\` WHERE id = ${t1.id}`), 'reserved');
      assert.strictEqual(q(`SELECT customerName FROM \`table\` WHERE id = ${t1.id}`), 'Noy');
    });
    await test('seat turns the held table occupied with the guest name and no order yet', async () => {
      const res = await call('patch', `${R}/${r1.id}/status`, { status: 'seated' });
      expect(res, 200, 'seat');
      assert.strictEqual(res.data.data.status, 'seated');
      assert.ok(res.data.data.seatedAt);
      assert.strictEqual(q(`SELECT status FROM \`table\` WHERE id = ${t1.id}`), 'occupied');
      assert.strictEqual(q(`SELECT IFNULL(currentOrderId, 'NULL') FROM \`table\` WHERE id = ${t1.id}`), 'NULL');
    });
    await test('a seated booking cannot be edited or seated again', async () => {
      expect(await call('put', `${R}/${r1.id}`, { partySize: 5 }), 400, 'edit seated');
      expect(await call('patch', `${R}/${r1.id}/status`, { status: 'seated' }), 400, 'seat twice');
    });
    await test('seating on a table that is occupied is refused', async () => {
      const b = await call('post', R, { customerName: 'Walk', partySize: 2, reservedAt: at(0, 23, 30), durationMinutes: 15, tableId: null });
      expect(b, 201, 'booking without table');
      const res = await call('patch', `${R}/${b.data.data.id}/status`, { status: 'seated', tableId: t1.id });
      expect(res, 409, 'occupied table');
      expect(await call('patch', `${R}/${b.data.data.id}/status`, { status: 'seated' }), 400, 'no table chosen');
    });
    await test('cancel gives a held table back', async () => {
      const b = await call('post', R, { customerName: 'Joy', partySize: 2, reservedAt: at(2, 12), tableId: t2.id });
      expect(b, 201, 'create');
      expect(await call('patch', `${R}/${b.data.data.id}/hold`, { hold: true }), 200, 'hold');
      assert.strictEqual(q(`SELECT status FROM \`table\` WHERE id = ${t2.id}`), 'reserved');
      const res = await call('patch', `${R}/${b.data.data.id}/status`, { status: 'cancelled', cancelReason: 'called to cancel' });
      expect(res, 200, 'cancel');
      assert.strictEqual(res.data.data.cancelReason, 'called to cancel');
      assert.strictEqual(q(`SELECT status FROM \`table\` WHERE id = ${t2.id}`), 'available');
    });
    await test('a cancelled slot can be booked again; re-opening the cancelled one is then refused', async () => {
      const cancelled = JSON.parse(JSON.stringify((await call('get', `${R}?status=cancelled`)).data.data.find((r) => r.customerName === 'Joy')));
      expect(await call('post', R, { customerName: 'New', partySize: 2, reservedAt: cancelled.reservedAt, tableId: t2.id }), 201, 'rebook');
      expect(await call('patch', `${R}/${cancelled.id}/status`, { status: 'booked' }), 409, 're-open');
    });
    await test('invalid status and unknown id', async () => {
      expect(await call('patch', `${R}/${r1.id}/status`, { status: 'eaten' }), 400, 'bad status');
      expect(await call('get', `${R}/99999999`), 404, 'unknown');
    });
    await test('requires login', async () => {
      expect(await call('get', R, undefined, false), 401, 'no token');
    });

    // ---------- promotions ----------
    console.log('\nPromotions');
    const P = '/api/promotions';
    const base = { name: 'Test 10%', code: 'TEST10', type: 'percentage', start_date: at(-1, 0), end_date: at(30, 0), priority: 1, conditions: { discount_percentage: 10 } };
    let p1;
    await test('create, with the code upper-cased and unknown fields dropped', async () => {
      const res = await call('post', P, { ...base, code: 'test10', current_uses: 999, id: 12345 });
      expect(res, 201, 'create');
      p1 = res.data.data;
      assert.strictEqual(p1.code, 'TEST10');
      assert.strictEqual(p1.current_uses, 0);
      assert.notStrictEqual(p1.id, 12345);
    });
    await test('duplicate code gives 409 with a message', async () => {
      expect(await call('post', P, base), 409, 'duplicate');
    });
    await test('validation: end before start, bad percentage, buy-x-get-y without quantities, combo without items', async () => {
      expect(await call('post', P, { ...base, code: 'X1', end_date: at(-2, 0) }), 400, 'end before start');
      expect(await call('post', P, { ...base, code: 'X2', conditions: { discount_percentage: 150 } }), 400, '150%');
      expect(await call('post', P, { ...base, code: 'X3', type: 'buy_x_get_y', conditions: {} }), 400, 'bxgy');
      expect(await call('post', P, { ...base, code: 'X4', type: 'combo_deal', conditions: { combo_price: 10 } }), 400, 'combo');
    });
    await test('list returns every promotion (not only 10) with usage', async () => {
      for (let i = 0; i < 11; i++) {
        expect(await call('post', P, { ...base, code: `BULK${i}`, name: `Bulk ${i}` }), 201, `bulk ${i}`);
      }
      const res = await call('get', P);
      expect(res, 200, 'list');
      assert.ok(res.data.data.length >= 12, `got ${res.data.data.length}`);
      assert.ok(res.data.data.every((p) => typeof p.current_uses === 'number'));
    });
    await test('/active works (it crashed before: sequelize was not imported) and needs no login', async () => {
      const res = await call('get', `${P}/active`, undefined, false);
      expect(res, 200, 'active');
      assert.ok(res.data.data.some((p) => p.code === 'TEST10'));
    });
    await test('/calculate works (it crashed before: unbound this)', async () => {
      const res = await call('post', `${P}/calculate`, { ticketLines: [{ key: 'a', productId: 1, unitPrice: 50000, quantity: 2 }] }, false);
      expect(res, 200, 'calculate');
      assert.ok(res.data.total > 0);
    });
    await test('partial update (toggle active) keeps the rest', async () => {
      const res = await call('put', `${P}/${p1.id}`, { is_active: false });
      expect(res, 200, 'toggle');
      assert.strictEqual(res.data.data.is_active, false);
      assert.strictEqual(res.data.data.conditions.discount_percentage, 10);
      const active = await call('get', `${P}/active`, undefined, false);
      assert.ok(!active.data.data.some((p) => p.code === 'TEST10'));
    });
    await test('usage is counted from bills; a used promotion cannot be deleted; an unused one can', async () => {
      const ticketId = Number(q('SELECT id FROM ticket WHERE status NOT IN (\'cancel\',\'void\') ORDER BY id LIMIT 1'));
      assert.ok(ticketId, 'needs one ticket in the source database');
      q(`UPDATE ticketLine SET promotionId = ${p1.id}, is_promotion_item = 1, discount_amount = 1500 WHERE id = (SELECT id FROM (SELECT id FROM ticketLine WHERE ticketId = ${ticketId} ORDER BY id LIMIT 1) x)`);
      const listed = (await call('get', P)).data.data.find((p) => p.id === p1.id);
      assert.strictEqual(listed.current_uses, 1);
      assert.strictEqual(Number(listed.total_discount), 1500);
      expect(await call('delete', `${P}/${p1.id}`), 409, 'used');
      const unused = (await call('get', P)).data.data.find((p) => p.code === 'BULK0');
      expect(await call('delete', `${P}/${unused.id}`), 200, 'unused');
    });
    await test('max uses reached: no longer active', async () => {
      const res = await call('put', `${P}/${p1.id}`, { is_active: true, max_uses: 1 });
      expect(res, 200, 'set max');
      const active = await call('get', `${P}/active`, undefined, false);
      assert.ok(!active.data.data.some((p) => p.code === 'TEST10'));
    });
    await test('POST /apply is gone', async () => {
      assert.ok([401, 404].includes((await call('post', `${P}/apply`, {}, false)).status));
    });
  } finally {
    child.kill();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
};

main().catch((err) => { console.error(err); process.exitCode = 1; });
