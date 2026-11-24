/**
 * Duplicate UNIQUE index repair at server start (src/posMigrations/indexHygiene.js). LOCAL DATABASE ONLY.
 *
 *   DCOMMERCE_DB_HOST=127.0.0.1 DCOMMERCE_DB_USER=<user> DCOMMERCE_DB_PASSWORD=<pw> node test/indexHygiene/run.js
 *
 * Copies dcommerce_dev, starts the API twice on the copy and checks: duplicates gone after the first start,
 * none added by the second, uniqueness still enforced, tables that were at the 64-index limit alter again.
 */
const assert = require('assert');
const { setup, test, results } = require('../rawMaterial/harness');

const TEST_DB = process.env.INDEX_TEST_DB || 'dcommerce_index_test';

const DUPLICATES = `SELECT COALESCE(SUM(n - 1), 0) FROM (
  SELECT COUNT(*) n FROM (
    SELECT TABLE_NAME t, INDEX_NAME i, INDEX_TYPE ty, GROUP_CONCAT(COLUMN_NAME, ':', COALESCE(SUB_PART, '') ORDER BY SEQ_IN_INDEX) c
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
     GROUP BY TABLE_NAME, INDEX_NAME, INDEX_TYPE) x
  GROUP BY t, ty, c HAVING COUNT(*) > 1) y`;
const UNIQUE_COLUMNS = `SELECT COUNT(DISTINCT TABLE_NAME, COLUMN_NAME) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'`;
const indexCount = t => `SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${t}'`;

const main = async () => {
  // Measure the copy before any server start
  const { execSync } = require('child_process');
  const cli = `mariadb ${process.env.RAW_TEST_MYSQL_ARGS || ''}`;
  execSync(`${cli} -e "DROP DATABASE IF EXISTS ${TEST_DB}; CREATE DATABASE ${TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"`);
  execSync(`set -o pipefail; mariadb-dump --single-transaction dcommerce_dev | ${cli} ${TEST_DB}`, { shell: '/bin/bash' });
  const sql = q => execSync(`${cli} -N -B ${TEST_DB}`, { input: q, encoding: 'utf8' }).trim();
  const before = { dup: Number(sql(DUPLICATES)), uniqueCols: Number(sql(UNIQUE_COLUMNS)), spf: Number(sql(indexCount('SPF'))) };
  console.log(`[before] duplicate unique indexes: ${before.dup}, unique columns: ${before.uniqueCols}, SPF indexes: ${before.spf}`);

  const first = await setup(TEST_DB, {}, { rebuild: false });
  const afterFirst = { dup: Number(sql(DUPLICATES)), uniqueCols: Number(sql(UNIQUE_COLUMNS)), spf: Number(sql(indexCount('SPF'))), ticket: Number(sql(indexCount('ticket'))) };
  first.stop();
  await new Promise(r => setTimeout(r, 1500));
  const second = await setup(TEST_DB, {}, { rebuild: false, port: first.port });
  const afterSecond = { dup: Number(sql(DUPLICATES)), spf: Number(sql(indexCount('SPF'))), ticket: Number(sql(indexCount('ticket'))) };

  try {
    await test('the copy had duplicates to repair', () => assert.ok(before.dup > 100, `only ${before.dup}`));
    await test('first start removes every duplicate', () => assert.strictEqual(afterFirst.dup, 0));
    await test('no unique column lost its index', () => assert.ok(afterFirst.uniqueCols >= before.uniqueCols, `${afterFirst.uniqueCols} < ${before.uniqueCols}`));
    await test('SPF is far below the 64-index limit', () => assert.ok(afterFirst.spf < 10, `SPF has ${afterFirst.spf}`));
    await test('second start adds no index', () => {
      assert.strictEqual(afterSecond.dup, 0);
      assert.strictEqual(afterSecond.spf, afterFirst.spf);
      assert.strictEqual(afterSecond.ticket, afterFirst.ticket);
    });
    await test('uniqueness is still enforced (ticket.ticketNumber, product.pro_id)', () => {
      assert.throws(() => sql(`INSERT INTO ticket (ticketNumber, createdAt, updateTimestamp)
        SELECT ticketNumber, NOW(), NOW() FROM ticket WHERE ticketNumber IS NOT NULL LIMIT 1`), /Duplicate entry/);
      assert.throws(() => sql(`INSERT INTO product (pro_id, pro_name, createdAt, updateTimestamp)
        SELECT pro_id, 'dup', NOW(), NOW() FROM product LIMIT 1`), /Duplicate entry/);
    });
    await test('the API still answers', async () => {
      const r = await second.call('get', '/api/unit/find', null, 1);
      assert.strictEqual(r.status, 200);
    });
  } finally {
    second.stop();
  }
  const { passed, failed } = results();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch(err => { console.error(err); process.exit(1); });
