/**
 * Shared setup for the raw-material HTTP tests. LOCAL DATABASE ONLY.
 *
 * Rebuilds a `_test` database from RAW_TEST_SOURCE_DB (default dcommerce_dev) with the mariadb CLIs,
 * starts src/index.js on a free port against it (startup runs sync + POS migrations) and returns helpers.
 * Needs DCOMMERCE_DB_HOST / _USER / _PASSWORD for the API; RAW_TEST_MYSQL_ARGS adds mariadb CLI arguments;
 * RAW_TEST_API_LOG=<file> keeps the API's output.
 */
const path = require('path');
const net = require('net');
const assert = require('assert');
const { execSync, spawn } = require('child_process');

const API_ROOT = path.resolve(__dirname, '../..');
const SOURCE_DB = process.env.RAW_TEST_SOURCE_DB || 'dcommerce_dev';
const CLI = `mariadb ${process.env.RAW_TEST_MYSQL_ARGS || ''}`;

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

const startApi = (port, testDb, extraEnv) => new Promise((resolve, reject) => {
  const env = { ...process.env, PORT: String(port), TZ: 'Asia/Vientiane', DCOMMERCE_DB_NAME: testDb, ...extraEnv };
  delete env.NO_SYNC;
  const child = spawn(process.execPath, [path.join(API_ROOT, 'src/index.js')], { cwd: API_ROOT, env });
  let ready = false;
  let log = '';
  const limitMs = Number(process.env.RAW_TEST_START_TIMEOUT_MS || 240000);
  const timer = setTimeout(() => { if (!ready) { child.kill(); reject(new Error(`API did not start within ${limitMs / 1000}s\n${log.slice(-2000)}`)); } }, limitMs);
  const onData = (buf) => {
    log += buf.toString();
    if (process.env.RAW_TEST_API_LOG) require('fs').appendFileSync(process.env.RAW_TEST_API_LOG, buf);
    if (!ready && /Database client is synchronized/.test(log)) { ready = true; clearTimeout(timer); resolve(child); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => { if (!ready) { clearTimeout(timer); reject(new Error(`API exited early (${code})\n${log.slice(-2000)}`)); } });
});

const setup = async (testDb, extraEnv = {}, { rebuild = true, port: fixedPort } = {}) => {
  if (!testDb.endsWith('_test')) throw new Error(`test database must end in _test (got ${testDb})`);
  const port = fixedPort || await freePort();
  process.env.PORT = String(port); // the JWT secret includes PORT (src/config/env.js)
  process.env.DCOMMERCE_DB_NAME = testDb;
  const target = require('../../src/loan/dbGuard').assertLocalDb('test:raw-material');
  if (target.database !== testDb) throw new Error(`Config resolves to ${target.database}, expected ${testDb}`);

  if (rebuild) {
  console.log(`\n[setup] rebuilding ${testDb} from local ${SOURCE_DB}`);
  execSync(`${CLI} -e "DROP DATABASE IF EXISTS \\\`${testDb}\\\`; CREATE DATABASE \\\`${testDb}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"`, { shell: '/bin/bash' });
  execSync(`set -o pipefail; mariadb-dump ${process.env.RAW_TEST_MYSQL_ARGS || ''} --single-transaction ${SOURCE_DB} | ${CLI} ${testDb}`, { shell: '/bin/bash' });
  }

  // SQL goes through stdin, so backticks and quotes never reach a shell
  const sql = query => execSync(`${CLI} -N -B ${testDb}`, { input: query, encoding: 'utf8' }).trim();

  console.log('[setup] starting API (startup runs sync + POS migrations)');
  const child = await startApi(port, testDb, extraEnv);

  const axios = require('axios');
  const jwt = require('jsonwebtoken');
  const secret = require('../../src/config').actksecret;
  const tokenFor = userId => jwt.sign({ id: userId, cus_name: `raw-material-test-${userId}` }, secret, { expiresIn: '1h' });
  const call = (method, url, data, userIdOrFalse) => axios({
    method, url: `http://127.0.0.1:${port}${url}`, data, validateStatus: () => true,
    headers: userIdOrFalse === false ? {} : { Authorization: `Bearer ${tokenFor(userIdOrFalse)}` }
  });

  return { port, sql, call, tokenFor, stop: () => child.kill() };
};

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok    ${name}`); } catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`); }
};
const results = () => ({ passed, failed });
const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(Number(a) - Number(b)) < eps, `${a} != ${b}`);
const expectStatus = (res, status, label) =>
  assert.strictEqual(res.status, status, `${label}: expected ${status}, got ${res.status} ${JSON.stringify(res.data).slice(0, 400)}`);

module.exports = { setup, startApi, test, results, close, expectStatus };
