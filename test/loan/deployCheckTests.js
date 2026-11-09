/**
 * T1: loan_deploy_check.js, run from run.js. Uses its own throwaway database <test db>_t1_test, cloned from the
 * same local source, so --pre can see a POS database with no loan tables and the mutations touch nothing else.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

module.exports = async ({ test, sh, MYSQL_ARGS, SOURCE_DB, TEST_DB, API_ROOT, RUN_DIR, baseUrl }) => {
  const check = require('../../loan_deploy_check');
  const cfg = require('../../src/config/env').db;
  const T1_DB = `${TEST_DB}_t1_test`;
  if (!/^\w+_test$/.test(T1_DB)) throw new Error('T1 database must be a *_test database');

  const goodDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loan-t1-docs-'));
  fs.chmodSync(goodDir, 0o700);
  const env = (extra = {}) => ({ ...process.env, DCOMMERCE_DB_NAME: T1_DB, LOAN_DOCUMENT_DIR: goodDir, NO_SYNC: 'true', ...extra });
  const tool = (args, extra) => {
    const r = spawnSync(process.execPath, [path.join(API_ROOT, 'loan_deploy_check.js'), ...args], { cwd: RUN_DIR, env: env(extra), encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
  };
  const json = (args, extra) => {
    const r = tool([...args, '--json'], extra);
    return { ...r, data: JSON.parse(r.out) };
  };
  const statusOf = (data, id) => data.rows.filter(x => x.id === id).map(x => x.status);
  const fails = data => data.rows.filter(x => x.status === 'FAIL').map(x => `${x.id} ${x.detail}`);
  const sql = s => sh(`mariadb ${MYSQL_ARGS} ${T1_DB} -e ${JSON.stringify(s).replace(/`/g, '\\`')}`);
  const node = (script, args = []) => spawnSync(process.execPath, [path.join(API_ROOT, script), ...args], { cwd: RUN_DIR, env: env(), encoding: 'utf8' });

  await test('T1 setup: a clean POS clone with no loan tables', async () => {
    sh(`mariadb ${MYSQL_ARGS} -e "DROP DATABASE IF EXISTS \\\`${T1_DB}\\\`; CREATE DATABASE \\\`${T1_DB}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"`);
    sh(`set -o pipefail; mariadb-dump ${MYSQL_ARGS} --single-transaction ${SOURCE_DB} | mariadb ${MYSQL_ARGS} ${T1_DB}`);
    if (cfg.user !== 'root') {
      for (const host of ['localhost', '127.0.0.1']) {
        try { sh(`mariadb ${MYSQL_ARGS} -e "GRANT ALL PRIVILEGES ON \\\`${T1_DB}\\\`.* TO '${cfg.user}'@'${host}'"`); } catch (e) { /* user may not exist for this host */ }
      }
    }
  });

  await test('T1 unit: version rules; document folder rules (unset, relative, inside the app, under uploads, missing, wide open, good); only one SELECT or SHOW is let through', async () => {
    assert.strictEqual(check.versionVerdict('12.0.2-MariaDB').status, 'pass');
    assert.strictEqual(check.versionVerdict('10.3.0-MariaDB').status, 'pass');
    assert.strictEqual(check.versionVerdict('10.2.44-MariaDB').status, 'fail');
    assert.strictEqual(check.versionVerdict('8.0.36').status, 'fail', 'MySQL is not rehearsed');

    const verdict = dir => check.documentDirVerdict(dir, API_ROOT).status;
    assert.strictEqual(verdict(undefined), 'fail');
    assert.strictEqual(verdict('private/loan-documents'), 'fail');
    assert.strictEqual(verdict(path.join(API_ROOT, 'private', 'loan-documents')), 'fail');
    assert.strictEqual(verdict(API_ROOT), 'fail');
    assert.strictEqual(verdict(path.join(goodDir, 'uploads', 'x')), 'fail');
    assert.strictEqual(verdict(path.join(goodDir, 'missing')), 'fail');
    assert.ok(!fs.existsSync(path.join(goodDir, 'missing')), 'the check does not create the folder');
    assert.strictEqual(verdict(goodDir), 'pass');
    assert.deepStrictEqual(fs.readdirSync(goodDir), [], 'the check leaves no test file');
    const open = fs.mkdtempSync(path.join(os.tmpdir(), 'loan-t1-open-'));
    fs.chmodSync(open, 0o755);
    assert.strictEqual(verdict(open), 'warn');
    const file = path.join(open, 'file');
    fs.writeFileSync(file, 'x');
    assert.strictEqual(verdict(file), 'fail', 'a file is not a folder');
    const link = path.join(goodDir, '..', `loan-t1-link-${process.pid}`);
    fs.symlinkSync(API_ROOT, link);
    assert.strictEqual(verdict(link), 'fail', 'a symlink into the app folder is refused');
    fs.unlinkSync(link);
    fs.rmSync(open, { recursive: true });

    for (const ok of ['SELECT 1', ' show tables', 'SELECT 1;']) check.assertReadStatement(ok);
    for (const bad of ['UPDATE SPF SET value = 1', 'DROP TABLE x', 'SELECT 1; DROP TABLE x', 'INSERT INTO x VALUES (1)', 'DELETE FROM x', 'ALTER TABLE x', 'SET @a = 1', 'WITH a AS (SELECT 1) DELETE FROM x']) {
      assert.throws(() => check.assertReadStatement(bad), /Refused/, bad);
    }
  });

  await test('T1 the session cannot write even past the statement filter: the server refuses it', async () => {
    const { conn, q, close } = await check.openSession(cfg, T1_DB);
    try {
      await assert.rejects(() => conn.query("UPDATE SPF SET value = value WHERE code = 'USE_BUSINESS_DATE'"), /READ ONLY/i);
      await assert.rejects(() => conn.query('CREATE TABLE t1_should_not_exist (id INT)'), /READ ONLY/i);
      assert.strictEqual(Number((await q("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 't1_should_not_exist'"))[0].n), 0);
    } finally {
      await close();
    }
  });

  await test('T1 schema compare: POS columns may differ as the runbook allows; everything else counts', async () => {
    const base = () => ({
      tables: [{ table: 'ln_a', engine: 'InnoDB', collation: 'x' }],
      columns: [
        { table: 'ln_a', column: 'id', type: 'int(11)', nullable: 'NO', default: '<null>', collation: '<null>', key: 'PRI', extra: 'auto_increment' },
        { table: 'transactionEntry', column: 'transactionType', type: "enum('A','LOAN_IN','LOAN_OUT')", nullable: 'NO', default: '<null>', collation: 'p', key: '', extra: '' },
        { table: 'chart_of_account', column: 'accountType', type: "enum('Asset','Off-Balance')", nullable: 'NO', default: '<null>', collation: 'p', key: '', extra: '' }
      ],
      indexes: [{ table: 'ln_a', index: 'PRIMARY', nonUnique: '0', columns: 'id' }],
      foreignKeys: []
    });
    const change = (fn) => { const a = base(); fn(a); return check.compareSchema(base(), a); };
    assert.deepStrictEqual(change(() => {}), []);
    assert.deepStrictEqual(change((a) => { a.columns[1].type = "enum('A','CUSTOM','LOAN_IN','LOAN_OUT')"; a.columns[1].collation = 'q'; a.columns[1].default = 'A'; a.columns[2].type = "enum('Asset','Off-Balance','Mine')"; }), [], 'customer values and collation on POS columns');
    assert.match(change((a) => { a.columns[1].type = "enum('A','LOAN_OUT','LOAN_IN')"; })[0], /must end with LOAN_IN, LOAN_OUT/);
    assert.match(change((a) => { a.columns[2].type = "enum('Asset')"; })[0], /Off-Balance/);
    assert.match(change((a) => { a.columns.splice(1, 1); })[0], /missing column: transactionEntry/);
    assert.deepStrictEqual(change((a) => { a.tables[0].collation = 'y'; }), ['table ln_a: collation is y, expected x']);
    assert.deepStrictEqual(change((a) => { a.columns[0].extra = ''; }), ['column ln_a.id: extra is , expected auto_increment']);
    assert.deepStrictEqual(change((a) => { a.indexes[0].columns = 'id,x'; }), ['index ln_a.PRIMARY: columns is id,x, expected id']);
    assert.deepStrictEqual(change((a) => { a.foreignKeys.push({ table: 'ln_a', constraint: 'fk', references: 'b' }); }), ['extra foreign key: ln_a.fk']);
    assert.strictEqual(check.normalizeDefault('NULL'), '<null>');
    assert.strictEqual(check.normalizeDefault('CURRENT_TIMESTAMP'), 'current_timestamp()');
  });

  await test('T1 --pre on a clean POS database: no FAIL; ln_ tables 0; bad document folder fails; without NO_SYNC warns', async () => {
    const r = json(['--pre']);
    assert.deepStrictEqual(fails(r.data), []);
    assert.strictEqual(r.code, 0);
    assert.deepStrictEqual(statusOf(r.data, 'P3'), ['PASS']);
    assert.deepStrictEqual(statusOf(r.data, 'P9'), ['PASS']);
    assert.deepStrictEqual(statusOf(r.data, 'P11'), ['MANUAL']);
    const bad = json(['--pre'], { LOAN_DOCUMENT_DIR: '' });
    assert.strictEqual(bad.code, 1);
    assert.deepStrictEqual(statusOf(bad.data, 'P9'), ['FAIL']);
    const noSync = json(['--pre'], { NO_SYNC: '' });
    assert.deepStrictEqual(statusOf(noSync.data, 'P12'), ['WARN']);
    assert.strictEqual(noSync.code, 0);
  });

  await test('T1 --schema before the migrations reports all 79 tables missing', async () => {
    const r = json(['--schema']);
    assert.strictEqual(r.code, 1);
    assert.strictEqual(r.data.rows.filter(x => /^missing table:/.test(x.detail)).length, 79);
  });

  await test('T1 after loan_migrate up: --schema shows 0 differences against the committed reference; --pre now stops on existing tables', async () => {
    const migrate = node('loan_migrate.js', ['up']);
    assert.strictEqual(migrate.status, 0, migrate.stderr);
    const r = json(['--schema']);
    assert.deepStrictEqual(fails(r.data), []);
    assert.strictEqual(r.code, 0);
    const pre = json(['--pre']);
    assert.strictEqual(pre.code, 1);
    assert.match(pre.data.rows.find(x => x.id === 'P3').detail, /STOP/);
  });

  await test('T1 --post before the seeds fails with the reason', async () => {
    const r = json(['--post']);
    assert.strictEqual(r.code, 1);
    assert.deepStrictEqual(statusOf(r.data, 'C5'), ['FAIL']);
    assert.match(r.data.rows.find(x => x.id === 'C5').detail, /seeds/);
  });

  await test('T1 --post after the eight seeds passes; each switch turned on fails; --url checks 401 and refuses anything else', async () => {
    for (const seed of ['seed_loan_phase2a_data.js', 'seed_loan_phase2b_accounting.js', 'seed_loan_phase3.js', 'seed_loan_phase4.js', 'seed_loan_phase5.js', 'seed_loan_phase5b.js', 'seed_loan_phase6.js', 'seed_loan_menus.js']) {
      const s = node(seed);
      assert.strictEqual(s.status, 0, `${seed}: ${s.stderr}`);
    }
    const r = json(['--post', `--url=${baseUrl}`]);
    assert.deepStrictEqual(fails(r.data), []);
    assert.strictEqual(r.code, 0);
    assert.deepStrictEqual(statusOf(r.data, 'C1'), ['PASS']);
    assert.deepStrictEqual(statusOf(r.data, 'C11'), ['PASS']);
    assert.deepStrictEqual(statusOf(r.data, 'C12'), ['MANUAL']);
    const pairs = r.data.rows.find(x => x.id === 'C9');
    console.log(`        fresh seed, C9: ${pairs.status} ${pairs.detail}`);

    for (const [code, on, off] of [['LOAN_POSTING_ENABLED', 'true', 'false'], ['BS_INCLUDE_LOAN_BOOK', 'true', 'false'], ['LOAN_FX_REVAL_ENABLED', 'true', 'false'], ['LOAN_ALLOW_SELF_AUTHORIZE', 'true', 'false'], ['LOAN_MAX_BACKDATE_DAYS', '5', '0']]) {
      sql(`UPDATE SPF SET value = '${on}' WHERE code = '${code}'`);
      const bad = json(['--post']);
      sql(`UPDATE SPF SET value = '${off}' WHERE code = '${code}'`);
      assert.strictEqual(bad.code, 1, code);
      assert.ok(fails(bad.data).some(f => f.includes(`${code} is ${on}, expected ${off}`)), `${code}: ${fails(bad.data)}`);
    }

    const stub = http.createServer((req, res) => { res.statusCode = 200; res.end('{}'); });
    await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
    const open = json(['--post', `--url=http://127.0.0.1:${stub.address().port}`]);
    await new Promise(resolve => stub.close(resolve));
    assert.strictEqual(open.code, 1, 'a loan route answering without a token is a FAIL');
    assert.deepStrictEqual(statusOf(open.data, 'C11'), ['FAIL']);
  });

  await test('T1 every mode changes nothing: row counts and checksums of all tables are identical afterwards; no logs.log or other file appears in the working folder', async () => {
    const state = () => {
      const tables = sh(`mariadb ${MYSQL_ARGS} -N ${T1_DB} -e "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY 1"`).trim().split('\n');
      const quoted = tables.map(t => `\\\`${t}\\\``).join(', ');
      return sh(`mariadb ${MYSQL_ARGS} -N ${T1_DB} -e "CHECKSUM TABLE ${quoted} EXTENDED"`);
    };
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'loan-t1-cwd-'));
    const refBefore = fs.readFileSync(path.join(API_ROOT, 'loan_schema_reference.json'), 'utf8');
    const before = state();
    for (const mode of ['--pre', '--schema', '--post']) spawnSync(process.execPath, [path.join(API_ROOT, 'loan_deploy_check.js'), mode], { cwd: folder, env: env(), encoding: 'utf8' });
    assert.strictEqual(state(), before);
    assert.deepStrictEqual(fs.readdirSync(folder), []);
    assert.strictEqual(fs.readFileSync(path.join(API_ROOT, 'loan_schema_reference.json'), 'utf8'), refBefore);
    fs.rmSync(folder, { recursive: true });
  });

  await test('T1 --schema catches a missing table, an extra table, a changed type, an extra column, a dropped index and a wrong collation, each by name', async () => {
    sql('DROP TABLE ln_print_template');
    sql('CREATE TABLE ln_t1_extra (id INT)');
    sql("ALTER TABLE ln_exchange_rate MODIFY source VARCHAR(7) NOT NULL DEFAULT 'MANUAL'");
    sql('ALTER TABLE ln_product ADD COLUMN t1_extra INT NULL');
    sql('ALTER TABLE ln_account DROP INDEX accountNo');
    sql('ALTER TABLE ln_audit_log COLLATE utf8mb4_bin');
    const r = json(['--schema']);
    assert.strictEqual(r.code, 1);
    const details = r.data.rows.map(x => x.detail).join('\n');
    for (const expected of [/missing table: ln_print_template/, /extra table: ln_t1_extra/, /column ln_exchange_rate\.source: type is varchar\(7\)/, /extra column: ln_product\.t1_extra/, /missing index: ln_account\.accountNo/, /table ln_audit_log: collation is utf8mb4_bin/]) {
      assert.match(details, expected);
    }
  });

  await test('T1 a wrong password, a non-local host and unknown arguments stop with exit 2 and print no credentials; --write-reference refuses a confirmed remote', async () => {
    const secret = `t1-wrong-${process.pid}-pw`;
    const wrong = tool(['--schema'], { DCOMMERCE_DB_PASSWORD: secret });
    assert.strictEqual(wrong.code, 2, wrong.all);
    assert.ok(!wrong.all.includes(secret));
    if (cfg.password) assert.ok(!wrong.all.includes(cfg.password));
    const ok = tool(['--post']);
    if (cfg.password) assert.ok(!ok.all.includes(cfg.password), 'a normal run prints no password either');

    // 192.0.2.1 is the reserved documentation range: the guard must refuse before any connection is tried
    const remote = tool(['--schema'], { DCOMMERCE_DB_HOST: '192.0.2.1' });
    assert.strictEqual(remote.code, 2);
    assert.match(remote.err, /Refusing to run against non-local host/);
    const confirmed = tool(['--write-reference'], { DCOMMERCE_DB_HOST: '192.0.2.1', ALLOW_REMOTE: '1', CONFIRM_DB: T1_DB });
    assert.strictEqual(confirmed.code, 2);
    assert.match(confirmed.err, /needs a local database/);
    assert.strictEqual(tool(['--nope']).code, 2);
    assert.strictEqual(tool([]).code, 2);
    assert.strictEqual(tool(['--pre', '--post']).code, 2);
  });

  await test('T1 cleanup: throwaway database dropped', async () => {
    sh(`mariadb ${MYSQL_ARGS} -e "DROP DATABASE IF EXISTS \\\`${T1_DB}\\\`"`);
    fs.rmSync(goodDir, { recursive: true, force: true });
  });
};
