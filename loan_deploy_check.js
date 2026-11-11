/**
 * Loan module deploy check (T1). READ-ONLY: it changes nothing in the database and creates no files
 * (only --write-reference writes, one file, and only from a local database).
 *
 *   node loan_deploy_check.js --pre                  runbook step 1, before any migration
 *   node loan_deploy_check.js --schema               runbook step 5, after the migrations
 *   node loan_deploy_check.js --post [--url=<base>]  runbook step 7, after the first start (--url also checks 401 without a token)
 *   node loan_deploy_check.js --write-reference      developers only: rebuild loan_schema_reference.json from a local database
 *   Add --json for machine-readable output.
 *
 * Exit code: 0 no FAIL (read every WARN and MANUAL line); 1 at least one FAIL; 2 could not run.
 * Refuses non-local databases unless ALLOW_REMOTE=1 and CONFIRM_DB=<database> (see src/loan/dbGuard.js).
 * Run it from a folder outside the app. Credentials come from the environment and are never printed.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');

const REFERENCE_FILE = path.join(__dirname, 'loan_schema_reference.json');
const APP_ROOT = __dirname;
const MIN_MARIADB = [10, 3];
const LONG_TRANSACTION_SECONDS = 5;
const SPF_MAX_KEYS = 64;
const DISK_FACTOR = 3;
const REQUIRED_POS_TABLES = ['transactionEntry', 'chart_of_account', 'currency', 'user', 'userGroup', 'SPF', 'general_ledger', 'menuHeader'];
const POS_COLUMNS = [['chart_of_account', 'accountType'], ['transactionEntry', 'transactionType']];
const EXPECTED_SETTINGS = {
  LOAN_POSTING_ENABLED: 'false',
  BS_INCLUDE_LOAN_BOOK: 'false',
  LOAN_FX_REVAL_ENABLED: 'false',
  LOAN_ALLOW_SELF_AUTHORIZE: 'false',
  LOAN_MAX_BACKDATE_DAYS: '0',
  LOAN_FX_MAX_RATE_AGE_DAYS: '3',
  LOAN_FX_OVERRIDE_TOLERANCE_PCT: '0',
  LOAN_FX_MAX_ROUND_DIFF: '1',
  LOAN_FX_IMPLIED_RATE_TOLERANCE_PCT: '1.00',
  LOAN_FX_IMPLIED_RATE_BREACH: 'REFUSE',
  LOAN_DOC_MAX_MB: '5'
};

// ------------------------------------------------------------------------------------------ read-only session

const assertReadStatement = (sql) => {
  if (!/^\s*(SELECT|SHOW)\b/i.test(sql) || /;\s*\S/.test(sql)) throw new Error(`Refused: not a single read statement: ${String(sql).slice(0, 60)}`);
};

// The server refuses writes in this session; q refuses anything but a single SELECT or SHOW before it is sent.
const openSession = async (cfg, database) => {
  const mariadb = require('mariadb');
  const conn = await mariadb.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database, multipleStatements: false, connectTimeout: 10000 });
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  await conn.query('START TRANSACTION READ ONLY');
  const q = (sql, params) => { assertReadStatement(sql); return conn.query(sql, params); };
  const close = async () => { try { await conn.query('ROLLBACK'); } finally { await conn.end(); } };
  return { conn, q, close };
};

const report = () => {
  const rows = [];
  const add = (status, id, label, detail = '') => rows.push({ status, id, label, detail: String(detail) });
  return {
    rows,
    pass: (id, label, detail) => add('PASS', id, label, detail),
    warn: (id, label, detail) => add('WARN', id, label, detail),
    fail: (id, label, detail) => add('FAIL', id, label, detail),
    info: (id, label, detail) => add('INFO', id, label, detail),
    manual: (id, label, detail) => add('MANUAL', id, label, detail)
  };
};

const tableExists = async (q, table) => Number((await q('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table]))[0].n) > 0;

// ------------------------------------------------------------------------------------------ pure checks

const parseVersion = (text) => {
  const m = String(text).match(/^(\d+)\.(\d+)/);
  return { major: m ? Number(m[1]) : 0, minor: m ? Number(m[2]) : 0, mariadb: /mariadb/i.test(text) };
};

const versionVerdict = (text) => {
  const v = parseVersion(text);
  if (!v.mariadb) return { status: 'fail', detail: `${text}: the loan migrations are written and rehearsed for MariaDB only` };
  if (v.major < MIN_MARIADB[0] || (v.major === MIN_MARIADB[0] && v.minor < MIN_MARIADB[1])) return { status: 'fail', detail: `${text}: needs MariaDB ${MIN_MARIADB.join('.')} or later (instant ENUM change, runbook 4.5)` };
  return { status: 'pass', detail: text };
};

const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
};

// Never creates the folder or a test file: read-only
const documentDirVerdict = (dir, appRoot = APP_ROOT) => {
  if (!dir) return { status: 'fail', detail: 'LOAN_DOCUMENT_DIR is not set; the default is inside the app folder, where a redeploy can wipe it' };
  if (!path.isAbsolute(dir)) return { status: 'fail', detail: `${dir}: must be an absolute path` };
  if (dir.split(path.sep).includes('uploads')) return { status: 'fail', detail: `${dir}: must not be under an uploads folder (POS uploads are public, defect 11)` };
  if (isInside(path.resolve(dir), path.resolve(appRoot))) return { status: 'fail', detail: `${dir}: must be outside the app folder` };
  let real;
  try {
    real = fs.realpathSync(dir);
  } catch (err) {
    return { status: 'fail', detail: `${dir}: does not exist; create it, owned by the API user, mode 700` };
  }
  if (isInside(real, fs.realpathSync(appRoot))) return { status: 'fail', detail: `${dir} resolves to ${real}, inside the app folder` };
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) return { status: 'fail', detail: `${dir}: not a folder` };
  try {
    fs.accessSync(real, fs.constants.W_OK | fs.constants.X_OK);
  } catch (err) {
    return { status: 'fail', detail: `${dir}: not writable by this user; run this check as the API user` };
  }
  if (stat.mode & 0o077) return { status: 'warn', detail: `${dir}: mode ${(stat.mode & 0o777).toString(8)}; use 700 (personal documents)` };
  return { status: 'pass', detail: dir };
};

const applyVerdict = (r, id, label, verdict) => r[verdict.status](id, label, verdict.detail);

const freeBytes = (dir) => {
  const lines = execFileSync('df', ['-Pk', dir], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n');
  return Number(lines[lines.length - 1].trim().split(/\s+/)[3]) * 1024;
};

const mb = n => `${(Number(n) / 1048576).toFixed(1)} MB`;

const parseEnum = type => (String(type).match(/'((?:[^']|'')*)'/g) || []).map(v => v.slice(1, -1));

// ------------------------------------------------------------------------------------------ schema

const str = v => (v === null || v === undefined ? '<null>' : String(v));

const readSchema = async (q) => {
  const posFilter = POS_COLUMNS.map(() => '(table_name = ? AND column_name = ?)').join(' OR ');
  const tables = await q("SELECT table_name t, engine e, table_collation c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'ln\\_%'");
  const columns = await q(
    `SELECT table_name t, column_name n, column_type ty, is_nullable nu, column_default d, collation_name co, column_key k, extra x
     FROM information_schema.columns WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR ${posFilter})`,
    POS_COLUMNS.flat()
  );
  const indexes = await q("SELECT table_name t, index_name i, non_unique u, GROUP_CONCAT(column_name ORDER BY seq_in_index) c FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name LIKE 'ln\\_%' GROUP BY table_name, index_name, non_unique");
  const fks = await q("SELECT table_name t, constraint_name n, referenced_table_name r FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name LIKE 'ln\\_%'");
  const byText = (...fields) => (a, b) => {
    for (const f of fields) { if (a[f] < b[f]) return -1; if (a[f] > b[f]) return 1; }
    return 0;
  };
  return {
    tables: tables.map(r => ({ table: r.t, engine: str(r.e), collation: str(r.c) })).sort(byText('table')),
    columns: columns.map(r => ({ table: r.t, column: r.n, type: r.ty, nullable: r.nu, default: str(r.d), collation: str(r.co), key: r.k, extra: r.x })).sort(byText('table', 'column')),
    indexes: indexes.map(r => ({ table: r.t, index: r.i, nonUnique: String(r.u), columns: r.c })).sort(byText('table', 'index')),
    foreignKeys: fks.map(r => ({ table: r.t, constraint: r.n, references: r.r })).sort(byText('table', 'constraint'))
  };
};

// MariaDB reports "no default" two ways and timestamp defaults in mixed case
const normalizeDefault = (d) => {
  if (d === '<null>' || d === 'NULL') return '<null>';
  return /^current_timestamp/i.test(d) ? 'current_timestamp()' : d;
};

const isPosColumn = c => POS_COLUMNS.some(([t, n]) => t === c.table && n === c.column);

// The POS columns follow the customer's database: only the values the loan module needs are required (runbook step 5)
const comparePosColumn = (actual) => {
  const values = parseEnum(actual.type);
  if (actual.table === 'transactionEntry') {
    return values.slice(-2).join() === 'LOAN_IN,LOAN_OUT' ? null : `transactionEntry.transactionType: must end with LOAN_IN, LOAN_OUT; has ${values.slice(-2).join(', ')}`;
  }
  return values.includes('Off-Balance') ? null : "chart_of_account.accountType: 'Off-Balance' is missing";
};

const compareSchema = (reference, actual) => {
  const out = [];
  const diff = (items, keyOf, fields, labelOf, kind) => {
    const want = new Map(items.ref.map(x => [keyOf(x), x]));
    const got = new Map(items.act.map(x => [keyOf(x), x]));
    for (const [k, w] of want) {
      const g = got.get(k);
      if (!g) { out.push(`missing ${kind}: ${labelOf(w)}`); continue; }
      for (const f of fields) {
        const a = f === 'default' ? normalizeDefault(w[f]) : w[f];
        const b = f === 'default' ? normalizeDefault(g[f]) : g[f];
        if (a !== b) out.push(`${kind} ${labelOf(w)}: ${f} is ${b}, expected ${a}`);
      }
    }
    for (const [k, g] of got) if (!want.has(k)) out.push(`extra ${kind}: ${labelOf(g)}`);
  };
  diff({ ref: reference.tables, act: actual.tables }, x => x.table, ['engine', 'collation'], x => x.table, 'table');
  diff(
    { ref: reference.columns.filter(c => !isPosColumn(c)), act: actual.columns.filter(c => !isPosColumn(c)) },
    x => `${x.table}.${x.column}`, ['type', 'nullable', 'default', 'collation', 'key', 'extra'], x => `${x.table}.${x.column}`, 'column'
  );
  diff({ ref: reference.indexes, act: actual.indexes }, x => `${x.table}.${x.index}`, ['nonUnique', 'columns'], x => `${x.table}.${x.index}`, 'index');
  diff({ ref: reference.foreignKeys, act: actual.foreignKeys }, x => `${x.table}.${x.constraint}`, ['references'], x => `${x.table}.${x.constraint}`, 'foreign key');
  for (const [table, column] of POS_COLUMNS) {
    const c = actual.columns.find(x => x.table === table && x.column === column);
    if (!c) out.push(`missing column: ${table}.${column}`);
    else {
      const problem = comparePosColumn(c);
      if (problem) out.push(problem);
    }
  }
  return out;
};

const loadReference = () => JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8'));

const addSchemaResult = async (r, q, id) => {
  const differences = compareSchema(loadReference(), await readSchema(q));
  if (!differences.length) r.pass(id, 'Schema matches the reference', `${path.basename(REFERENCE_FILE)}: 0 differences`);
  else {
    r.fail(id, 'Schema differs from the reference', `${differences.length} difference(s)`);
    differences.forEach(d => r.fail(id, 'difference', d));
  }
  return differences;
};

// ------------------------------------------------------------------------------------------ modes

const runPre = async (q, r, cfg) => {
  const [{ v, cs, co, datadir }] = await q('SELECT VERSION() v, @@character_set_database cs, @@collation_database co, @@datadir datadir');
  applyVerdict(r, 'P1', 'Server version', versionVerdict(v));
  if (cs === 'utf8mb4') r.pass('P2', 'Database charset', `${cs} / ${co}`);
  else r.warn('P2', 'Database charset', `${cs} / ${co}: expected utf8mb4; loan tables state their own charset, but tell the accountant before going on`);

  const loanTables = Number((await q("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'ln\\_%'"))[0].n);
  if (loanTables === 0) r.pass('P3', 'No loan tables yet', '0 ln_ tables');
  else r.fail('P3', 'Loan tables already exist', `${loanTables} ln_ table(s): STOP. A loan build may already have started here; its startup sync creates tables the migration runner would treat as applied. Run --schema and escalate.`);

  const missing = [];
  for (const t of REQUIRED_POS_TABLES) if (!(await tableExists(q, t))) missing.push(t);
  if (missing.length) r.fail('P4', 'POS tables the loan module needs', `missing: ${missing.join(', ')}`);
  else r.pass('P4', 'POS tables the loan module needs', `${REQUIRED_POS_TABLES.length} present`);

  if (!missing.includes('transactionEntry')) {
    const [{ n }] = await q('SELECT COUNT(*) n FROM transactionEntry');
    const [size] = await q("SELECT data_length + index_length s FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'transactionEntry'");
    r.info('P5', 'transactionEntry size (note on the change sheet, step 4.5)', `${n} rows, ${mb(size.s)}`);
  }

  try {
    const [{ n, oldest }] = await q(`SELECT COUNT(*) n, MAX(TIMESTAMPDIFF(SECOND, trx_started, NOW())) oldest FROM information_schema.innodb_trx WHERE trx_mysql_thread_id <> CONNECTION_ID() AND TIMESTAMPDIFF(SECOND, trx_started, NOW()) > ${LONG_TRANSACTION_SECONDS}`);
    if (Number(n) === 0) r.pass('P6', 'No long transactions', `none older than ${LONG_TRANSACTION_SECONDS} s`);
    else r.warn('P6', 'Long transactions are open', `${n}, oldest ${oldest} s: the ALTER in step 4.5 waits for them and POS writes queue behind it`);
  } catch (err) {
    r.manual('P6', 'Long transactions', 'this user cannot read innodb_trx (PROCESS privilege); check SHOW PROCESSLIST by hand');
  }

  if (!missing.includes('SPF')) {
    const rows = await q("SELECT value FROM SPF WHERE code = 'USE_BUSINESS_DATE'");
    let date = 'unknown';
    if (await tableExists(q, 'businessDate')) {
      const [{ d }] = await q("SELECT DATE_FORMAT(MAX(currentDate), '%Y-%m-%d') d FROM businessDate");
      date = d;
    }
    r.info('P7', 'POS business date mode (customer question C4)', `USE_BUSINESS_DATE = ${rows.length ? rows[0].value : 'not set'}; POS date ${date}`);
    const [{ n }] = await q("SELECT COUNT(*) n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'SPF' AND seq_in_index = 1");
    if (Number(n) >= SPF_MAX_KEYS) r.info('P8', 'POS "Too many keys" note', `SPF has ${n} indexes: the POS startup sync logs this twice. Pre-existing, not caused by the loan module.`);
    else r.pass('P8', 'POS "Too many keys" note', `SPF has ${n} indexes`);
  }

  applyVerdict(r, 'P9', 'Document folder', documentDirVerdict(process.env.LOAN_DOCUMENT_DIR));

  const [{ size }] = await q('SELECT IFNULL(SUM(data_length + index_length), 0) size FROM information_schema.tables WHERE table_schema = DATABASE()');
  const needed = Number(size) * DISK_FACTOR;
  const local = ['127.0.0.1', 'localhost', '::1'].includes(String(cfg.host));
  let checkedData = false;
  if (local) {
    try {
      const free = freeBytes(datadir);
      checkedData = true;
      if (free >= needed) r.pass('P10', 'Free disk on the database volume', `${mb(free)} free; needs ${mb(needed)} (${DISK_FACTOR} x database size)`);
      else r.fail('P10', 'Free disk on the database volume', `${mb(free)} free; needs ${mb(needed)} (${DISK_FACTOR} x database size)`);
    } catch (err) { /* reported as manual below */ }
  }
  if (!checkedData) r.manual('P10', 'Free disk on the database volume', `df -h on the database server: at least ${mb(needed)} (${DISK_FACTOR} x database size)`);
  r.manual('P11', 'Free disk on the backup target', `df -h: at least ${mb(needed)}`);

  if (process.env.NO_SYNC === 'true') r.pass('P12', 'NO_SYNC for the migration session', 'true');
  else r.warn('P12', 'NO_SYNC for the migration session', 'not set: export NO_SYNC=true for steps 4 to 6, and do not start the API before step 7');
};

const checkUrl = url => new Promise((resolve) => {
  const client = url.startsWith('https:') ? https : http;
  const req = client.get(`${url.replace(/\/$/, '')}/api/loan/status`, { timeout: 5000 }, (res) => { res.resume(); resolve({ status: res.statusCode }); });
  req.on('timeout', () => { req.destroy(new Error('timed out')); });
  req.on('error', err => resolve({ error: err.message }));
});

const runPost = async (q, r, url) => {
  const placeholders = Object.keys(EXPECTED_SETTINGS).map(() => '?').join(',');
  const rows = await q(`SELECT code, value FROM SPF WHERE code IN (${placeholders})`, Object.keys(EXPECTED_SETTINGS));
  const values = new Map(rows.map(x => [x.code, x.value]));
  const wrong = Object.entries(EXPECTED_SETTINGS).filter(([k, v]) => values.get(k) !== v).map(([k, v]) => `${k} is ${values.has(k) ? values.get(k) : 'missing'}, expected ${v}`);
  if (wrong.length) wrong.forEach(w => r.fail('C1', 'Switches and settings', w));
  else r.pass('C1', 'Switches and settings', `all ${Object.keys(EXPECTED_SETTINGS).length} at their first-start values`);

  await addSchemaResult(r, q, 'C2');

  const count = async (sql, params) => Number((await q(sql, params))[0].n);
  if (await count('SELECT COUNT(*) n FROM ln_system_date') === 1) r.pass('C3', 'Loan system date', 'one row');
  else r.fail('C3', 'Loan system date', 'expected exactly one ln_system_date row: did the seeds run?');

  const seeded = [
    ['C4', 'Entry rules seeded', 'SELECT COUNT(*) n FROM ln_accounting_entry_rule'],
    ['C5', 'Loan functions seeded', "SELECT COUNT(*) n FROM sec_function WHERE moduleCode = 'LN' AND isActive = 1"],
    ['C6', 'SUPER_ADMIN holds loan grants', "SELECT COUNT(*) n FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE g.code = 'SUPER_ADMIN' AND s.functionCode LIKE 'LN\\_%'"],
    ['C7', 'Loan menu active', "SELECT COUNT(*) n FROM menuHeader WHERE code = 'LOAN' AND isActive = 1"]
  ];
  for (const [id, label, sql] of seeded) {
    const n = await count(sql);
    if (n > 0) r.pass(id, label, n);
    else r.fail(id, label, '0 rows: did the seeds run? (runbook step 6)');
  }

  const accounts = await count('SELECT COUNT(*) n FROM ln_account');
  const transactions = await count('SELECT COUNT(*) n FROM ln_transaction');
  if (accounts + transactions === 0) r.pass('C8', 'No loan business data yet', '0 accounts, 0 transactions');
  else r.warn('C8', 'Loan business data exists', `${accounts} accounts, ${transactions} transactions: expected none at first start`);

  const selfGranted = await count("SELECT COUNT(*) n FROM (SELECT userGroupId, functionCode FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE s.functionCode LIKE 'LN\\_%' AND g.code <> 'SUPER_ADMIN' AND s.actionCode IN ('CREATE', 'AUTHORIZE') GROUP BY userGroupId, functionCode HAVING COUNT(DISTINCT s.actionCode) = 2) x");
  if (selfGranted === 0) r.pass('C9', 'No group below SUPER_ADMIN holds CREATE and AUTHORIZE on one function', '0');
  else r.warn('C9', 'Groups hold CREATE and AUTHORIZE on one function', `${selfGranted} grant pair(s): maker and checker must be different people (UAT section 1)`);

  // Phase 6 Stage 3: the loan screens read lookups and the user's branch scope (header chip, selector) from
  // GET /api/loan/lookups, which needs LN_LOOKUP VIEW. The loan groups are created by hand (UAT section 1).
  const lookupMissing = [];
  const groupsAbsent = [];
  for (const code of LOAN_GROUPS) {
    const g = await q('SELECT id FROM userGroup WHERE code = ?', [code]);
    if (!g.length) { groupsAbsent.push(code); continue; }
    const n = await count("SELECT COUNT(*) n FROM sec_group_grant WHERE userGroupId = ? AND functionCode = 'LN_LOOKUP' AND actionCode = 'VIEW'", [g[0].id]);
    if (n === 0) lookupMissing.push(code);
  }
  if (lookupMissing.length) r.fail('C14', 'Loan groups hold LN_LOOKUP VIEW', `${lookupMissing.join(', ')} without LN_LOOKUP VIEW: their loan screens get no lookups and no branch chip/selector (UAT section 1)`);
  else if (groupsAbsent.length) r.warn('C14', 'Loan groups hold LN_LOOKUP VIEW', `not created yet: ${groupsAbsent.join(', ')} (UAT section 1); every existing one holds it`);
  else r.pass('C14', 'Loan groups hold LN_LOOKUP VIEW', `all ${LOAN_GROUPS.length}`);

  applyVerdict(r, 'C10', 'Document folder', documentDirVerdict(process.env.LOAN_DOCUMENT_DIR));

  if (url) {
    const res = await checkUrl(url);
    if (res.status === 401) r.pass('C11', 'GET /api/loan/status without a token', '401');
    else r.fail('C11', 'GET /api/loan/status without a token', res.error ? `no answer: ${res.error}` : `${res.status}, expected 401`);
  } else r.manual('C11', 'GET /api/loan/status without a token', 'expect 401, or pass --url=<base> to check it here');
  r.manual('C12', 'Log in as SUPER_ADMIN', '"Vehicle Financing" menu visible; Parameter Studio opens; banner shows posting off');
  r.manual('C13', 'Test document upload', 'once a test account exists: the file lands in LOAN_DOCUMENT_DIR, never in uploads/');
};

const writeReference = async (q, cfg, database) => {
  if (!['127.0.0.1', 'localhost', '::1'].includes(String(cfg.host))) throw new Error('--write-reference needs a local database, whatever ALLOW_REMOTE says');
  const schema = await readSchema(q);
  const [{ v }] = await q('SELECT VERSION() v');
  const reference = {
    description: 'Loan module schema reference: ln_* tables (columns, indexes, foreign keys, engine, collation) and the two POS columns the loan migrations change. Read by loan_deploy_check.js (runbook steps 5 and 7). Rebuild it with --write-reference from a fresh local copy after loan_migrate.js up, whenever a loan migration changes the schema.',
    generatedFrom: `local ${database}, ${v}`,
    ...schema
  };
  fs.writeFileSync(REFERENCE_FILE, `${JSON.stringify(reference, null, 1)}\n`);
  return reference;
};

// ------------------------------------------------------------------------------------------ main

// The loan groups documented in UAT section 1 (created by hand in the security screen)
const LOAN_GROUPS = ['LOAN_CASHIER', 'LOAN_MANAGER', 'LOAN_CHECKER', 'LOAN_ACCOUNTANT', 'LOAN_HO_CHECKER'];

const USAGE = 'Use one of --pre | --schema | --post [--url=<base>] | --write-reference; optional --json';

const print = (rows, json, title) => {
  const counts = rows.reduce((acc, x) => { acc[x.status] = (acc[x.status] || 0) + 1; return acc; }, {});
  if (json) { console.log(JSON.stringify({ mode: title, counts, rows }, null, 1)); return; }
  console.log(`\nLoan deploy check ${title}`);
  for (const x of rows) console.log(`[${x.status.padEnd(6)}] ${x.id.padEnd(4)} ${x.label}${x.detail ? `: ${x.detail}` : ''}`);
  console.log(`\n${counts.FAIL || 0} FAIL, ${counts.WARN || 0} WARN, ${counts.MANUAL || 0} MANUAL, ${counts.PASS || 0} PASS, ${counts.INFO || 0} INFO`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const urlArg = args.find(a => a.startsWith('--url='));
  const modes = args.filter(a => ['--pre', '--schema', '--post', '--write-reference'].includes(a));
  const unknown = args.filter(a => !modes.includes(a) && a !== '--json' && a !== urlArg);
  if (modes.length !== 1 || unknown.length) throw new Error(USAGE);
  const mode = modes[0];

  const { assertLocalDb, resolveConfig } = require('./src/loan/dbGuard');
  // The guard prints the target; keep --json output clean by sending that line to stderr
  const log = console.log;
  console.log = (...a) => console.error(...a);
  let target;
  try { target = assertLocalDb('loan_deploy_check'); } finally { console.log = log; }
  const cfg = resolveConfig();
  if (mode === '--write-reference' && !['127.0.0.1', 'localhost', '::1'].includes(String(cfg.host))) throw new Error('--write-reference needs a local database, whatever ALLOW_REMOTE says');

  const session = await openSession(cfg, target.database);
  const r = report();
  try {
    if (mode === '--pre') await runPre(session.q, r, cfg);
    if (mode === '--schema') await addSchemaResult(r, session.q, 'S1');
    if (mode === '--post') await runPost(session.q, r, urlArg ? urlArg.slice('--url='.length) : null);
    if (mode === '--write-reference') {
      const ref = await writeReference(session.q, cfg, target.database);
      console.log(`Wrote ${REFERENCE_FILE}: ${ref.tables.length} tables, ${ref.columns.length} columns, ${ref.indexes.length} indexes, ${ref.foreignKeys.length} foreign keys`);
      return 0;
    }
  } finally {
    await session.close();
  }
  print(r.rows, json, mode);
  return r.rows.some(x => x.status === 'FAIL') ? 1 : 0;
};

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      console.error(`loan_deploy_check could not run: ${err.message}`);
      process.exitCode = 2;
    });
}

module.exports = { assertReadStatement, openSession, parseVersion, versionVerdict, documentDirVerdict, compareSchema, normalizeDefault, parseEnum };
