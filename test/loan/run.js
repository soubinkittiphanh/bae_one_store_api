/**
 * Loan module integration tests (Phase 2A and 2B). LOCAL DATABASE ONLY.
 *
 *   DB_HOST=127.0.0.1 DB_USER=<user> DB_PASSWORD=<pw> npm run test:loan
 *
 * Environment:
 *   LOAN_TEST_DB          test database, rebuilt on every run; must end in "_test" (default dcommerce_loan_test)
 *   LOAN_TEST_SOURCE_DB   local database copied into the test database (default dcommerce_dev)
 *   LOAN_TEST_MYSQL_ARGS  extra arguments for the mariadb / mariadb-dump CLIs used to rebuild the
 *                         test database (default: none, i.e. OS socket authentication)
 *
 * Steps: rebuild test DB -> migrate down/up round trip -> 2A and 2B seeds twice -> model/DB parity ->
 * accounting validators on the worked examples -> start the API from a temp working directory ->
 * HTTP and service tests -> stop the API.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const assert = require('assert');
const { execFileSync, spawn } = require('child_process');

const API_ROOT = path.resolve(__dirname, '../..');
const TEST_DB = process.env.LOAN_TEST_DB || 'dcommerce_loan_test';
const SOURCE_DB = process.env.LOAN_TEST_SOURCE_DB || 'dcommerce_dev';
const MYSQL_ARGS = process.env.LOAN_TEST_MYSQL_ARGS || '';
const RUN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'loan-test-'));
// src/api/logger.js writes a relative logs.log; keep it (and the API's) out of the repository
process.chdir(RUN_DIR);

if (!/_test$/.test(TEST_DB)) throw new Error(`LOAN_TEST_DB must end in "_test" (got ${TEST_DB})`);
if (!/^\w+$/.test(TEST_DB) || !/^\w+$/.test(SOURCE_DB)) throw new Error('Database names must be plain identifiers');

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

const sh = (cmd) => execFileSync('bash', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// ----------------------------------------------------------------------------- tiny harness

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`);
  }
};

const main = async () => {
  const port = await freePort();
  // Must be set before src/config is loaded: the JWT secret and the DB target depend on them
  process.env.PORT = String(port);
  process.env.DB_NAME = TEST_DB;
  process.env.NO_SYNC = 'true';

  const target = require('../../src/loan/dbGuard').assertLocalDb('test:loan');
  if (target.database !== TEST_DB) throw new Error(`Config resolves to ${target.database}, expected ${TEST_DB}`);

  console.log(`\n[setup] rebuilding ${TEST_DB} from local ${SOURCE_DB}`);
  sh(`mariadb ${MYSQL_ARGS} -e "DROP DATABASE IF EXISTS \\\`${TEST_DB}\\\`; CREATE DATABASE \\\`${TEST_DB}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"`);
  sh(`set -o pipefail; mariadb-dump ${MYSQL_ARGS} --single-transaction ${SOURCE_DB} | mariadb ${MYSQL_ARGS} ${TEST_DB}`);
  const dbUser = require('../../src/config/env').db.user;
  if (dbUser !== 'root') {
    for (const host of ['localhost', '127.0.0.1']) {
      try { sh(`mariadb ${MYSQL_ARGS} -e "GRANT ALL PRIVILEGES ON \\\`${TEST_DB}\\\`.* TO '${dbUser}'@'${host}'"`); } catch (e) { /* user may not exist for this host */ }
    }
  }

  const childEnv = { ...process.env };
  const runNode = (script, args = []) => execFileSync(process.execPath, [path.join(API_ROOT, script), ...args], { cwd: RUN_DIR, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

  const mariadb = require('mariadb');
  const cfg = require('../../src/config/env').db;
  const conn = await mariadb.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: TEST_DB });
  const q = async (sql, params) => conn.query(sql, params);
  const snapshot = async () => {
    const cols = await q("SELECT table_name, column_name, column_type, is_nullable, IFNULL(column_default,'-') d, column_comment FROM information_schema.columns WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name LIKE 'sec\\_%' OR table_name = 'chart_of_account') ORDER BY 1, 2");
    const idx = await q("SELECT table_name, index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) c FROM information_schema.statistics WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name LIKE 'sec\\_%') GROUP BY 1, 2, 3 ORDER BY 1, 2");
    return JSON.stringify([cols, idx], (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  };
  const tableCounts = async () => {
    const tables = await q("SELECT table_name t FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name LIKE 'sec\\_%') ORDER BY 1");
    const out = {};
    for (const { t } of tables) out[t] = Number((await q(`SELECT COUNT(*) n FROM \`${t}\``))[0].n);
    return out;
  };

  console.log('\n[migrations & seed]');
  await test('migrate up on a clean copy', async () => {
    runNode('loan_migrate.js', ['up']);
    const n = Number((await q("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'ln\\_%'"))[0].n);
    assert.strictEqual(n, 69, `expected 69 ln_* tables, found ${n}`);
  });
  await test('2B and corrections DOWN, then UP, restore the schema exactly', async () => {
    const before = await snapshot();
    assert.match(runNode('loan_migrate.js', ['down', '--yes']), /20261030_loan_phase2b_accounting/);
    assert.match(runNode('loan_migrate.js', ['down', '--yes']), /20261029_loan_phase2a_corrections/);
    runNode('loan_migrate.js', ['up']);
    assert.strictEqual(await snapshot(), before);
  });
  await test('down refuses without --yes', async () => {
    assert.throws(() => runNode('loan_migrate.js', ['down']));
  });

  let countsAfterFirstSeed;
  await test('seed runs twice with identical row counts', async () => {
    runNode('seed_loan_phase2a_data.js');
    countsAfterFirstSeed = await tableCounts();
    runNode('seed_loan_phase2a_data.js');
    assert.deepStrictEqual(await tableCounts(), countsAfterFirstSeed);
  });
  await test('seed: business parameters PENDING, catalog AUTHORIZED, Phase 2B tables empty', async () => {
    for (const t of ['ln_product', 'ln_component', 'ln_provision_rule', 'ln_status_master', 'ln_status_movement_rule', 'ln_regulatory_class', 'ln_tax_master', 'ln_product_category']) {
      const rows = await q(`SELECT DISTINCT authStatus s FROM \`${t}\``);
      assert.deepStrictEqual(rows.map(r => r.s), ['PENDING'], `${t} should be PENDING only`);
    }
    for (const [t, n] of [['ln_accounting_role', 31], ['ln_event_master', 22], ['ln_amount_tag', 42]]) {
      const c = await q(`SELECT COUNT(*) n, SUM(authStatus = 'AUTHORIZED') a FROM \`${t}\``);
      assert.strictEqual(Number(c[0].n), n, `${t} count`);
      assert.strictEqual(Number(c[0].a), n, `${t} AUTHORIZED`);
    }
    assert.strictEqual(countsAfterFirstSeed.ln_accounting_entry_rule, 0);
    assert.strictEqual(countsAfterFirstSeed.ln_role_gl_mapping, 0);
    const role = await q("SELECT expectedType, resolverType FROM ln_accounting_role WHERE roleCode IN ('SUSPENDED_INTEREST','TAX_PAYABLE') ORDER BY roleCode");
    assert.deepStrictEqual(role.map(r => `${r.expectedType}/${r.resolverType}`), ['Liability/MAPPING_TABLE', 'Liability/SYSTEM_PARAM']);
    const statuses = await q('SELECT statusCode FROM ln_status_master ORDER BY id');
    assert.deepStrictEqual(statuses.map(s => s.statusCode), ['NORMAL', 'WATCH', 'SUBSTANDARD', 'DOUBTFUL', 'LOSS', 'WRITTEN_OFF', 'REPOSSESSED', 'CLOSED']);
    const cur = await q('SELECT DISTINCT pc.currencyId c, cu.isLocalCCY l FROM ln_product_currency pc JOIN currency cu ON cu.id = pc.currencyId');
    assert.ok(cur.length === 1 && Number(cur[0].l) === 1, 'products bind the base currency only');
    const tax = await q('SELECT m.taxRate, m.posTaxId, p.posTaxId profileTax FROM ln_tax_master m, ln_tax_profile p');
    assert.ok(tax[0].taxRate === null && tax[0].posTaxId && tax[0].posTaxId === tax[0].profileTax, 'VAT referenced via posTaxId, no copied rate');
  });

  console.log('\n[phase 2b seed]');
  let countsAfter2b;
  await test('2B seed: aligns an untouched PENDING status to MEMO_ONLY and runs twice with identical row counts', async () => {
    await q("UPDATE ln_status_master SET penaltyTreatment = 'ACCRUE' WHERE statusCode = 'WATCH' AND authStatus = 'PENDING' AND makerId IS NULL");
    const mappings = Number((await q('SELECT COUNT(*) n FROM ln_role_gl_mapping'))[0].n);
    const accounts = Number((await q('SELECT COUNT(*) n FROM chart_of_account'))[0].n);
    runNode('seed_loan_phase2b_accounting.js');
    countsAfter2b = await tableCounts();
    runNode('seed_loan_phase2b_accounting.js');
    runNode('seed_loan_phase2a_data.js'); // a 2A re-run must not remove the 2B catalog additions
    assert.deepStrictEqual(await tableCounts(), countsAfter2b);
    assert.strictEqual(Number((await q('SELECT COUNT(*) n FROM ln_role_gl_mapping'))[0].n), mappings, 'no role-to-GL mappings');
    assert.strictEqual(Number((await q('SELECT COUNT(*) n FROM chart_of_account'))[0].n), accounts, 'no GL accounts created');
    const pen = await q("SELECT statusCode, penaltyTreatment p FROM ln_status_master ORDER BY id");
    assert.deepStrictEqual(pen.map(r => `${r.statusCode}:${r.p}`), ['NORMAL:MEMO_ONLY', 'WATCH:MEMO_ONLY', 'SUBSTANDARD:MEMO_ONLY', 'DOUBTFUL:MEMO_ONLY', 'LOSS:MEMO_ONLY',
      'WRITTEN_OFF:STOP_ACCRUAL', 'REPOSSESSED:STOP_ACCRUAL', 'CLOSED:STOP_ACCRUAL']);
    assert.strictEqual(Number((await q("SELECT COUNT(*) n FROM ln_audit_log WHERE actionType = 'SEED_RECONCILE' AND entityName = 'status' AND entityKey = 'WATCH'"))[0].n), 1);
  });
  await test('2B seed: catalog additions AUTHORIZED, entry rules PENDING with the inactive options, VAT parameter empty', async () => {
    const catalog = require('../../src/loan/accounting/catalog');
    for (const [t, n] of [['ln_event_master', 25], ['ln_amount_tag', 50], ['ln_lookup_interest_recognition', 3]]) {
      const c = await q(`SELECT COUNT(*) n, SUM(authStatus = 'AUTHORIZED') a FROM \`${t}\``);
      assert.strictEqual(Number(c[0].n), n, `${t} count`);
      assert.strictEqual(Number(c[0].a), n, `${t} AUTHORIZED`);
    }
    const rules = await q('SELECT authStatus s, isActive a, COUNT(*) n FROM ln_accounting_entry_rule GROUP BY 1, 2 ORDER BY 1, 2');
    const inactive = catalog.ENTRY_RULES.filter(r => !r.isActive).length;
    assert.deepStrictEqual(rules.map(r => `${r.s}/${r.a}/${r.n}`), [`PENDING/0/${inactive}`, `PENDING/1/${catalog.ENTRY_RULES.length - inactive}`]);
    const offRoles = await q("SELECT DISTINCT amountTag t FROM ln_accounting_entry_rule WHERE isActive = 0 AND roleCode NOT IN ('DEFERRED_FEE','UNAMORTIZED_FEE_CONTRA','FEE_INCOME') ORDER BY 1");
    assert.deepStrictEqual(offRoles.map(r => r.t), ['PEN_WAIVE', 'PEN_WO', 'PENALTY'], 'only deferred-fee and penalty-receivable legs are inactive');
    const prodRec = await q('SELECT DISTINCT interestRecognitionCode c FROM ln_product');
    assert.deepStrictEqual(prodRec.map(r => r.c), ['DUE_DATE']);
    const vat = await q("SELECT value FROM spf WHERE code = 'GL_MAP_VAT_OUTPUT_ACC'");
    assert.ok(vat.length === 1 && vat[0].value === '', 'GL_MAP_VAT_OUTPUT_ACC exists and is empty');
    const fn = await q("SELECT applicableActions a FROM sec_function WHERE functionCode IN ('LN_ENTRY_RULE','LN_ACCOUNTING_SETUP') ORDER BY functionCode");
    assert.deepStrictEqual(fn.map(r => r.a), ['VIEW', 'VIEW,CREATE,EDIT,DELETE,AUTHORIZE']);
  });

  console.log('\n[schema parity]');
  const db = require('../../src/models');
  db.sequelize.options.logging = false;
  await test('Sequelize models match the database (except documented generated-column keys)', async () => {
    const diffs = await parity(db);
    assert.deepStrictEqual(diffs, []);
  });

  console.log('\n[accounting validators]');
  await accountingTests({ db });

  console.log('\n[api] starting API on port', port);
  const app = await startApi(port, childEnv);
  try {
    await apiTests({ port, q, db, runNode });
  } finally {
    app.kill('SIGTERM');
  }

  await conn.end();
  await db.sequelize.close();
};

// ----------------------------------------------------------------------------- parity

const GENERATED_KEYS = new Set(['uk_accounting_entry_rule', 'uk_role_gl_mapping']);
const GENERATED_COLS = new Set(['ukProductId', 'ukCategoryId', 'ukBranchId', 'ukCurrencyId', 'ukStatusQualifier']);

const parity = async (db) => {
  const Q = db.Sequelize.QueryTypes.SELECT;
  const cols = await db.sequelize.query("SELECT table_name t, column_name c, column_type ty, is_nullable n FROM information_schema.columns WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name LIKE 'sec\\_%')", { type: Q });
  const idx = await db.sequelize.query("SELECT table_name t, index_name i, non_unique nu, GROUP_CONCAT(column_name ORDER BY seq_in_index) c FROM information_schema.statistics WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name LIKE 'sec\\_%') AND index_name <> 'PRIMARY' GROUP BY 1, 2, 3", { type: Q });
  const norm = t => String(t).toLowerCase().replace(/\s+/g, '').replace(/^int(eger)?(\(\d+\))?/, 'int').replace(/^tinyint\(1\)|^boolean/, 'bool').replace(/^datetime(\(\d+\))?/, 'datetime');
  const dbc = {}; const dbi = {};
  cols.forEach(r => ((dbc[r.t] = dbc[r.t] || {})[r.c] = r));
  idx.forEach(r => ((dbi[r.t] = dbi[r.t] || {})[r.i] = r));
  const diffs = []; const seen = new Set();
  for (const m of Object.values(db)) {
    if (!m || !m.rawAttributes || !/^(ln|sec)_/.test(String(m.getTableName()))) continue;
    const t = m.getTableName(); seen.add(t);
    const dc = dbc[t];
    if (!dc) { diffs.push(`${t}: table missing in DB`); continue; }
    const attrs = Object.entries(m.rawAttributes).map(([a, d]) => [d.field || a, d]);
    for (const [f, d] of attrs) {
      const c = dc[f];
      const mt = d.type.toSql ? d.type.toSql({ escape: v => db.sequelize.escape(v) }) : String(d.type);
      if (!c) { diffs.push(`${t}.${f}: in model, not in DB`); continue; }
      if (norm(mt) !== norm(c.ty)) diffs.push(`${t}.${f}: type model ${mt} / db ${c.ty}`);
      if ((d.allowNull !== false && !d.primaryKey) !== (c.n === 'YES')) diffs.push(`${t}.${f}: nullability differs`);
    }
    for (const c of Object.keys(dc)) if (!attrs.some(([f]) => f === c) && !GENERATED_COLS.has(c)) diffs.push(`${t}.${c}: in DB, not in model`);
    const mi = {};
    for (const [f, d] of attrs) if (d.unique) mi[f] = { u: true, c: f };
    for (const ix of (m.options.indexes || [])) mi[ix.name] = { u: !!ix.unique, c: ix.fields.join(',') };
    const di = dbi[t] || {};
    for (const [n, v] of Object.entries(mi)) {
      if (!di[n]) diffs.push(`${t}: index ${n} missing in DB`);
      else if ((Number(di[n].nu) === 0) !== v.u || di[n].c !== v.c) diffs.push(`${t}: index ${n} differs`);
    }
    for (const n of Object.keys(di)) if (!mi[n] && !GENERATED_KEYS.has(n)) diffs.push(`${t}: index ${n} not declared in model`);
  }
  for (const t of Object.keys(dbc)) if (!seen.has(t)) diffs.push(`${t}: table without model`);
  return diffs;
};

// ----------------------------------------------------------------------------- API process

const startApi = (port, env) => new Promise((resolve, reject) => {
  const childEnv = { ...env, PORT: String(port), TZ: 'Asia/Vientiane' };
  delete childEnv.NO_SYNC; // exercise the real startup path, including sync
  const child = spawn(process.execPath, [path.join(API_ROOT, 'src/index.js')], { cwd: RUN_DIR, env: childEnv });
  let ready = false;
  const timer = setTimeout(() => { if (!ready) { child.kill(); reject(new Error('API did not start within 180s')); } }, 180000);
  const onData = (buf) => {
    if (!ready && /Database client is synchronized/.test(buf.toString())) {
      ready = true;
      clearTimeout(timer);
      setTimeout(() => resolve(child), 500);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => { if (!ready) { clearTimeout(timer); reject(new Error(`API exited early with code ${code}`)); } });
});

// ----------------------------------------------------------------------------- API tests

// ----------------------------------------------------------------------------- accounting (2B)
const accountingTests = async ({ db }) => {
  const { resolveRuleSet, buildJournal, reverseLines, toUnits, fromUnits } = require('../../src/loan/accounting/journal');
  const V = require('../../src/loan/accounting/validators');
  const { DEFAULT_PRODUCT, EXAMPLES } = require('./fixtures/workedExamples');
  const allRules = (await db.lnAccountingEntryRule.findAll()).map(r => r.get({ plain: true }));
  const roleTypes = Object.fromEntries((await db.lnAccountingRole.findAll()).map(r => [r.roleCode, r.expectedType]));
  const product = { id: -1, categoryId: -1, ...DEFAULT_PRODUCT };
  const rules = resolveRuleSet(allRules, product, { includePending: true });
  const fmt = l => `${l.amountTag} ${l.drCr} ${l.roleCode}${l.qualifier ? `[${l.qualifier}]` : ''} ${fromUnits(toUnits(l.amount))}`;
  const norm = e => { const parts = e.split(' '); parts[3] = fromUnits(toUnits(parts[3])); return parts.join(' '); };

  const journals = {};
  for (const ex of EXAMPLES) {
    await test(`${ex.name}: seeded rules produce the addendum entries; balanced; total-cash check passes`, async () => {
      for (const step of ex.steps) {
        const lines = step.reverses
          ? reverseLines(journals[step.reverses])
          : buildJournal({ rules, eventCode: step.event, tags: step.tags, qualifiers: step.qualifiers, currency: 'LAK' });
        if (step.id) journals[step.id] = lines;
        assert.deepStrictEqual(lines.map(fmt).sort(), step.expected.map(norm).sort(), `${step.event} lines`);
        assert.deepStrictEqual(V.validateJournal(lines, roleTypes), [], `${step.event} balance`);
        if (step.tags) assert.deepStrictEqual(V.validateTagAmounts(step.event, step.tags, rules), [], `${step.event} total-cash`);
      }
    });
  }

  await test('validator: an unbalanced journal is rejected (per currency)', async () => {
    const lines = buildJournal({ rules, eventCode: 'ACCR', tags: { INT_ACCR: '3600000' }, currency: 'LAK' });
    lines[1].amount = '3599999.9999';
    assert.match(V.validateJournal(lines, roleTypes).join(), /Unbalanced on-balance lines in LAK/);
    const usd = buildJournal({ rules, eventCode: 'ACCR', tags: { INT_ACCR: '100' }, currency: 'USD' });
    assert.match(V.validateJournal([...usd.slice(0, 1), ...buildJournal({ rules, eventCode: 'ACCR', tags: { INT_ACCR: '100' }, currency: 'LAK' }).slice(1)], roleTypes).join(), /in USD.*in LAK|in LAK.*in USD/);
  });
  await test('validator: on- and off-balance must balance separately (an off-balance leg cannot offset an on-balance leg)', async () => {
    const lines = [
      { eventCode: 'X', amountTag: 'T', drCr: 'DR', roleCode: 'LOAN_LOSS_SHORTFALL', currency: 'LAK', amount: '100' },
      { eventCode: 'X', amountTag: 'T', drCr: 'CR', roleCode: 'WRITTEN_OFF_MEMO_CR', currency: 'LAK', amount: '100' }
    ];
    const errors = V.validateJournal(lines, roleTypes);
    assert.strictEqual(errors.length, 2);
    assert.match(errors.join(), /on-balance/);
    assert.match(errors.join(), /off-balance/);
  });
  await test('validator: total-cash tag must equal the sum of its parts', async () => {
    assert.match(V.validateTagAmounts('LIQD', { TOTAL_PAID: '23600000', INT_PAID: '3600000', PRIN_PAID: '20000001' }, rules).join(), /total-cash tag TOTAL_PAID/);
    assert.match(V.validateTagAmounts('PREPAY', { PAYOFF_CASH: '82200000', OUT_PRIN: '80000000', EARNED_INT: '600000' }, rules).join(), /total-cash tag PAYOFF_CASH/);
    assert.match(V.validateTagAmounts('FEE_REFUND', { REFUND_AMT: '10000000', FEE_DOC: '3000000' }, rules).join(), /total-cash tag REFUND_AMT/);
    assert.match(V.validateTagAmounts('REPOSSESS', { APPRAISED: '125000000', OUT_PRIN: '150000000' }, rules).join(), /one-sided tags/);
  });
  await test('builder: a non-zero tag without an active rule is refused (booked penalty under MEMO_ONLY, deferred fee under IMMEDIATE)', async () => {
    assert.throws(() => buildJournal({ rules, eventCode: 'LIQD', tags: { TOTAL_PAID: '100', PENALTY: '100' }, qualifiers: { CURRENT: 'NORMAL' } }), /PENALTY is non-zero but has no active entry rule/);
    assert.throws(() => buildJournal({ rules, eventCode: 'EIR_AMORT', tags: { EIR_AMORT: '10' } }), /no active entry rule/);
    assert.throws(() => buildJournal({ rules, eventCode: 'DISB', tags: { PRINCIPAL: '1' } }), /needs the CURRENT status qualifier/);
  });

  const check = (params, extra = []) => {
    const p = { id: -1, categoryId: -1, ...params };
    const active = [...resolveRuleSet(allRules, p, { includePending: true }), ...extra];
    return V.validateProductRuleSet(p, active, resolveRuleSet(allRules, p, { includePending: true, includeInactive: true }));
  };
  await test('product rule set: every valid fee mode x target with IMMEDIATE passes on the seeded rules', async () => {
    for (const feeFinancingMode of ['UPFRONT', 'CAPITALIZED', 'DEDUCTED']) {
      for (const disbursementTargetCode of ['SALE_INVOICE_SETTLEMENT', 'CASH_BANK']) {
        if (feeFinancingMode === 'DEDUCTED' && disbursementTargetCode === 'SALE_INVOICE_SETTLEMENT') continue;
        assert.deepStrictEqual(check({ feeFinancingMode, deferredFeePresentation: 'IMMEDIATE', disbursementTargetCode }), [], `${feeFinancingMode}/${disbursementTargetCode}`);
      }
    }
  });
  await test('product rule set: invalid combinations and mismatches are reported', async () => {
    assert.match(check({ feeFinancingMode: 'DEDUCTED', deferredFeePresentation: 'IMMEDIATE', disbursementTargetCode: 'SALE_INVOICE_SETTLEMENT' }).join(), /DEDUCTED fee mode cannot be combined/);
    assert.match(check({ ...DEFAULT_PRODUCT, disbursementTargetCode: 'CUSTOMER_ACCOUNT' }).join(), /CUSTOMER_ACCOUNT has no accounting role/);
    const deferred = check({ ...DEFAULT_PRODUCT, deferredFeePresentation: 'LIABILITY' });
    assert.ok(deferred.some(e => /Required leg FEE_COLLECT FEE_DOC CR DEFERRED_FEE exists but is inactive/.test(e)), 'deferred fee legs inactive');
    assert.ok(deferred.some(e => /Required leg EIR_AMORT EIR_AMORT DR DEFERRED_FEE exists but is inactive/.test(e)), 'EIR legs inactive');
    const withoutDisb = allRules.filter(r => !(r.eventCode === 'DISB' && r.amountTag === 'PRINCIPAL' && r.drCr === 'CR'));
    const p = { id: -1, categoryId: -1, ...DEFAULT_PRODUCT };
    assert.match(V.validateProductRuleSet(p, resolveRuleSet(withoutDisb, p, { includePending: true }), []).join(), /Missing required leg DISB PRINCIPAL CR SALE_RECEIVABLE/);
    const rogue = (over) => ({ productId: -1, categoryId: null, qualifierSource: 'NONE', authStatus: 'PENDING', isActive: true, feeModeFilter: 'ANY', presentationFilter: 'ANY', targetFilter: 'ANY', effectiveFrom: '2026-01-01', ...over });
    assert.match(check(DEFAULT_PRODUCT, [rogue({ eventCode: 'EIR_AMORT', amountTag: 'EIR_AMORT', drCr: 'DR', roleCode: 'DEFERRED_FEE' })]).join(), /uses DEFERRED_FEE, but presentation is IMMEDIATE/);
    assert.match(check(DEFAULT_PRODUCT, [rogue({ eventCode: 'DISB', amountTag: 'FEE_DOC', drCr: 'DR', roleCode: 'LOAN_PORTFOLIO', qualifierSource: 'CURRENT' })]).join(), /fees are paid UPFRONT/);
    assert.match(check(DEFAULT_PRODUCT, [rogue({ eventCode: 'DISB', amountTag: 'PRINCIPAL', drCr: 'CR', roleCode: 'CASH_BANK' })]).join(), /disbursement target is SALE_INVOICE_SETTLEMENT/);
    assert.match(check({ ...DEFAULT_PRODUCT, feeFinancingMode: 'CAPITALIZED' }, [rogue({ eventCode: 'FEE_COLLECT', amountTag: 'TOTAL_PAID', drCr: 'DR', roleCode: 'CASH_BANK' })]).join(), /FEE_COLLECT leg, but fee mode is CAPITALIZED/);
  });
  await test('rule structure: qualifier misuse and a two-sided tag that does not balance are reported', async () => {
    const r = (over) => ({ eventCode: 'ACCR', amountTag: 'INT_ACCR', qualifierSource: 'NONE', ...over });
    const errors = V.validateRuleStructure([
      r({ drCr: 'DR', roleCode: 'LOAN_PORTFOLIO', qualifierSource: 'NONE' }),
      r({ drCr: 'DR', roleCode: 'INTEREST_RECEIVABLE', qualifierSource: 'CURRENT' }),
      r({ drCr: 'CR', roleCode: 'INTEREST_INCOME' })
    ]);
    assert.ok(errors.some(e => /LOAN_PORTFOLIO needs qualifierSource CURRENT/.test(e)));
    assert.ok(errors.some(e => /only LOAN_PORTFOLIO is status-qualified/.test(e)));
    assert.ok(errors.some(e => /2 debit leg\(s\) vs 1 credit leg/.test(e)));
    assert.deepStrictEqual(V.validateRuleStructure(rules), [], 'seeded default rule set is structurally valid');
  });
  await test('rule resolution: a product-scoped set for an event overrides the global set; effective dates apply', async () => {
    const p = { id: 77, categoryId: 5, ...DEFAULT_PRODUCT };
    const own = { productId: 77, categoryId: null, eventCode: 'ACCR', amountTag: 'INT_ACCR', drCr: 'DR', roleCode: 'INTEREST_RECEIVABLE', qualifierSource: 'NONE', authStatus: 'AUTHORIZED', isActive: true, feeModeFilter: 'ANY', presentationFilter: 'ANY', targetFilter: 'ANY', effectiveFrom: '2027-01-01' };
    const auth = allRules.map(x => ({ ...x, authStatus: 'AUTHORIZED', effectiveFrom: '2026-01-01' }));
    const before = resolveRuleSet([...auth, own], p, { asOfDate: '2026-12-31' }).filter(x => x.eventCode === 'ACCR');
    const after = resolveRuleSet([...auth, own], p, { asOfDate: '2027-01-01' }).filter(x => x.eventCode === 'ACCR');
    assert.strictEqual(before.length, 2, 'global ACCR pair before the product rule is effective');
    assert.deepStrictEqual(after.map(x => x.productId), [77], 'product rule replaces the global ACCR set');
    assert.strictEqual(resolveRuleSet(allRules, p, {}).length, 0, 'PENDING rules are not used unless includePending');
  });

  await test('propose-accounts helper: 19 accounts by default (20 with VAT, 33 with every option); collisions and parameters checked; read-only', async () => {
    const { proposeAccounts } = require('../../src/loan/accounting/accountProposals');
    const countBefore = await db.chartAccount.count();
    const base = await proposeAccounts(db);
    assert.strictEqual(base.accounts.length, 19);
    assert.deepStrictEqual(base.accounts.filter(a => a.roleCode === 'LOAN_PORTFOLIO').map(a => `${a.number}:${a.qualifiers.join('+')}`), ['1211:NORMAL+WATCH', '1213:SUBSTANDARD+DOUBTFUL+LOSS']);
    assert.strictEqual((await proposeAccounts(db, { features: ['VAT'] })).accounts.length, 20);
    const all = await proposeAccounts(db, { features: ['VAT', 'BILL_PENALTY', 'BILLED_FEES', 'FX', 'DEFERRED_FEES', 'FIVE_PORTFOLIO'] });
    assert.strictEqual(all.accounts.length, 33);
    assert.strictEqual(all.accounts.filter(a => a.roleCode === 'LOAN_PORTFOLIO').length, 5);
    await assert.rejects(proposeAccounts(db, { features: ['NOPE'] }), /Unknown feature/);

    // Collision: an unrelated account already uses 1213; a matching 1221 can be reused (throwaway test DB only)
    const clash = await db.chartAccount.create({ accountNumber: '1213', accountName: 'Office supplies', accountLLName: 'x', accountType: 'Expense', isActive: true });
    const same = await db.chartAccount.create({ accountNumber: '1221', accountName: 'Loan interest receivable', accountLLName: 'x', accountType: 'Asset', isActive: true });
    try {
      const r = await proposeAccounts(db, { features: ['VAT'] });
      const by = Object.fromEntries(r.accounts.map(a => [a.number, a]));
      assert.strictEqual(by['1213'].status, 'COLLISION');
      assert.match(by['1213'].detail, /Office supplies/);
      assert.strictEqual(by['1221'].status, 'REUSE');
      assert.strictEqual(r.summary.collisions, 1);
      const params = Object.fromEntries(r.params.map(x => [x.param, x.status]));
      assert.strictEqual(params.GL_MAP_VAT_OUTPUT_ACC, 'NOT_SET');
      assert.strictEqual(params.GL_MAP_AR_ACC, 'OK', 'AR resolved through its system parameter');
    } finally {
      await clash.destroy();
      await same.destroy();
    }
    assert.strictEqual(await db.chartAccount.count(), countBefore);
    assert.strictEqual(await db.lnRoleGlMapping.count(), 0);
  });
};

const apiTests = async ({ port, q, db, runNode }) => {
  const axios = require('axios');
  const jwt = require('jsonwebtoken');
  const secret = require('../../src/config').actksecret;
  const base = `http://127.0.0.1:${port}`;

  const users = await q("SELECT u.id, g.code FROM user u JOIN userGroup g ON g.id = u.groupId WHERE u.isActive = 1 AND g.code IN ('SUPER_ADMIN','ADMIN','CASHIER') ORDER BY u.id");
  const pick = code => { const u = users.find(x => x.code === code); if (!u) throw new Error(`No active user in group ${code} in ${TEST_DB}`); return u.id; };
  const SUPER = pick('SUPER_ADMIN');
  const ADMIN = pick('ADMIN');
  const CASHIER = pick('CASHIER');

  const leaks = [];
  const call = async (userId, method, url, data) => {
    const res = await axios({
      method, url: base + url, data, validateStatus: () => true,
      headers: { Authorization: `Bearer ${jwt.sign({ id: userId, cus_name: `test${userId}` }, secret, { expiresIn: '1h' })}` }
    });
    if (res.status >= 400 && /\b(SELECT|INSERT INTO|UPDATE `|sql:)/i.test(JSON.stringify(res.data))) leaks.push(`${method} ${url}`);
    return res;
  };
  const expectStatus = (res, status, label) => assert.strictEqual(res.status, status, `${label}: expected ${status}, got ${res.status} ${JSON.stringify(res.data && res.data.message)}`);
  const L = '/api/loan';

  console.log('\n[rbac]');
  await test('CASHIER is refused (403) on view, create and authorize', async () => {
    expectStatus(await call(CASHIER, 'get', `${L}/products`), 403, 'view');
    expectStatus(await call(CASHIER, 'post', `${L}/params/product-category`, { code: 'X1', name: 'x' }), 403, 'create');
    expectStatus(await call(CASHIER, 'post', `${L}/params/product-category/1/authorize`), 403, 'authorize');
    expectStatus(await call(CASHIER, 'post', `${L}/checklist/PROVISION_POLICY/confirm`), 403, 'checklist confirm');
  });
  await test('ADMIN and SUPER_ADMIN are granted (200)', async () => {
    expectStatus(await call(ADMIN, 'get', `${L}/products`), 200, 'ADMIN view');
    expectStatus(await call(SUPER, 'get', `${L}/checklist`), 200, 'SUPER view');
  });
  await test('view-only function refuses edits (LN_ACCOUNTING_SETUP)', async () => {
    expectStatus(await call(ADMIN, 'put', `${L}/params/accounting-role/1`, { name: 'x' }), 403, 'edit accounting role');
  });
  await test('unauthenticated request is refused (401)', async () => {
    const res = await axios.get(`${base}${L}/products`, { validateStatus: () => true });
    assert.strictEqual(res.status, 401);
  });

  console.log('\n[validation]');
  await test('bad decimal, rate > 1, unknown lookup and unknown field are rejected (400)', async () => {
    expectStatus(await call(ADMIN, 'post', `${L}/params/approval-matrix`, { entityType: 'APPLICATION', minAmount: '12abc', maxAmount: '1', requiredLevel: 1, approverRoleId: 1 }), 400, 'bad decimal');
    expectStatus(await call(ADMIN, 'post', `${L}/params/provision-rule`, { regulatoryClassCode: 'CLASS_A', provisionRate: '1.5', collateralHaircutPct: '0.1', effectiveFrom: '2026-01-01' }), 400, 'rate > 1');
    expectStatus(await call(ADMIN, 'post', `${L}/params/status`, { statusCode: 'ZZ', name: 'z', regulatoryClassCode: 'NOPE', interestTreatment: 'X', penaltyTreatment: 'Y' }), 400, 'unknown lookup');
    expectStatus(await call(ADMIN, 'post', `${L}/params/product-category`, { code: 'X2', name: 'x', authStatus: 'AUTHORIZED' }), 400, 'unknown field');
    expectStatus(await call(ADMIN, 'post', `${L}/params/product-category`, { name: 'missing code' }), 400, 'required field');
  });
  await test('product rule: DEDUCTED fees with SALE_INVOICE_SETTLEMENT rejected', async () => {
    const p = (await call(ADMIN, 'get', `${L}/products?search=CAR-LOAN-BALLOON`)).data.data[0];
    expectStatus(await call(ADMIN, 'put', `${L}/products/${p.id}`, { feeFinancingMode: 'DEDUCTED' }), 400, 'deducted + invoice');
  });

  console.log('\n[maker-checker]');
  let catId;
  await test('maker cannot authorize own record; another user can', async () => {
    const created = await call(ADMIN, 'post', `${L}/params/product-category`, { code: 'TEST_CAT', name: 'Test category' });
    expectStatus(created, 201, 'create');
    catId = created.data.data.id;
    assert.strictEqual(created.data.data.authStatus, 'PENDING');
    expectStatus(await call(ADMIN, 'post', `${L}/params/product-category/${catId}/authorize`), 403, 'self authorize');
    const ok = await call(SUPER, 'post', `${L}/params/product-category/${catId}/authorize`);
    expectStatus(ok, 200, 'checker authorize');
    assert.strictEqual(ok.data.data.checkerId, SUPER);
  });
  await test('LOAN_ALLOW_SELF_AUTHORIZE=true allows self-authorization and audits SELF_AUTH', async () => {
    await q("UPDATE SPF SET value = 'true' WHERE code = 'LOAN_ALLOW_SELF_AUTHORIZE'");
    try {
      const created = await call(ADMIN, 'post', `${L}/params/product-category`, { code: 'SELF_CAT', name: 'Self authorized' });
      const id = created.data.data.id;
      expectStatus(await call(ADMIN, 'post', `${L}/params/product-category/${id}/authorize`), 200, 'self authorize');
      const audit = await q("SELECT COUNT(*) n FROM ln_audit_log WHERE entityName = 'product-category' AND entityKey = ? AND actionType = 'SELF_AUTH' AND userId = ?", [String(id), ADMIN]);
      assert.strictEqual(Number(audit[0].n), 1);
    } finally {
      await q("UPDATE SPF SET value = 'false' WHERE code = 'LOAN_ALLOW_SELF_AUTHORIZE'");
    }
  });
  await test('edit of an AUTHORIZED row stays pending until authorized', async () => {
    expectStatus(await call(ADMIN, 'put', `${L}/params/product-category/${catId}`, { name: 'Renamed' }), 200, 'submit change');
    assert.strictEqual((await call(SUPER, 'get', `${L}/params/product-category/${catId}`)).data.data.name, 'Test category');
    expectStatus(await call(ADMIN, 'put', `${L}/params/product-category/${catId}`, { name: 'Again' }), 409, 'second pending change');
    const change = (await call(SUPER, 'get', `${L}/changes`)).data.data.find(c => c.entityName === 'product-category' && c.entityKey === String(catId));
    expectStatus(await call(ADMIN, 'post', `${L}/changes/${change.id}/authorize`), 403, 'maker authorizes own change');
    expectStatus(await call(SUPER, 'post', `${L}/changes/${change.id}/authorize`), 200, 'checker authorizes change');
    assert.strictEqual((await call(SUPER, 'get', `${L}/params/product-category/${catId}`)).data.data.name, 'Renamed');
  });
  await test('stale change is refused (409) after a concurrent modification', async () => {
    expectStatus(await call(ADMIN, 'put', `${L}/params/product-category/${catId}`, { description: 'stale' }), 200, 'submit change');
    await q('UPDATE ln_product_category SET updatedAt = updatedAt + INTERVAL 1 SECOND WHERE id = ?', [catId]);
    const change = (await call(SUPER, 'get', `${L}/changes`)).data.data.find(c => c.entityName === 'product-category' && c.entityKey === String(catId));
    expectStatus(await call(SUPER, 'post', `${L}/changes/${change.id}/authorize`), 409, 'stale authorize');
    expectStatus(await call(SUPER, 'post', `${L}/changes/${change.id}/reject`, { remarks: 'stale' }), 200, 'reject');
  });
  await test('every mutation is audited', async () => {
    const rows = await q("SELECT actionType FROM ln_audit_log WHERE entityName = 'product-category' AND entityKey = ?", [String(catId)]);
    const types = rows.map(r => r.actionType);
    for (const t of ['CREATE', 'AUTH', 'CHANGE_REQUEST', 'REJECT']) assert.ok(types.includes(t), `missing ${t} in ${types.join(',')}`);
  });

  console.log('\n[products]');
  await test('a product cannot be authorized before its category', async () => {
    const flat = (await call(SUPER, 'get', `${L}/products?search=CAR-LOAN-FLAT`)).data.data[0];
    expectStatus(await call(SUPER, 'post', `${L}/params/product/${flat.id}/authorize`), 409, 'category still pending');
  });
  await test('editing an authorized product creates a new version; authorizing it supersedes v1', async () => {
    const cat = (await call(SUPER, 'get', `${L}/params/product-category?code=VEHICLE_FINANCING`)).data.data.items[0];
    expectStatus(await call(SUPER, 'post', `${L}/params/product-category/${cat.id}/authorize`), 200, 'authorize seeded category');
    const v1 = (await call(SUPER, 'get', `${L}/products?search=CAR-LOAN-DB`)).data.data[0];
    expectStatus(await call(SUPER, 'post', `${L}/params/product/${v1.id}/authorize`), 200, 'authorize v1');
    const children = await q("SELECT authStatus s, COUNT(*) n FROM ln_product_component WHERE productId = ? GROUP BY authStatus", [v1.id]);
    assert.deepStrictEqual(children.map(c => c.s), ['AUTHORIZED'], 'v1 children authorized with the product');

    const edit = await call(ADMIN, 'put', `${L}/products/${v1.id}`, { name: 'Car Loan DB v2' });
    expectStatus(edit, 200, 'edit authorized product');
    const v2 = edit.data.data;
    assert.strictEqual(v2.version, 2);
    assert.strictEqual(v2.authStatus, 'PENDING');
    const [c1, c2] = await Promise.all([v1.id, v2.id].map(async id => Number((await q('SELECT COUNT(*) n FROM ln_product_component WHERE productId = ?', [id]))[0].n)));
    assert.strictEqual(c2, c1, 'children copied to v2');
    expectStatus(await call(SUPER, 'post', `${L}/params/product/${v2.id}/authorize`), 200, 'authorize v2');
    const states = await q('SELECT version, authStatus, status FROM ln_product WHERE productCode = ? ORDER BY version', ['CAR-LOAN-DB']);
    assert.deepStrictEqual(states.map(s => `${s.version}:${s.authStatus}:${s.status}`), ['1:AUTHORIZED:SUPERSEDED', '2:AUTHORIZED:ACTIVE']);
  });

  console.log('\n[effective dating]');
  await test('paramReader.getEffective returns only AUTHORIZED rows effective on the date', async () => {
    const { getEffective } = require('../../src/loan/services/paramReader');
    const rows = [
      { taxCode: 'TST_EFF', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30', authStatus: 'AUTHORIZED', accountingRoleCode: 'TAX_PAYABLE' },
      { taxCode: 'TST_EFF', effectiveFrom: '2026-07-01', effectiveTo: null, authStatus: 'AUTHORIZED', accountingRoleCode: 'TAX_PAYABLE' },
      { taxCode: 'TST_EFF', effectiveFrom: '2026-03-01', effectiveTo: null, authStatus: 'PENDING', accountingRoleCode: 'TAX_PAYABLE' }
    ];
    await db.lnTaxMaster.bulkCreate(rows);
    try {
      const at = async d => (await getEffective(db.lnTaxMaster, { taxCode: 'TST_EFF' }, d)).map(r => r.effectiveFrom);
      assert.deepStrictEqual(await at('2025-12-31'), []);
      assert.deepStrictEqual(await at('2026-03-15'), ['2026-01-01']);
      assert.deepStrictEqual(await at('2026-06-30'), ['2026-01-01']);
      assert.deepStrictEqual(await at('2026-08-01'), ['2026-07-01']);
    } finally {
      await db.lnTaxMaster.destroy({ where: { taxCode: 'TST_EFF' } });
    }
  });

  console.log('\n[tax profile]');
  await test('PUT /tax-profile ignores confirmationStatus; editor cannot confirm; checker confirm records who/when', async () => {
    const posTaxId = (await q('SELECT id FROM tax WHERE isDefault = 1 AND isActive = 1 LIMIT 1'))[0].id;
    const put = await call(ADMIN, 'put', `${L}/tax-profile`, { posTaxId, confirmationStatus: 'CONFIRMED' });
    expectStatus(put, 200, 'update');
    assert.strictEqual(put.data.data.confirmationStatus, 'UNCONFIRMED');
    expectStatus(await call(ADMIN, 'post', `${L}/tax-profile/confirm`), 403, 'editor confirms');
    const ok = await call(SUPER, 'post', `${L}/tax-profile/confirm`);
    expectStatus(ok, 200, 'checker confirms');
    assert.strictEqual(ok.data.data.confirmationStatus, 'CONFIRMED');
    assert.strictEqual(ok.data.data.confirmedBy, SUPER);
    assert.ok(ok.data.data.confirmedAt, 'confirmedAt set');
    const profile = (await call(SUPER, 'get', `${L}/tax-profile`)).data.data;
    const posRate = (await q('SELECT rate FROM tax WHERE id = ?', [posTaxId]))[0].rate;
    assert.strictEqual(Number(profile.vat.rate), Number(posRate), 'VAT rate read from the POS tax row');
  });

  console.log('\n[checklist]');
  await test('checklist items are confirmed one by one and reset after an authorized related change', async () => {
    for (const entity of ['regulatory-class', 'provision-rule']) {
      const rows = (await call(SUPER, 'get', `${L}/params/${entity}?authStatus=PENDING`)).data.data.items;
      for (const r of rows) expectStatus(await call(SUPER, 'post', `${L}/params/${entity}/${r.id}/authorize`), 200, `authorize ${entity} ${r.id}`);
    }
    expectStatus(await call(SUPER, 'post', `${L}/checklist/GL_ROLE_MAPPINGS/confirm`), 409, 'held item');
    const confirmed = await call(SUPER, 'post', `${L}/checklist/PROVISION_POLICY/confirm`);
    expectStatus(confirmed, 200, 'confirm provision policy');
    const itemOf = (res, key) => res.data.data.checklistItems.find(i => i.itemKey === key);
    assert.strictEqual(itemOf(confirmed, 'PROVISION_POLICY').status, 'CONFIRMED');
    assert.strictEqual(itemOf(confirmed, 'DPD_CLASSIFICATION').status, 'UNCONFIRMED', 'other items unaffected');
    const row = await q("SELECT confirmedBy, snapshotJson FROM ln_checklist_confirmation WHERE itemKey = 'PROVISION_POLICY'");
    assert.strictEqual(row[0].confirmedBy, SUPER);
    assert.ok(JSON.parse(row[0].snapshotJson).length === 5, 'snapshot of the 5 authorized rules');

    const rule = (await call(SUPER, 'get', `${L}/params/provision-rule?regulatoryClassCode=CLASS_A`)).data.data.items[0];
    expectStatus(await call(ADMIN, 'put', `${L}/provision-rules/${rule.id}`, { provisionRate: '0.020000' }), 200, 'submit rate change');
    expectStatus(await call(SUPER, 'post', `${L}/checklist/PROVISION_POLICY/confirm`), 409, 'confirm while change pending');
    const change = (await call(SUPER, 'get', `${L}/changes`)).data.data.find(c => c.entityName === 'provision-rule');
    expectStatus(await call(SUPER, 'post', `${L}/changes/${change.id}/authorize`), 200, 'authorize rate change');
    assert.strictEqual(itemOf(await call(SUPER, 'get', `${L}/checklist`), 'PROVISION_POLICY').status, 'UNCONFIRMED');
  });

  console.log('\n[security api & ui support]');
  await test('my-permissions reflects group grants (CASHIER none, ADMIN loan incl. AUTHORIZE, SUPER_ADMIN grant matrix)', async () => {
    const perms = async id => (await call(id, 'get', '/api/security/my-permissions')).data.data.permissions;
    const [c, a, s] = await Promise.all([perms(CASHIER), perms(ADMIN), perms(SUPER)]);
    assert.ok(!Object.keys(c).some(k => k.startsWith('LN_')), 'cashier has no loan permissions');
    assert.ok(a.LN_PRODUCT && a.LN_PRODUCT.includes('AUTHORIZE'), 'admin can authorize products');
    assert.ok(!a.SEC_GRANT, 'admin cannot manage grants by default');
    assert.ok(s.SEC_GRANT && s.SEC_GRANT.includes('EDIT'), 'super admin manages grants');
  });
  await test('grant matrix: ADMIN refused, SUPER_ADMIN can grant and revoke; own SEC_GRANT EDIT cannot be removed', async () => {
    expectStatus(await call(ADMIN, 'get', '/api/security/matrix'), 403, 'admin views matrix');
    expectStatus(await call(SUPER, 'get', '/api/security/matrix'), 200, 'super views matrix');
    const cashierGroup = (await q("SELECT id FROM userGroup WHERE code = 'CASHIER'"))[0].id;
    const superGroup = (await q("SELECT id FROM userGroup WHERE code = 'SUPER_ADMIN'"))[0].id;
    const grant = granted => call(SUPER, 'put', '/api/security/grants', { userGroupId: cashierGroup, functionCode: 'LN_PRODUCT', actionCode: 'VIEW', granted });
    expectStatus(await grant(true), 200, 'grant');
    expectStatus(await call(CASHIER, 'get', `${L}/products`), 200, 'cashier view after grant');
    expectStatus(await grant(false), 200, 'revoke');
    expectStatus(await call(CASHIER, 'get', `${L}/products`), 403, 'cashier view after revoke');
    expectStatus(await call(SUPER, 'put', '/api/security/grants', { userGroupId: superGroup, functionCode: 'SEC_GRANT', actionCode: 'EDIT', granted: false }), 409, 'self lockout');
    expectStatus(await call(SUPER, 'put', '/api/security/grants', { userGroupId: cashierGroup, functionCode: 'LN_CHECKLIST', actionCode: 'DELETE', granted: true }), 400, 'non-applicable action');
  });
  await test('every sec_group_grant change is audited (who, group, function, action, before/after); no-ops and refusals are not', async () => {
    const cashierGroup = (await q("SELECT id FROM userGroup WHERE code = 'CASHIER'"))[0].id;
    const superGroup = (await q("SELECT id FROM userGroup WHERE code = 'SUPER_ADMIN'"))[0].id;
    const seedRows = Number((await q("SELECT COUNT(*) n FROM sec_audit_log WHERE source = 'SEED' AND userId IS NULL AND actionType = 'GRANT'"))[0].n);
    const seedGrants = Number((await q("SELECT COUNT(*) n FROM sec_group_grant WHERE grantedBy IS NULL"))[0].n);
    assert.ok(seedRows > 0 && seedRows === seedGrants, `seed grants audited once each (audit ${seedRows}, grants ${seedGrants}) even after seeding twice`);

    const lastId = Number((await q('SELECT COALESCE(MAX(id), 0) m FROM sec_audit_log'))[0].m);
    const body = granted => ({ userGroupId: cashierGroup, functionCode: 'LN_HOLIDAY', actionCode: 'VIEW', granted });
    expectStatus(await call(SUPER, 'put', '/api/security/grants', body(true)), 200, 'grant');
    const again = await call(SUPER, 'put', '/api/security/grants', body(true));
    expectStatus(again, 200, 'repeat grant');
    assert.strictEqual(again.data.message, 'No change');
    expectStatus(await call(SUPER, 'put', '/api/security/grants', body(false)), 200, 'revoke');
    expectStatus(await call(SUPER, 'put', '/api/security/grants', { userGroupId: superGroup, functionCode: 'SEC_GRANT', actionCode: 'EDIT', granted: false }), 409, 'self lockout');
    expectStatus(await call(ADMIN, 'put', '/api/security/grants', body(true)), 403, 'admin refused');

    const rows = await q('SELECT * FROM sec_audit_log WHERE id > ? ORDER BY id', [lastId]);
    assert.strictEqual(rows.length, 2, 'only the real grant and revoke are logged');
    const [g, r] = rows;
    for (const row of rows) {
      assert.strictEqual(Number(row.userId), SUPER);
      assert.strictEqual(Number(row.userGroupId), cashierGroup);
      assert.strictEqual(row.groupCode, 'CASHIER');
      assert.strictEqual(row.functionCode, 'LN_HOLIDAY');
      assert.strictEqual(row.actionCode, 'VIEW');
      assert.strictEqual(row.source, 'API');
      assert.ok(row.ipAddress, 'ip recorded');
    }
    assert.strictEqual(g.actionType, 'GRANT');
    assert.deepStrictEqual(JSON.parse(g.beforeValue), { granted: false });
    assert.deepStrictEqual(JSON.parse(g.afterValue), { granted: true });
    assert.strictEqual(r.actionType, 'REVOKE');
    const before = JSON.parse(r.beforeValue);
    assert.strictEqual(before.granted, true);
    assert.strictEqual(Number(before.grantedBy), SUPER);
    assert.deepStrictEqual(JSON.parse(r.afterValue), { granted: false });
    assert.strictEqual(Number((await q('SELECT COUNT(*) n FROM sec_group_grant WHERE userGroupId = ? AND functionCode = ?', [cashierGroup, 'LN_HOLIDAY']))[0].n), 0);
  });
  await test('migrate down --all refuses (entry rules, grant audit history) and changes nothing', async () => {
    const before = Number((await q("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name LIKE 'sec\\_%')"))[0].n);
    assert.throws(() => runNode('loan_migrate.js', ['down', '--all', '--yes']), (err) => /ln_accounting_entry_rule/.test(err.message) && /sec_audit_log/.test(err.message));
    const after = Number((await q("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name LIKE 'sec\\_%')"))[0].n);
    assert.strictEqual(after, before);
  });
  await test('accounting check endpoint: seeded products pass on the pending rule set; CASHIER refused; GL mappings stay view-only', async () => {
    const products = (await call(ADMIN, 'get', `${L}/products`)).data.data;
    for (const p of products.filter(x => x.status !== 'SUPERSEDED')) {
      const res = await call(ADMIN, 'get', `${L}/products/${p.id}/accounting-check?includePending=1`);
      expectStatus(res, 200, `check ${p.productCode}`);
      assert.deepStrictEqual(res.data.data.errors, [], `${p.productCode} rule set`);
      const auth = await call(ADMIN, 'get', `${L}/products/${p.id}/accounting-check`);
      assert.ok(!auth.data.data.ok && auth.data.data.errors.some(e => /Missing required leg/.test(e)), 'nothing authorized yet');
    }
    expectStatus(await call(CASHIER, 'get', `${L}/products/${products[0].id}/accounting-check`), 403, 'cashier');
    expectStatus(await call(ADMIN, 'post', `${L}/params/role-gl-mapping`, { roleCode: 'INTEREST_INCOME', chartAccountId: 1, effectiveFrom: '2026-11-01' }), 403, 'admin creates GL mapping');
  });
  await test('entry rules follow maker-checker under LN_ENTRY_RULE; LOAN_PORTFOLIO qualifier rule enforced', async () => {
    const base = { eventCode: 'ACCR', amountTag: 'INT_ACCR', drCr: 'DR', roleCode: 'INTEREST_RECEIVABLE', qualifierSource: 'NONE', effectiveFrom: '2026-12-01' };
    expectStatus(await call(ADMIN, 'post', `${L}/params/accounting-entry-rule`, { ...base, roleCode: 'LOAN_PORTFOLIO' }), 400, 'portfolio without qualifier');
    expectStatus(await call(ADMIN, 'post', `${L}/params/accounting-entry-rule`, { ...base, amountTag: 'NO_SUCH_TAG' }), 400, 'unknown tag');
    const created = await call(ADMIN, 'post', `${L}/params/accounting-entry-rule`, base);
    expectStatus(created, 201, 'create rule');
    const id = created.data.data.id;
    expectStatus(await call(ADMIN, 'post', `${L}/params/accounting-entry-rule/${id}/authorize`), 403, 'self authorize');
    expectStatus(await call(SUPER, 'post', `${L}/params/accounting-entry-rule/${id}/authorize`), 200, 'checker authorizes');
    expectStatus(await call(CASHIER, 'get', `${L}/params/accounting-entry-rule`), 403, 'cashier lists rules');
  });
  await test('banner status for any user, pending inbox filtered by grants, enums served by lookups', async () => {
    const st = await call(CASHIER, 'get', `${L}/status`);
    expectStatus(st, 200, 'status');
    assert.strictEqual(typeof st.data.data.warningBannerActive, 'boolean');
    const pendingSuper = (await call(SUPER, 'get', `${L}/pending`)).data.data;
    assert.ok(pendingSuper.length > 0 && pendingSuper.every(e => e.rows.length), 'super sees pending records');
    assert.deepStrictEqual((await call(CASHIER, 'get', `${L}/pending`)).data.data, [], 'cashier sees none');
    const enums = (await call(ADMIN, 'get', `${L}/lookups`)).data.data.enums;
    assert.deepStrictEqual(enums['product.feeFinancingMode'], ['CAPITALIZED', 'UPFRONT', 'DEDUCTED']);
  });

  console.log('\n[regression & safety]');
  await test('existing POS routes still respond (currency, product, trial balance)', async () => {
    expectStatus(await call(SUPER, 'get', '/api/currency/findAll'), 200, 'currency');
    expectStatus(await call(SUPER, 'get', '/api/product/find'), 200, 'product');
    expectStatus(await call(SUPER, 'get', '/api/gl/reports/trial-balance?startDate=2026-01-01&endDate=2026-12-31'), 200, 'trial balance');
  });
  await test('no SQL text in any error response', async () => {
    assert.deepStrictEqual(leaks, []);
  });
};

main()
  .catch((err) => {
    results.push({ name: 'runner', ok: false, err });
    console.error(`\nRunner error: ${err.stack || err.message}`);
  })
  .finally(() => {
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (API cwd/logs: ${RUN_DIR})`);
    process.exit(failed.length ? 1 : 0);
  });
