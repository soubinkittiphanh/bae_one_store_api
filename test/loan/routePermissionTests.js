/**
 * T4: route permissions of the loan module (security checklist 1.1, 1.2, 1.6, 1.12), run from run.js.
 *
 *  - auditRouter walks the real router against routeManifest.js: token first, every route guarded,
 *    the guard before anything that parses a request, the action fits the verb, and (Phase 6) exactly one
 *    branch scope guard right after the permission guard, of the kind the manifest declares.
 *  - No token, bad token and no grant are sent to the running API on every route: each is refused before
 *    a controller runs, so this is safe for POST /eod/run and the like.
 *  - The role matrix runs the real validateToken and requirePermission against the real sec_group_grant
 *    rows with the controllers replaced by a stub: allowed routes are reached without changing any data.
 */
const assert = require('assert');
const net = require('net');
const express = require('express');
const axios = require('axios');
const { ROUTES, TOKEN_ONLY, READ_ONLY_POSTS, GROUPS, SUPER_ADMIN_ONLY_PARAMS } = require('./routeManifest');

const key = (method, path) => `${method} ${path}`;

// Load src/loan/router.js with requirePermission tagging its middleware; production code has no such tag.
const loadTaggedRouter = () => {
  const security = require('../../src/security/middleware');
  const original = security.requirePermission;
  const routerPath = require.resolve('../../src/loan/router');
  delete require.cache[routerPath];
  security.requirePermission = (functionCode, actionCode) => {
    const middleware = original(functionCode, actionCode);
    middleware.permission = { functionCode, actionCode };
    return middleware;
  };
  try {
    return require(routerPath);
  } finally {
    security.requirePermission = original;
    delete require.cache[routerPath];
  }
};

const dynamicName = (functionCode) => {
  if (typeof functionCode !== 'function') return functionCode;
  if (functionCode.name === 'entityFunction') return '{entity}';
  if (functionCode.name === 'changeFunction') return '{change}';
  return `{unknown:${functionCode.name || 'anonymous'}}`;
};

// Returns a list of problems; empty means the router matches the rules. Pure, so it can be tested on bad routers.
const SCOPE_KINDS = ['account', 'transaction', 'application', 'document', 'sale', 'list', 'all-branches', 'global'];

const auditRouter = (router, { validateToken, routes = ROUTES, tokenOnly = TOKEN_ONLY, readOnlyPosts = READ_ONLY_POSTS }) => {
  const problems = [];
  const seen = new Map();
  let tokenChecked = false;

  for (const layer of router.stack) {
    if (!layer.route) {
      if (layer.handle === validateToken) tokenChecked = true;
      continue;
    }
    if (!tokenChecked) problems.push(`${layer.route.path}: declared before router.use(validateToken)`);
    for (const method of Object.keys(layer.route.methods).map(m => m.toUpperCase())) {
      const id = key(method, layer.route.path);
      const handlers = layer.route.stack.map(s => s.handle);
      const guards = handlers.filter(h => h.permission);
      const permission = guards[0] ? guards[0].permission : null;
      const scopes = handlers.filter(h => h.scope);
      if (seen.has(id)) problems.push(`${id}: declared twice`);
      seen.set(id, { ...(permission ? { fn: dynamicName(permission.functionCode), action: permission.actionCode } : { fn: null, action: null }), scope: scopes[0] ? scopes[0].scope : null });
      if (scopes.length === 0) problems.push(`${id}: no branch scope guard`);
      if (scopes.length > 1) problems.push(`${id}: more than one branch scope guard`);
      if (scopes.length && handlers.indexOf(scopes[0]) !== (permission ? handlers.indexOf(guards[0]) + 1 : 0)) problems.push(`${id}: the branch scope guard must run right after the permission check`);
      if (guards.length > 1) problems.push(`${id}: more than one permission middleware`);
      if (permission && handlers[0] !== guards[0]) problems.push(`${id}: something runs before the permission check`);
      if (!permission && !tokenOnly[id]) problems.push(`${id}: no permission middleware and not on the token-only list`);
      if (!permission && method !== 'GET') problems.push(`${id}: a token-only route must be GET`);
      if (permission) {
        const { actionCode: action } = permission;
        if (method === 'GET' && action !== 'VIEW') problems.push(`${id}: GET must use VIEW, uses ${action}`);
        if (method === 'PUT' && action !== 'EDIT') problems.push(`${id}: PUT must use EDIT, uses ${action}`);
        if (method === 'DELETE' && action !== 'DELETE') problems.push(`${id}: DELETE must use DELETE, uses ${action}`);
        if (method === 'POST' && action === 'VIEW' && !readOnlyPosts.includes(id)) problems.push(`${id}: POST with VIEW is not on the read-only list`);
      }
    }
  }

  const declared = new Map(routes.map(([method, path, fn, action, scope]) => [key(method, path), { fn, action, scope }]));
  for (const [id, want] of declared) {
    const got = seen.get(id);
    if (!SCOPE_KINDS.includes(want.scope)) problems.push(`${id}: manifest scope "${want.scope}" is not one of ${SCOPE_KINDS.join(', ')}`);
    if (!got) problems.push(`${id}: in the manifest, not in the router`);
    else {
      if (got.fn !== want.fn || got.action !== want.action) problems.push(`${id}: router has ${got.fn} ${got.action}, manifest has ${want.fn} ${want.action}`);
      if (got.scope && got.scope !== want.scope) problems.push(`${id}: router scope ${got.scope}, manifest scope ${want.scope}`);
    }
  }
  for (const id of seen.keys()) if (!declared.has(id)) problems.push(`${id}: in the router, not in the manifest`);
  for (const id of Object.keys(tokenOnly)) if (!declared.has(id) || declared.get(id).fn !== null) problems.push(`${id}: on the token-only list but not a token-only route`);
  return problems;
};

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

module.exports = async ({ test, call, q, baseUrl, users, L, expectStatus }) => {
  const { SUPER } = users;
  const { validateToken } = require('../../src/api/jwtApi');
  const { ENTITIES } = require('../../src/loan/services/paramRegistry');
  const entities = Object.entries(ENTITIES).map(([name, def]) => ({ name, functionCode: def.functionCode }));
  const samplePath = (path, entity = entities[0].name, changeId = 1) => path
    .replace(':entity', entity)
    .replace(':itemKey', 'x')
    .replace(':code', 'x')
    .replace(':kind', 'status')
    .replace('/changes/:id', `/changes/${changeId}`)
    .replace(/:\w+/g, '1');
  const axiosMethod = m => m.toLowerCase();
  let router;

  await test('T4 the route audit catches a bad router: no token first, unguarded route, guard after a parser, wrong action, unlisted or missing route, missing/doubled/misplaced/wrong branch scope', async () => {
    const guard = (fn, action) => { const h = (req, res, next) => next(); h.permission = { functionCode: fn, actionCode: action }; return h; };
    const sc = (kind) => { const h = (req, res, next) => next(); h.scope = kind; return h; };
    const handler = (req, res) => res.end();
    const opts = (routes, extra = {}) => ({ validateToken, routes, tokenOnly: {}, readOnlyPosts: [], ...extra });
    const audit = (build, routes, extra) => { const r = express.Router(); build(r); return auditRouter(r, opts(routes, extra)); };
    const has = (problems, text) => assert.ok(problems.some(p => p.includes(text)), `expected "${text}" in ${JSON.stringify(problems)}`);

    assert.deepStrictEqual(audit((r) => { r.use(validateToken); r.get('/a', guard('F', 'VIEW'), sc('global'), handler); }, [['GET', '/a', 'F', 'VIEW', 'global']]), [], 'a correct router passes');
    has(audit((r) => { r.get('/a', guard('F', 'VIEW'), sc('global'), handler); r.use(validateToken); }, [['GET', '/a', 'F', 'VIEW', 'global']]), 'before router.use(validateToken)');
    has(audit((r) => { r.get('/a', guard('F', 'VIEW'), sc('global'), handler); }, [['GET', '/a', 'F', 'VIEW', 'global']]), 'before router.use(validateToken)');
    has(audit((r) => { r.use(validateToken); r.post('/a', handler); }, [['POST', '/a', null, null, 'global']]), 'no permission middleware');
    has(audit((r) => { r.use(validateToken); r.post('/a', handler); }, [['POST', '/a', null, null, 'global']], { tokenOnly: { 'POST /a': 'x' } }), 'token-only route must be GET');
    has(audit((r) => { r.use(validateToken); r.post('/a', handler, guard('F', 'CREATE'), sc('global'), handler); }, [['POST', '/a', 'F', 'CREATE', 'global']]), 'before the permission check');
    has(audit((r) => { r.use(validateToken); r.get('/a', guard('F', 'CREATE'), sc('global'), handler); }, [['GET', '/a', 'F', 'CREATE', 'global']]), 'GET must use VIEW');
    has(audit((r) => { r.use(validateToken); r.put('/a', guard('F', 'VIEW'), sc('global'), handler); }, [['PUT', '/a', 'F', 'VIEW', 'global']]), 'PUT must use EDIT');
    has(audit((r) => { r.use(validateToken); r.delete('/a', guard('F', 'EDIT'), sc('global'), handler); }, [['DELETE', '/a', 'F', 'EDIT', 'global']]), 'DELETE must use DELETE');
    has(audit((r) => { r.use(validateToken); r.post('/a', guard('F', 'VIEW'), sc('global'), handler); }, [['POST', '/a', 'F', 'VIEW', 'global']]), 'not on the read-only list');
    has(audit((r) => { r.use(validateToken); r.get('/new', guard('F', 'VIEW'), sc('global'), handler); }, []), 'in the router, not in the manifest');
    has(audit((r) => { r.use(validateToken); }, [['GET', '/gone', 'F', 'VIEW', 'global']]), 'in the manifest, not in the router');
    has(audit((r) => { r.use(validateToken); r.get('/a', guard('G', 'VIEW'), sc('global'), handler); }, [['GET', '/a', 'F', 'VIEW', 'global']]), 'router has G VIEW, manifest has F VIEW');
    // Phase 6 branch scope: missing, doubled, misplaced, or of another kind than the manifest
    has(audit((r) => { r.use(validateToken); r.get('/a', guard('F', 'VIEW'), handler); }, [['GET', '/a', 'F', 'VIEW', 'global']]), 'no branch scope guard');
    has(audit((r) => { r.use(validateToken); r.get('/a', guard('F', 'VIEW'), sc('global'), sc('list'), handler); }, [['GET', '/a', 'F', 'VIEW', 'global']]), 'more than one branch scope guard');
    has(audit((r) => { r.use(validateToken); r.get('/a', guard('F', 'VIEW'), handler, sc('global')); }, [['GET', '/a', 'F', 'VIEW', 'global']]), 'right after the permission check');
    has(audit((r) => { r.use(validateToken); r.get('/a', guard('F', 'VIEW'), sc('global'), handler); }, [['GET', '/a', 'F', 'VIEW', 'account']]), 'router scope global, manifest scope account');
    has(audit((r) => { r.use(validateToken); r.get('/a', guard('F', 'VIEW'), sc('global'), handler); }, [['GET', '/a', 'F', 'VIEW', 'everywhere']]), 'is not one of');
  });

  await test(`T4 the real router matches the manifest (${ROUTES.length} routes): token first, permission before any parser, action fits the verb, only /status and /pending are token-only, every route has the branch scope the manifest declares`, async () => {
    router = loadTaggedRouter();
    assert.deepStrictEqual(auditRouter(router, { validateToken }), []);
    assert.strictEqual(ROUTES.filter(r => r[2] === null).length, 2);
    assert.strictEqual(Object.keys(TOKEN_ONLY).length, 2);
  });

  await test('T4 negative: when the real router is tampered with, the audit fails — a permission guard stripped from a live route, and a fresh unguarded route added', async () => {
    // A separate tagged instance so the shared `router` used by later tests is untouched.
    const strip = (findPath) => {
      const r = loadTaggedRouter();
      const layer = r.stack.find(l => l.route && l.route.path === findPath);
      assert.ok(layer, `route ${findPath} exists to tamper with`);
      // Remove the permission middleware, as if someone deleted the can(...) from this line.
      layer.route.stack = layer.route.stack.filter(s => !s.handle.permission);
      return r;
    };
    // 1. A real guarded GET loses its permission guard: it is now token-only but not on the allow-list.
    const stripped = strip('/reports/portfolio');
    const p1 = auditRouter(stripped, { validateToken });
    assert.ok(p1.some(p => p.includes('GET /reports/portfolio') && p.includes('no permission middleware and not on the token-only list')), `expected an unguarded-route problem, got ${JSON.stringify(p1)}`);

    // 2. A new route is mounted with no guard at all (e.g. a careless addition).
    const added = loadTaggedRouter();
    added.get('/reports/secret-leak', (req, res) => res.json({}));
    const p2 = auditRouter(added, { validateToken });
    assert.ok(p2.some(p => p.includes('GET /reports/secret-leak') && p.includes('in the router, not in the manifest')), `expected an unlisted-route problem, got ${JSON.stringify(p2)}`);

    // 3. A guarded route whose action is downgraded (AUTHORIZE -> VIEW on a mutation) is caught as a mismatch.
    const downgraded = loadTaggedRouter();
    const authLayer = downgraded.stack.find(l => l.route && l.route.path === '/transactions/:txId/authorize');
    const guardLayer = authLayer.route.stack.find(s => s.handle.permission);
    guardLayer.handle.permission = { functionCode: 'LN_TRANSACTION', actionCode: 'VIEW' };
    const p3 = auditRouter(downgraded, { validateToken });
    assert.ok(p3.some(p => p.includes('POST /transactions/:txId/authorize: router has LN_TRANSACTION VIEW, manifest has LN_TRANSACTION AUTHORIZE')), `expected a permission-mismatch problem, got ${JSON.stringify(p3)}`);

    // 4. A by-id route's branch scope is swapped for 'global' (as if scoped('account') were edited away).
    const unscoped = loadTaggedRouter();
    const accLayer = unscoped.stack.find(l => l.route && l.route.path === '/accounts/:id' && l.route.methods.get);
    const scopeLayer = accLayer.route.stack.find(s => s.handle.scope);
    const swapped = (req, res, next) => next();
    swapped.scope = 'global';
    scopeLayer.handle = swapped;
    const p4 = auditRouter(unscoped, { validateToken });
    assert.ok(p4.some(p => p.includes('GET /accounts/:id: router scope global, manifest scope account')), `expected a scope-mismatch problem, got ${JSON.stringify(p4)}`);

    // The shared router is still clean after all this tampering on separate instances.
    assert.deepStrictEqual(auditRouter(router, { validateToken }), [], 'the shared router was not affected');
  });

  await test('T4 every function and action a route needs exists, is active and is applicable; so does every parameter entity\'s function', async () => {
    const rows = await q("SELECT functionCode f, applicableActions a, isActive i FROM sec_function WHERE moduleCode = 'LN'");
    const fns = new Map(rows.map(r => [r.f, { active: Boolean(r.i), actions: r.a.split(',').map(x => x.trim()) }]));
    const missing = [];
    const need = (fn, action, where) => {
      const def = fns.get(fn);
      if (!def || !def.active || !def.actions.includes(action)) missing.push(`${where}: ${fn} ${action}`);
    };
    for (const [method, path, fn, action] of ROUTES) {
      if (fn && !fn.startsWith('{')) need(fn, action, key(method, path));
      if (fn === '{entity}' || fn === '{change}') for (const e of entities) need(e.functionCode, action, `${key(method, path)} [${e.name}]`);
    }
    assert.deepStrictEqual(missing, []);
  });

  await test('T4 no token on every route: 401; a tampered token: 403; no controller is reached', async () => {
    for (const [method, path] of ROUTES) {
      const url = `${baseUrl}${L}${samplePath(path)}`;
      const none = await axios({ method: axiosMethod(method), url, validateStatus: () => true });
      assert.strictEqual(none.status, 401, `${key(method, path)} without a token: ${none.status}`);
      const bad = await axios({ method: axiosMethod(method), url, validateStatus: () => true, headers: { Authorization: 'Bearer not.a.token' } });
      assert.strictEqual(bad.status, 403, `${key(method, path)} with a bad token: ${bad.status}`);
    }
  });

  // Test users and groups: one per proposed role, one with no grants, one inactive user holding full manager grants.
  const addGroup = async (code) => {
    await q("INSERT INTO userGroup (name, code, isActive, createdAt, updateTimestamp, homePage) VALUES (?, ?, 1, NOW(), NOW(), '/')", [code, code]);
    return Number((await q('SELECT id FROM userGroup WHERE code = ?', [code]))[0].id);
  };
  const addUser = async (name, groupId, isActive = 1) => {
    await q('INSERT INTO user (cus_id, cus_pass, cus_name, isActive, createdAt, updateTimestamp, groupId) VALUES (?, ?, ?, ?, NOW(), NOW(), ?)', [name, '!not-a-login', name, isActive, groupId]);
    return Number((await q('SELECT id FROM user WHERE cus_id = ?', [name]))[0].id);
  };
  const sec = await q("SELECT functionCode f, applicableActions a FROM sec_function WHERE moduleCode = 'LN'");
  const ownRowFunctions = new Set(Object.values(GROUPS).flatMap(g => Object.keys(g)).filter(f => f !== '*params'));
  const fullParam = 'VIEW,CREATE,EDIT,DELETE,AUTHORIZE';
  const paramFunctions = sec.filter(r => r.a === fullParam && !ownRowFunctions.has(r.f) && !SUPER_ADMIN_ONLY_PARAMS.includes(r.f)).map(r => r.f);

  const grantsOf = (role) => {
    const set = new Set();
    for (const [fn, actions] of Object.entries(GROUPS[role])) {
      for (const f of fn === '*params' ? paramFunctions : [fn]) for (const a of actions) set.add(`${f}:${a}`);
    }
    return set;
  };

  const userIds = {};
  await test('T4 the proposed groups keep the UAT rule: nobody holds CREATE or EDIT and AUTHORIZE on the same function', async () => {
    for (const role of Object.keys(GROUPS)) {
      const grants = grantsOf(role);
      const both = [...grants].filter(g => g.endsWith(':AUTHORIZE') && (grants.has(g.replace(':AUTHORIZE', ':CREATE')) || grants.has(g.replace(':AUTHORIZE', ':EDIT'))));
      assert.deepStrictEqual(both, [], `${role}`);
      const groupId = await addGroup(`T4_${role}`);
      for (const g of grants) {
        const [f, a] = g.split(':');
        await q('INSERT INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, ?, ?)', [groupId, f, a]);
      }
      userIds[role] = await addUser(`t4_${role.toLowerCase()}`, groupId);
    }
    userIds.NONE = await addUser('t4_none', await addGroup('T4_NONE'));
    const inactiveGroup = await addGroup('T4_INACTIVE');
    for (const g of grantsOf('LOAN_MANAGER')) {
      const [f, a] = g.split(':');
      await q('INSERT INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, ?, ?)', [inactiveGroup, f, a]);
    }
    userIds.INACTIVE = await addUser('t4_inactive', inactiveGroup, 0);
    userIds.NOGROUP = await addUser('t4_nogroup', null);
  });

  // A real change row, so '/changes/:id/*' resolves its function like production does
  let change;
  const changeFunction = async () => {
    if (change) return change;
    const rows = await q('SELECT id, entityName FROM ln_param_change ORDER BY id LIMIT 1');
    assert.ok(rows.length, 'earlier tests leave at least one ln_param_change row');
    const def = entities.find(e => e.name === rows[0].entityName);
    assert.ok(def, `entity ${rows[0].entityName} is in the registry`);
    change = { id: Number(rows[0].id), functionCode: def.functionCode };
    return change;
  };

  await test('T4 a user with no grants, no group, or inactive is refused on every guarded route of the running API (403); /status and /pending answer with no parameter data', async () => {
    const c = await changeFunction();
    for (const who of ['NONE', 'NOGROUP', 'INACTIVE']) {
      for (const [method, path, fn] of ROUTES) {
        const res = await call(userIds[who], axiosMethod(method), `${L}${samplePath(path, entities[0].name, c.id)}`);
        if (fn) expectStatus(res, 403, `${who} ${key(method, path)}`);
      }
      const status = await call(userIds[who], 'get', `${L}/status`);
      expectStatus(status, 200, `${who} status`);
      assert.deepStrictEqual(Object.keys(status.data.data).sort(), ['confirmationStatus', 'warningBannerActive'], 'the banner returns only these two fields');
      assert.deepStrictEqual((await call(userIds[who], 'get', `${L}/pending`)).data.data, [], `${who} sees no pending records`);
    }
  });

  await test('T4 unknown parameter entity and unknown change id: 404 from the guard, even for SUPER_ADMIN', async () => {
    expectStatus(await call(SUPER, 'get', `${L}/params/no-such-entity`), 404, 'entity');
    expectStatus(await call(SUPER, 'post', `${L}/changes/99999999/authorize`), 404, 'change');
  });

  await test('T4 role matrix: for each proposed group (LOAN_CASHIER, LOAN_MANAGER, LOAN_CHECKER, LOAN_ACCOUNTANT), every route for every parameter entity is reached or refused exactly as phase6-uat.md section 1 says, on the real guard with stub controllers', async () => {
    const c = await changeFunction();
    const app = express();
    const reached = (req, res) => res.status(200).json({ reached: true });
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const guards = layer.route.stack.map(s => s.handle).filter(h => h.permission);
      for (const method of Object.keys(layer.route.methods)) app[method](layer.route.path, validateToken, ...guards, reached);
    }
    const port = await freePort();
    const server = await new Promise((resolve) => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
    const jwt = require('jsonwebtoken');
    const secret = require('../../src/config').actksecret;
    const send = (userId, method, path) => axios({
      method: axiosMethod(method), url: `http://127.0.0.1:${port}${path}`, validateStatus: () => true,
      headers: { Authorization: `Bearer ${jwt.sign({ id: userId, cus_name: 't4' }, secret, { expiresIn: '1h' })}` }
    });
    const wrong = [];
    const totals = {};
    try {
      for (const role of Object.keys(GROUPS)) {
        const grants = grantsOf(role);
        const count = { allowed: 0, refused: 0 };
        for (const [method, path, fn, action] of ROUTES) {
          const cases = fn === '{entity}'
            ? entities.map(e => ({ path: samplePath(path, e.name, c.id), functionCode: e.functionCode, label: e.name }))
            : [{ path: samplePath(path, entities[0].name, c.id), functionCode: fn === '{change}' ? c.functionCode : fn, label: '' }];
          for (const one of cases) {
            const expected = one.functionCode === null || grants.has(`${one.functionCode}:${action}`) ? 200 : 403;
            const res = await send(userIds[role], method, one.path);
            count[expected === 200 ? 'allowed' : 'refused'] += 1;
            if (res.status !== expected) wrong.push(`${role} ${key(method, path)} ${one.label}: expected ${expected}, got ${res.status}`);
          }
        }
        totals[role] = count;
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
    console.log(`        role matrix: ${Object.entries(totals).map(([r, n]) => `${r} ${n.allowed} allowed, ${n.refused} refused`).join('; ')}`);
    assert.deepStrictEqual(wrong, []);
    assert.ok(totals.LOAN_CASHIER.allowed < totals.LOAN_CHECKER.allowed && totals.LOAN_CASHIER.allowed < totals.LOAN_MANAGER.allowed, 'a cashier reaches the fewest routes');
  });

  await test('T4 every route each proposed role is refused by the matrix is also refused by the running API (403)', async () => {
    const c = await changeFunction();
    for (const role of Object.keys(GROUPS)) {
      const grants = grantsOf(role);
      for (const [method, path, fn, action] of ROUTES) {
        const functionCode = fn === '{entity}' ? entities[0].functionCode : fn === '{change}' ? c.functionCode : fn;
        if (functionCode && !grants.has(`${functionCode}:${action}`)) expectStatus(await call(userIds[role], axiosMethod(method), `${L}${samplePath(path, entities[0].name, c.id)}`), 403, `${role} ${key(method, path)}`);
      }
    }
  });

  await test('T4 GET /pending shows each role only entities whose function it may VIEW', async () => {
    for (const role of Object.keys(GROUPS)) {
      const grants = grantsOf(role);
      const rows = (await call(userIds[role], 'get', `${L}/pending`)).data.data;
      for (const row of rows) {
        const def = entities.find(e => e.name === (row.entity || row.entityName));
        assert.ok(def, `${role}: unknown pending row ${JSON.stringify(Object.keys(row))}`);
        assert.ok(grants.has(`${def.functionCode}:VIEW`), `${role} sees ${def.name} without VIEW on ${def.functionCode}`);
      }
    }
    assert.ok((await call(SUPER, 'get', `${L}/pending`)).data.data.length > 0, 'the test has pending rows to filter');
  });

  await test('T4 the two read-only POSTs write nothing: simulate and all four previews leave every ln_ table, sequence and POS ledger unchanged', async () => {
    const tables = (await q("SELECT table_name t FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name IN ('general_ledger', 'transactionEntry'))")).map(r => r.t);
    const state = async () => {
      const counts = {};
      for (const t of tables) counts[t] = Number((await q(`SELECT COUNT(*) n FROM \`${t}\``))[0].n);
      const checksums = await q('CHECKSUM TABLE ln_account, ln_schedule, ln_numbering_sequence, ln_account_balance EXTENDED');
      return JSON.stringify({ counts, checksums }, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
    };
    const account = (await q("SELECT id FROM ln_account WHERE accountStage = 'DISBURSED' ORDER BY id LIMIT 1"))[0];
    const product = (await q("SELECT p.id FROM ln_product p WHERE p.authStatus = 'AUTHORIZED' AND p.status = 'ACTIVE' ORDER BY p.id LIMIT 1"))[0];
    const date = (await q("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1"))[0].d;
    assert.ok(account && product, 'earlier tests leave an account and a product');
    const before = await state();
    expectStatus(await call(SUPER, 'post', `${L}/products/${product.id}/simulate`, { principal: '240000000', interestRate: '0.18', tenorMonths: 12, valueDate: date }), 200, 'simulate');
    for (const [kind, body] of [['due-date', { date }], ['payment', { date, amount: '1000' }], ['prepayment', { date }], ['status', { date }]]) {
      expectStatus(await call(SUPER, 'post', `${L}/accounts/${account.id}/preview/${kind}`, body), 200, `preview ${kind}`);
    }
    assert.strictEqual(await state(), before);
  });

  await test('T4 preview/:kind for a write kind needs LN_TRANSACTION CREATE (not just LN_ACCOUNT VIEW); the four simulation kinds keep LN_ACCOUNT VIEW', async () => {
    const account = (await q("SELECT id FROM ln_account ORDER BY id LIMIT 1"))[0];
    assert.ok(account, 'earlier tests leave an account');
    // LOAN_ACCOUNTANT holds LN_ACCOUNT VIEW but not LN_TRANSACTION CREATE; LOAN_CASHIER holds both.
    const accountant = userIds.LOAN_ACCOUNTANT;
    const cashier = userIds.LOAN_CASHIER;
    assert.ok(accountant && cashier, 'the role users exist from the matrix setup');
    // Phase 6: without a terminal their branch scope is empty and every account answers 404 (fail closed),
    // so give both a terminal at the account's branch; this test is about the permission check after it
    const terminal = (await q('SELECT t.id FROM terminal t JOIN ln_account a ON a.branchId = t.locationId WHERE a.id = ? AND t.isActive = 1 ORDER BY t.id LIMIT 1', [account.id]))[0];
    assert.ok(terminal, 'an active terminal at the account\'s branch');
    for (const u of [accountant, cashier]) await q('INSERT IGNORE INTO UserTerminals (createdAt, updateTimestamp, userId, terminalId) VALUES (NOW(), NOW(), ?, ?)', [u, terminal.id]);
    // A write kind: the accountant (VIEW only) is refused by the in-handler permission check...
    expectStatus(await call(accountant, 'post', `${L}/accounts/${account.id}/preview/DISB`, {}), 403, 'accountant cannot preview a write kind');
    // ...while the cashier (CREATE) passes the permission check (then meets the posting switch, never 403/401).
    const cashierPv = await call(cashier, 'post', `${L}/accounts/${account.id}/preview/DISB`, {});
    assert.ok(![401, 403].includes(cashierPv.status), `cashier passes the preview permission check, got ${cashierPv.status}`);
    // A simulation kind stays LN_ACCOUNT VIEW: the accountant may run it.
    const disbursed = (await q("SELECT id FROM ln_account WHERE accountStage = 'DISBURSED' ORDER BY id LIMIT 1"))[0];
    if (disbursed) {
      const date = (await q("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1"))[0].d;
      expectStatus(await call(accountant, 'post', `${L}/accounts/${disbursed.id}/preview/status`, { date }), 200, 'accountant may run a simulation preview with LN_ACCOUNT VIEW');
    }
  });

  await test('T4 Phase 6: a LOAN_ACCOUNTANT user (the seeded group, which holds LN_ALL_BRANCHES) with NO terminal works on every branch: lists and account views equal SUPER_ADMIN\'s, a simulation preview is 200; the flag opens nothing else (write-kind preview and transactions 403); control: without the flag the same user sees nothing and gets 404', async () => {
    const group = (await q("SELECT id FROM userGroup WHERE code = 'LOAN_ACCOUNTANT'"))[0];
    assert.ok(group, 'the Phase 6 seed test created LOAN_ACCOUNTANT');
    const flagRows = await q("SELECT COUNT(*) n FROM sec_group_grant WHERE userGroupId = ? AND functionCode = 'LN_ALL_BRANCHES' AND actionCode = 'VIEW'", [group.id]);
    assert.strictEqual(Number(flagRows[0].n), 1, 'the seed granted LN_ALL_BRANCHES to LOAN_ACCOUNTANT');
    for (const [f, actions] of Object.entries(GROUPS.LOAN_ACCOUNTANT)) for (const a of actions) await q('INSERT IGNORE INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, ?, ?)', [group.id, f, a]);
    const user = await addUser('t4_ho_accountant', group.id);
    assert.strictEqual(Number((await q('SELECT COUNT(*) n FROM UserTerminals WHERE userId = ?', [user]))[0].n), 0, 'no terminal');
    const { scopeOf } = require('../../src/loan/services/branchScope');
    assert.deepStrictEqual(await scopeOf(user), { all: true, branches: [] });
    const account = (await q("SELECT id FROM ln_account WHERE accountStage = 'DISBURSED' ORDER BY id LIMIT 1"))[0];
    const date = (await q("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1"))[0].d;
    const views = ['/accounts?limit=500', `/accounts/${account.id}/summary`, `/accounts/${account.id}/schedule`, '/reports/overdue', '/reports/portfolio', '/reports/gl-tieout', '/reports/vat'];
    for (const url of views) {
      const mine = await call(user, 'get', `${L}${url}`);
      expectStatus(mine, 200, `accountant ${url}`);
      assert.deepStrictEqual(mine.data.data, (await call(SUPER, 'get', `${L}${url}`)).data.data, `accountant sees the same ${url} as SUPER_ADMIN`);
    }
    assert.ok((await call(user, 'get', `${L}/accounts?limit=500`)).data.data.length > 0, 'the list is not empty');
    expectStatus(await call(user, 'post', `${L}/accounts/${account.id}/preview/status`, { date }), 200, 'simulation preview');
    expectStatus(await call(user, 'post', `${L}/accounts/${account.id}/preview/DISB`, {}), 403, 'write-kind preview still needs LN_TRANSACTION CREATE');
    expectStatus(await call(user, 'post', `${L}/accounts/${account.id}/transactions`, { kind: 'REPAYMENT', amount: '1' }, { 'Idempotency-Key': 't4-ho-acc' }), 403, 'no transactions');
    // Control: the flag is what opens every branch. Without it this terminal-less user is fail-closed.
    await q("DELETE FROM sec_group_grant WHERE userGroupId = ? AND functionCode = 'LN_ALL_BRANCHES'", [group.id]);
    try {
      expectStatus(await call(user, 'get', `${L}/accounts/${account.id}/summary`), 404, 'without the flag: 404');
      assert.deepStrictEqual((await call(user, 'get', `${L}/accounts?limit=500`)).data.data, [], 'without the flag: empty list');
    } finally {
      await q("INSERT INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, 'LN_ALL_BRANCHES', 'VIEW')", [group.id]);
    }
    expectStatus(await call(user, 'get', `${L}/accounts/${account.id}/summary`), 200, 'flag restored');
  });

  await test('T4 preview/:kind for every one of the 13 write kinds (Phase 6: + BRANCH_TRANSFER) writes nothing, whether it computes a journal or is refused by a business rule (every ln_ table, audit, idempotency and the number sequences)', async () => {
    const { KINDS } = require('../../src/loan/posting/transactionService');
    const setSpf = (code, value) => q('UPDATE SPF SET value = ? WHERE code = ?', [value, code]);
    const tables = (await q("SELECT table_name t FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name IN ('general_ledger', 'transactionEntry'))")).map(r => r.t);
    const state = async () => {
      const counts = {};
      for (const t of tables) counts[t] = Number((await q(`SELECT COUNT(*) n FROM \`${t}\``))[0].n);
      const checksums = await q('CHECKSUM TABLE ln_numbering_sequence, ln_idempotency, ln_audit_log, ln_account, ln_schedule, ln_account_balance EXTENDED');
      return JSON.stringify({ counts, checksums }, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
    };
    const account = (await q("SELECT id FROM ln_account WHERE accountStage = 'DISBURSED' ORDER BY id LIMIT 1"))[0] || (await q("SELECT id FROM ln_account ORDER BY id LIMIT 1"))[0];
    assert.ok(account, 'earlier tests leave an account');
    const target = (await q("SELECT id FROM ln_transaction WHERE postingStatus = 'POSTED' AND isReversed = 0 ORDER BY id DESC LIMIT 1"))[0];
    // a destination for the BRANCH_TRANSFER preview: another active location (with or without a profile, the
    // preview must write nothing either way)
    const otherBranch = (await q('SELECT l.id FROM location l JOIN ln_account a ON a.id = ? WHERE l.id <> a.branchId AND l.isActive = 1 ORDER BY l.id LIMIT 1', [account.id]))[0];
    const bodyFor = (kind) => {
      const b = { INS_REMIT: { amount: '1' }, ADV_REFUND: { amount: '1' }, RECOVERY: { amount: '1' },
        WAIVE: { component: 'INTEREST', amount: '1', remarks: 'x' }, REPOSSESS: { appraisedValue: '1', remarks: 'x' },
        VEH_DISPOSE: { salePrice: '1', remarks: 'x' }, WRITE_OFF: { remarks: 'x' },
        REVERSAL: { targetTransactionId: target ? target.id : 999999999, remarks: 'x' },
        BRANCH_TRANSFER: { toBranchId: otherBranch ? Number(otherBranch.id) : 999999999, remarks: 'x' } }[kind];
      return b || {};
    };
    const prior = (await q("SELECT value v FROM SPF WHERE code = 'LOAN_POSTING_ENABLED'"))[0].v;
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    const before = await state();
    const results = [];
    for (const kind of Object.keys(KINDS).filter(k => KINDS[k].checker)) { // the 9 checker kinds + FEE_COLLECT/RECOVERY previews below
      const res = await call(SUPER, 'post', `${L}/accounts/${account.id}/preview/${kind}`, bodyFor(kind));
      assert.ok(res.status < 500, `preview ${kind} is a clean result, not a crash (${res.status})`);
      results.push(`${kind}:${res.status}`);
    }
    for (const kind of ['FEE_COLLECT', 'RECOVERY']) { // the maker-only kinds also preview read-only
      const res = await call(SUPER, 'post', `${L}/accounts/${account.id}/preview/${kind}`, bodyFor(kind));
      assert.ok(res.status < 500, `preview ${kind} is a clean result, not a crash (${res.status})`);
      results.push(`${kind}:${res.status}`);
    }
    assert.strictEqual(await state(), before, 'no write-kind preview changed any ln_ table, audit row, idempotency row or number sequence');
    await setSpf('LOAN_POSTING_ENABLED', prior);
    console.log(`        write-kind previews (status): ${results.join(' ')}`);
  });
};

module.exports.auditRouter = auditRouter;
