/**
 * Phase 6 Stage 1: branch scope (plan section 7 "Scope", R2; fail closed). Run from run.js after the posting
 * and screen tests, so real accounts, transactions, journal legs and documents exist.
 *
 * Users, all in groups with the same loan grants:
 *   A1 maker and A2 checker with a terminal at branch A; B1 with a terminal at branch B;
 *   H with LN_ALL_BRANCHES (group T6_HO = the same grants + the flag);
 *   Z with no terminal and ZI whose only terminal is inactive (fail closed: empty scope);
 *   F whose group holds only LN_ALL_BRANCHES (R2: the flag opens nothing).
 * One account X (with its application, transactions, legs, sale and a document) is moved to branch B for
 * the test and moved back at the end. Pending transactions on X are test rows (the guard refuses before
 * any controller runs, so they never post).
 */
const assert = require('assert');
const { ROUTES } = require('./routeManifest');

module.exports = async ({ test, call, q, runNode, users, L, expectStatus, branch: BRANCH_A }) => {
  const { SUPER } = users;
  const num = async (sql, params) => Number((await q(sql, params))[0].n);
  const ids = rows => rows.map(r => Number(r.id));
  const T = {}; // users
  let BRANCH_B;
  let X; // { id, applicationId, saleId, docId }
  const pending = {}; // txId by maker
  const terminals = [];

  const state = async () => {
    const tables = (await q("SELECT table_name t FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name IN ('general_ledger', 'transactionEntry'))")).map(r => r.t);
    const counts = {};
    for (const t of tables) counts[t] = await num(`SELECT COUNT(*) n FROM \`${t}\``);
    const checksums = await q('CHECKSUM TABLE ln_transaction, ln_account, ln_application, ln_journal_posting, ln_audit_log, ln_idempotency EXTENDED');
    return JSON.stringify({ counts, checksums }, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  };

  await test('setup: branches A and B, terminals, groups with the same grants (+ LN_ALL_BRANCHES for H, only the flag for F), users A1 A2 B1 H Z ZI F; account X moved to branch B with its application, transactions, sale and a document; pending transactions on X made by B1 and by H', async () => {
    BRANCH_B = Number((await q('SELECT id FROM location WHERE id <> ? ORDER BY id LIMIT 1', [BRANCH_A]))[0].id);
    assert.ok(BRANCH_B && BRANCH_B !== BRANCH_A, 'a second location exists');
    const addTerminal = async (code, locationId, isActive = 1) => {
      await q('INSERT INTO terminal (code, name, isActive, createdAt, updateTimestamp, locationId) VALUES (?, ?, ?, NOW(), NOW(), ?)', [code, `T6 terminal ${code}`, isActive, locationId]);
      const id = Number((await q('SELECT id FROM terminal WHERE code = ?', [code]))[0].id);
      terminals.push(id);
      return id;
    };
    const termA = await addTerminal(990601, BRANCH_A);
    const termB = await addTerminal(990602, BRANCH_B);
    const termOff = await addTerminal(990603, BRANCH_B, 0);

    const grants = [['LN_ACCOUNT', 'VIEW'], ['LN_TRANSACTION', 'VIEW'], ['LN_TRANSACTION', 'CREATE'], ['LN_TRANSACTION', 'AUTHORIZE'],
      ['LN_APPLICATION', 'VIEW'], ['LN_APPLICATION', 'CREATE'], ['LN_APPLICATION', 'EDIT'], ['LN_APPLICATION', 'AUTHORIZE'], ['LN_ACCOUNT', 'CREATE'],
      ['LN_DOCUMENT', 'VIEW'], ['LN_COLLECTION', 'VIEW'], ['LN_REPORT', 'VIEW'], ['LN_VAT_REPORT', 'VIEW'], ['LN_AUDIT_LOG', 'VIEW'], ['LN_EOD', 'VIEW'], ['LN_EOD', 'CREATE']];
    const addGroup = async (code, list) => {
      await q("INSERT INTO userGroup (name, code, isActive, createdAt, updateTimestamp, homePage) VALUES (?, ?, 1, NOW(), NOW(), '/')", [code, code]);
      const id = Number((await q('SELECT id FROM userGroup WHERE code = ?', [code]))[0].id);
      for (const [f, a] of list) await q('INSERT INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, ?, ?)', [id, f, a]);
      return id;
    };
    const staff = await addGroup('T6_BRANCH_STAFF', grants);
    const ho = await addGroup('T6_HO', [...grants, ['LN_ALL_BRANCHES', 'VIEW']]);
    const flag = await addGroup('T6_FLAG_ONLY', [['LN_ALL_BRANCHES', 'VIEW']]);
    const addUser = async (name, groupId, terminalIds = []) => {
      await q("INSERT INTO user (cus_id, cus_pass, cus_name, isActive, createdAt, updateTimestamp, groupId) VALUES (?, '!not-a-login', ?, 1, NOW(), NOW(), ?)", [name, name, groupId]);
      const id = Number((await q('SELECT id FROM user WHERE cus_id = ?', [name]))[0].id);
      for (const t of terminalIds) await q('INSERT INTO UserTerminals (createdAt, updateTimestamp, userId, terminalId) VALUES (NOW(), NOW(), ?, ?)', [id, t]);
      return id;
    };
    T.A1 = await addUser('t6_a1', staff, [termA]);
    T.A2 = await addUser('t6_a2', staff, [termA]);
    T.B1 = await addUser('t6_b1', staff, [termB]);
    T.H = await addUser('t6_h', ho);
    T.Z = await addUser('t6_z', staff);
    T.ZI = await addUser('t6_zi', staff, [termOff]);
    T.F = await addUser('t6_f', flag, [termA]);

    // X: the account of an active document (so the document route is covered), moved to branch B
    const doc = (await q('SELECT d.id, d.loanAccountId a FROM ln_account_document d WHERE d.isActive = 1 ORDER BY d.id DESC LIMIT 1'))[0];
    assert.ok(doc, 'the screen tests left a document');
    const acc = (await q('SELECT id, applicationId, branchId FROM ln_account WHERE id = ?', [doc.a]))[0];
    assert.strictEqual(Number(acc.branchId), BRANCH_A, 'the suite books accounts at ADMIN\'s branch');
    const app = (await q('SELECT id, vehicleSaleHeaderId s FROM ln_application WHERE id = ?', [acc.applicationId]))[0];
    X = { id: Number(acc.id), applicationId: Number(app.id), saleId: app.s ? Number(app.s) : null, docId: Number(doc.id) };
    assert.ok(X.saleId, 'X has a sale');
    await q('UPDATE ln_account SET branchId = ? WHERE id = ?', [BRANCH_B, X.id]);
    await q('UPDATE ln_application SET branchId = ? WHERE id = ?', [BRANCH_B, X.applicationId]);
    await q('UPDATE ln_transaction SET branchId = ? WHERE loanAccountId = ?', [BRANCH_B, X.id]);
    await q('UPDATE saleHeader SET locationId = ? WHERE id = ?', [BRANCH_B, X.saleId]);
    const ccy = (await q('SELECT currencyId c FROM ln_account WHERE id = ?', [X.id]))[0].c;
    const date = (await q("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1"))[0].d;
    for (const who of ['B1', 'H']) {
      await q("INSERT INTO ln_transaction (txNo, branchId, loanAccountId, eventCode, postingDate, valueDate, postingStatus, authStatus, makerId, currencyId, requestJson, remarks) VALUES (?, ?, ?, 'WAIVE', ?, ?, 'PENDING_AUTH', 'PENDING', ?, ?, '{}', 'T6 scope test')",
        [`T6-${who}-${Date.now()}`, BRANCH_B, X.id, date, date, T[who], ccy]);
      pending[who] = Number((await q("SELECT id FROM ln_transaction WHERE makerId = ? AND remarks = 'T6 scope test' ORDER BY id DESC LIMIT 1", [T[who]]))[0].id);
    }
  });

  const byIdRoutes = () => [
    ['get', `/accounts/${X.id}`], ['get', `/accounts/${X.id}/summary`], ['get', `/accounts/${X.id}/schedule`], ['get', `/accounts/${X.id}/statement`],
    ['get', `/accounts/${X.id}/history`], ['get', `/accounts/${X.id}/documents`], ['get', `/accounts/${X.id}/transactions`],
    ['get', `/documents/${X.docId}/file`], ['get', `/applications/${X.applicationId}`], ['get', `/sales/${X.saleId}/financing-proposal`]
  ];
  const writeRoutes = () => [
    ['post', `/accounts/${X.id}/preview/status`, {}], ['post', `/accounts/${X.id}/preview/WAIVE`, { component: 'INTEREST', amount: '1', remarks: 'x' }],
    ['post', `/accounts/${X.id}/transactions`, { kind: 'WAIVE', component: 'INTEREST', amount: '1', remarks: 'x' }],
    ['post', `/transactions/${pending.B1}/authorize`, {}], ['post', `/transactions/${pending.B1}/reject`, { remarks: 'x' }],
    ['put', `/applications/${X.applicationId}`, { remarks: 'x' }], ['post', `/applications/${X.applicationId}/submit`, {}],
    ['post', `/applications/${X.applicationId}/approve`, {}], ['post', `/applications/${X.applicationId}/reject`, {}], ['post', `/applications/${X.applicationId}/book`, {}]
  ];
  const headers = { 'Idempotency-Key': 't6-scope-refused' };

  await test('scope A/B: A1 and A2 get 404 on every by-id route of the branch-B account X (account, summary, schedule, statement, history, documents, a document file, transactions, its application, its sale) and on every write (preview, submit a transaction, authorize and reject B1\'s pending one, application edit/submit/approve/reject/book); the 404 reads like a missing record; nothing is written', async () => {
    const before = await state();
    for (const who of ['A1', 'A2']) {
      for (const [m, url] of byIdRoutes()) expectStatus(await call(T[who], m, `${L}${url}`), 404, `${who} ${m} ${url}`);
      for (const [m, url, body] of writeRoutes()) expectStatus(await call(T[who], m, `${L}${url}`, body, headers), 404, `${who} ${m} ${url}`);
    }
    const res = await call(T.A1, 'get', `${L}/accounts/${X.id}`);
    assert.strictEqual(res.data.message, `Account ${X.id} not found`, 'same message as a missing account');
    assert.strictEqual(await state(), before, 'no refusal wrote anything');
  });

  await test('scope A/B: lists of A1 and A2 never show branch B: accounts, applications, the pending queue, overdue, portfolio, aging, NPL, provisions, GL tie-out, VAT report and audit log hold only branch-A records; B1 sees X and its pending transaction', async () => {
    const aAccounts = ids(await q('SELECT id FROM ln_account WHERE branchId = ?', [BRANCH_A]));
    const aDisbursed = await num("SELECT COUNT(*) n FROM ln_account WHERE branchId = ? AND accountStage = 'DISBURSED'", [BRANCH_A]);
    const get = async (who, url) => { const r = await call(T[who], 'get', `${L}${url}`); expectStatus(r, 200, `${who} ${url}`); return r.data.data; };
    for (const who of ['A1', 'A2']) {
      const accounts = await get(who, '/accounts?limit=500');
      assert.ok(accounts.length > 0 && accounts.every(a => aAccounts.includes(Number(a.id))), `${who} /accounts: branch A only`);
      assert.ok(!accounts.some(a => Number(a.id) === X.id), `${who} does not see X`);
      const apps = await get(who, '/applications');
      assert.ok(apps.length > 0 && !apps.some(a => Number(a.id) === X.applicationId) && apps.every(a => Number(a.branchId) === BRANCH_A), `${who} /applications`);
      const queue = await get(who, '/transactions/pending');
      assert.ok(!queue.some(t => Number(t.accountId) === X.id), `${who} pending queue has no branch-B row`);
      const overdue = await get(who, '/reports/overdue');
      assert.ok(overdue.rows.every(r => aAccounts.includes(Number(r.accountId))), `${who} overdue`);
      for (const r of ['portfolio', 'aging', 'npl']) {
        const rep = await get(who, `/reports/${r}`);
        const n = rep.rows.reduce((s, x) => s + x.accounts, 0);
        if (r !== 'npl') assert.strictEqual(n, aDisbursed, `${who} ${r} counts the branch-A disbursed accounts`);
        else assert.ok(n <= aDisbursed, `${who} npl within branch A`);
      }
      const prov = await get(who, '/reports/provisions');
      assert.ok(prov.rows.every(r => aAccounts.includes(Number(r.accountId))), `${who} provisions`);
      const vat = await get(who, '/reports/vat');
      assert.ok(vat.records.every(r => Number(r.transaction.loanAccountId) !== X.id), `${who} VAT report`);
      const audit = await get(who, '/audit-log?limit=1000');
      assert.ok(!audit.some(e => (e.entityName === 'account' && Number(e.entityId) === X.id) || (e.entityName === 'application' && Number(e.entityId) === X.applicationId) || (e.entityName === 'account-document' && Number(e.entityId) === X.docId)), `${who} audit log hides X`);
      assert.ok(audit.some(e => e.entityName === 'account'), `${who} audit log shows branch-A accounts`);
    }
    // GL tie-out for A1: exactly the journal of branch-A accounts, per chart account and currency
    const legs = await q("SELECT c.accountNumber n, cu.code cc, CAST(SUM(IF(jp.drCr = 'DR', jp.amount, -jp.amount)) AS CHAR) s FROM ln_journal_posting jp JOIN ln_account a ON a.id = jp.loanAccountId JOIN chart_of_account c ON c.id = jp.chartAccountId JOIN currency cu ON cu.id = jp.currencyId WHERE a.branchId = ? GROUP BY 1, 2", [BRANCH_A]);
    const want = Object.fromEntries(legs.map(l => [`${l.n}|${l.cc}`, Number(l.s)]));
    const tie = await get('A1', '/reports/gl-tieout');
    const got = Object.fromEntries(tie.rows.filter(r => r.roles.length).map(r => [`${r.accountNumber}|${r.currency}`, Number(r.journal.amount)]));
    assert.deepStrictEqual(got, want, 'A1 GL tie-out = branch-A legs only');
    const xLegs = await num('SELECT COUNT(*) n FROM ln_journal_posting WHERE loanAccountId = ?', [X.id]);
    assert.ok(xLegs > 0, 'X has legs, so leaving them out is visible');
    assert.notDeepStrictEqual(tie, await get('H', '/reports/gl-tieout'), 'H sees more than A1');
    // B1 sees X and its own pending transaction
    assert.ok((await get('B1', '/accounts?limit=500')).some(a => Number(a.id) === X.id), 'B1 sees X');
    assert.ok((await get('B1', '/transactions/pending')).some(t => t.transactionId === pending.B1), 'B1 sees the branch-B pending row');
  });

  await test('scope A/B: H (LN_ALL_BRANCHES) reaches every by-id route of X, sees X in every list like SUPER_ADMIN, rejects B1\'s pending transaction (200); authorizing H\'s own stays 403 (maker-checker unchanged)', async () => {
    for (const [m, url] of byIdRoutes()) {
      const r = await call(T.H, m, `${L}${url}`);
      const s = await call(SUPER, m, `${L}${url}`);
      // the same answer as SUPER_ADMIN (who passes every scope); where the service itself answers 404 (a sale
      // whose proposal is gone once financed), the message is the service's, not the scope guard's
      assert.deepStrictEqual([r.status, r.data && r.data.message], [s.status, s.data && s.data.message], `H ${m} ${url}: ${r.status}, SUPER ${s.status}`);
      if (!url.startsWith('/sales/')) assert.notStrictEqual(r.status, 404, `H ${m} ${url} is not hidden`);
    }
    expectStatus(await call(T.H, 'post', `${L}/accounts/${X.id}/preview/status`, {}), 200, 'H preview');
    for (const url of ['/accounts?limit=500', '/applications', '/transactions/pending', '/reports/overdue', '/reports/portfolio', '/reports/provisions', '/reports/gl-tieout']) {
      const h = (await call(T.H, 'get', `${L}${url}`)).data.data;
      const s = (await call(SUPER, 'get', `${L}${url}`)).data.data;
      assert.deepStrictEqual(h, s, `H and SUPER_ADMIN see the same ${url}`);
    }
    expectStatus(await call(T.H, 'post', `${L}/transactions/${pending.H}/authorize`, {}), 403, 'H authorizes own');
    expectStatus(await call(T.H, 'post', `${L}/transactions/${pending.B1}/reject`, { remarks: 'T6 H rejects' }), 200, 'H rejects B1\'s');
    assert.strictEqual((await q('SELECT postingStatus s FROM ln_transaction WHERE id = ?', [pending.B1]))[0].s, 'REJECTED');
  });

  await test('scope A/B: the sale guard: A1 creating an application on X\'s branch-B sale is refused (403) and writes nothing; all-branches: /eod/run is refused (403) for A1, B1 and Z with the LN_ALL_BRANCHES message', async () => {
    const client = (await q('SELECT id FROM client ORDER BY id LIMIT 1'))[0];
    const product = (await q("SELECT id FROM ln_product WHERE authStatus = 'AUTHORIZED' AND status = 'ACTIVE' ORDER BY id LIMIT 1"))[0];
    const before = await state();
    const r = await call(T.A1, 'post', `${L}/applications`, { customerId: client.id, productId: product.id, vehicleSaleHeaderId: X.saleId, requestedAmount: '1', tenorMonths: 12, interestRate: '0.1' });
    expectStatus(r, 403, 'A1 application on a branch-B sale');
    assert.match(r.data.message, /outside yours/);
    for (const who of ['A1', 'B1', 'Z']) {
      const e = await call(T[who], 'post', `${L}/eod/run`, {});
      expectStatus(e, 403, `${who} eod run`);
      assert.match(e.data.message, /LN_ALL_BRANCHES/);
    }
    assert.strictEqual(await state(), before, 'nothing written');
  });

  await test('fail closed: Z (no terminal) and ZI (only an inactive terminal) have an empty scope: every list is empty, every by-id route answers 404 at branch A and at branch B, writes and the sale guard are refused; nothing is written; never all branches', async () => {
    const { scopeOf } = require('../../src/loan/services/branchScope');
    for (const who of ['Z', 'ZI']) assert.deepStrictEqual(await scopeOf(T[who]), { all: false, branches: [] }, `${who} scope`);
    const aAccount = Number((await q("SELECT id FROM ln_account WHERE branchId = ? AND accountStage = 'DISBURSED' ORDER BY id LIMIT 1", [BRANCH_A]))[0].id);
    const aApp = Number((await q('SELECT applicationId a FROM ln_account WHERE id = ?', [aAccount]))[0].a);
    const before = await state();
    for (const who of ['Z', 'ZI']) {
      const empty = async (url, pick) => { const r = await call(T[who], 'get', `${L}${url}`); expectStatus(r, 200, `${who} ${url}`); assert.deepStrictEqual(pick(r.data.data), [], `${who} ${url} is empty`); };
      await empty('/accounts?limit=500', d => d);
      await empty('/applications', d => d);
      await empty('/transactions/pending', d => d);
      for (const r of ['overdue', 'portfolio', 'aging', 'npl', 'provisions', 'gl-tieout']) await empty(`/reports/${r}`, d => d.rows);
      await empty('/reports/vat', d => d.records);
      await empty('/audit-log?limit=1000', d => d.filter(e => ['account', 'application', 'loan-transaction', 'account-document'].includes(e.entityName)));
      for (const [m, url] of [...byIdRoutes(), ['get', `/accounts/${aAccount}`], ['get', `/accounts/${aAccount}/summary`], ['get', `/applications/${aApp}`]]) expectStatus(await call(T[who], m, `${L}${url}`), 404, `${who} ${m} ${url}`);
      for (const [m, url, body] of [...writeRoutes(), ['post', `/accounts/${aAccount}/transactions`, { kind: 'REPAYMENT', amount: '1' }]]) expectStatus(await call(T[who], m, `${L}${url}`, body, headers), 404, `${who} ${m} ${url}`);
    }
    assert.strictEqual(await state(), before, 'nothing written');
  });

  await test('R2 scope flag only: F (group holds only LN_ALL_BRANCHES) is refused (403) on every guarded loan route', async () => {
    const { ENTITIES } = require('../../src/loan/services/paramRegistry');
    const entity = Object.keys(ENTITIES)[0];
    const change = (await q('SELECT id FROM ln_param_change ORDER BY id LIMIT 1'))[0];
    const before = await state();
    const wrong = [];
    for (const [method, path, fn] of ROUTES) {
      if (!fn) continue;
      const url = path.replace(':entity', entity).replace(':itemKey', 'x').replace(':code', 'x').replace(':kind', 'status').replace('/changes/:id', `/changes/${change ? change.id : 1}`).replace(/:\w+/g, '1');
      const r = await call(T.F, method.toLowerCase(), `${L}${url}`, {}, headers);
      if (r.status !== 403) wrong.push(`${method} ${path}: ${r.status}`);
    }
    assert.deepStrictEqual(wrong, []);
    assert.strictEqual(await state(), before, 'nothing written');
  });

  await test('migration on real data: UP backfills every untagged journal leg from its transaction\'s branch (X\'s legs to B, the rest to A); DOWN then refuses because legs carry a branchId and changes nothing', async () => {
    // Stage 2 tags legs at posting, so none is untagged here. The backfill is for databases where a Stage 1 build
    // posted legs without a branchId: put the legs back in that state.
    await q('UPDATE ln_journal_posting jp JOIN ln_transaction t ON t.id = jp.transactionId SET jp.branchId = NULL');
    const untagged = await num('SELECT COUNT(*) n FROM ln_journal_posting jp JOIN ln_transaction t ON t.id = jp.transactionId WHERE jp.branchId IS NULL');
    assert.ok(untagged > 0, 'legs as a Stage 1 build left them (no branchId)');
    runNode('loan_migrate.js', ['up']);
    assert.strictEqual(await num('SELECT COUNT(*) n FROM ln_journal_posting jp JOIN ln_transaction t ON t.id = jp.transactionId WHERE NOT (jp.branchId <=> t.branchId)'), 0, 'every leg with a transaction carries its branch');
    assert.ok(await num('SELECT COUNT(*) n FROM ln_journal_posting WHERE loanAccountId = ? AND branchId = ?', [X.id, BRANCH_B]) > 0, 'X\'s legs are at B');
    assert.match(runNode('loan_migrate.js', ['down', '--yes']), /20261109_loan_branch_no_default/); // Stage 2's migration steps back freely
    const before = await state();
    assert.throws(() => runNode('loan_migrate.js', ['down', '--yes']), err => /ln_journal_posting has \d+ leg\(s\) with a branchId/.test(err.stderr ? err.stderr.toString() : err.message));
    assert.strictEqual(await state(), before, 'refused DOWN changes nothing');
    runNode('loan_migrate.js', ['up']);
  });

  await test('cleanup, then the seed guard: X back at branch A, test pending rows removed, test groups lose their grants; LN_ALL_BRANCHES is held by exactly SUPER_ADMIN, LOAN_HO_CHECKER and LOAN_ACCOUNTANT (ADMIN, CASHIER and every other group: none)', async () => {
    await q('UPDATE ln_account SET branchId = ? WHERE id = ?', [BRANCH_A, X.id]);
    await q('UPDATE ln_application SET branchId = ? WHERE id = ?', [BRANCH_A, X.applicationId]);
    await q('UPDATE ln_transaction SET branchId = ? WHERE loanAccountId = ?', [BRANCH_A, X.id]);
    await q('UPDATE ln_journal_posting SET branchId = ? WHERE loanAccountId = ?', [BRANCH_A, X.id]);
    await q('UPDATE saleHeader SET locationId = ? WHERE id = ?', [BRANCH_A, X.saleId]);
    await q("DELETE FROM ln_transaction WHERE remarks IN ('T6 scope test', 'T6 H rejects')");
    await q("DELETE s FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE g.code IN ('T6_BRANCH_STAFF', 'T6_HO', 'T6_FLAG_ONLY')");
    await q('UPDATE user SET isActive = 0 WHERE cus_id LIKE ?', ['t6\\_%']);
    const holders = (await q("SELECT DISTINCT g.code c FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE s.functionCode = 'LN_ALL_BRANCHES' ORDER BY 1")).map(r => r.c);
    assert.deepStrictEqual(holders, ['LOAN_ACCOUNTANT', 'LOAN_HO_CHECKER', 'SUPER_ADMIN']);
  });
};
