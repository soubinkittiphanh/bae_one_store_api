/**
 * Approval by amount (owner decision 2026-11-13; src/loan/services/approvalThreshold.js).
 * WRITE_OFF and REPOSSESS above a per-kind, per-currency threshold (ln_approval_matrix, requiredLevel 2) post
 * only with a checker of the approver group, or with two different checkers; the maker never counts; the
 * same checker cannot approve twice; a rejection after the first approval ends it with nothing posted.
 * Without a threshold one checker posts. Basis in the contract currency: WRITE_OFF the total written off
 * (MEMO_WO), REPOSSESS the outstanding exposure (never the appraised value).
 * Users: group T9_STAFF (maker M9, checkers C9A and C9B) and group T9_HO (HO9, the approver group), all with
 * LN_ACCOUNT VIEW, LN_TRANSACTION VIEW/CREATE/AUTHORIZE, LN_LOOKUP VIEW and a terminal at branch A.
 */
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

module.exports = async ({ test, call, q, db, users, L, expectStatus, branch: BRANCH_A }) => {
  const { SUPER, SUPER2, ADMIN } = users;
  const num = async (sql, params) => Number((await q(sql, params))[0].n);
  const one = async (sql, params) => (await q(sql, params))[0];
  const setSpf = (code, value) => q('UPDATE SPF SET value = ? WHERE code = ?', [value, code]);
  const U = {};
  const prior = {};
  const rows = {}; // threshold row ids by `${kind}|${currency}`
  let hoGroup;
  let lakId;
  let usdId;
  let USD;
  let client;
  let product;
  let bank;
  let businessDate;
  const tx = (user, accountId, body) => call(user, 'post', `${L}/accounts/${accountId}/transactions`, body, { 'Idempotency-Key': `t9-${uuidv4()}` });
  const preview = (user, accountId, body) => call(user, 'post', `${L}/accounts/${accountId}/preview/${body.kind}`, body);
  const authorize = (user, txId) => call(user, 'post', `${L}/transactions/${txId}/authorize`, {});
  const reject = (user, txId) => call(user, 'post', `${L}/transactions/${txId}/reject`, { remarks: 'T9 rejected' });
  const pendingRow = async (user, txId) => (await call(user, 'get', `${L}/transactions/pending`)).data.data.find(r => r.transactionId === txId);
  const WO = { kind: 'WRITE_OFF', remarks: 'T9 write-off' };
  const REP = { kind: 'REPOSSESS', appraisedValue: '1000000', remarks: 'T9 repossession' };
  const setThreshold = (kind, ccy, amount) => q('UPDATE ln_approval_matrix SET minAmount = ? WHERE id = ?', [amount, rows[`${kind}|${ccy}`]]);
  const units = v => { const [i, f = ''] = String(v).split('.'); return BigInt(i + f.padEnd(4, '0').slice(0, 4)); };
  const plus = (v, d) => { const u = units(v) + BigInt(d) * 10000n; return `${u / 10000n}.${String(u % 10000n).padStart(4, '0')}`; };
  // Everything a refused authorization must leave untouched
  const footprint = async txId => JSON.stringify({
    txn: await one('SELECT postingStatus s, checkerId c, CAST(amount AS CHAR) a FROM ln_transaction WHERE id = ?', [txId]),
    legs: await num('SELECT COUNT(*) n FROM ln_journal_posting'), gl: await num('SELECT COUNT(*) n FROM general_ledger'),
    approvals: await num('SELECT COUNT(*) n FROM ln_approval_log'), audit: await num('SELECT COUNT(*) n FROM ln_audit_log'),
    accounts: await q('SELECT id, status, accountStage FROM ln_account ORDER BY id')
  });
  const postedLegs = txId => num('SELECT COUNT(*) n FROM ln_journal_posting WHERE transactionId = ?', [txId]);

  // A fresh, disbursed LAK account at branch A (as in the Stage 4 tests)
  const newAccount = async () => {
    const tag = uuidv4().slice(0, 8);
    const sale = await db.saleHeader.create({ bookingDate: businessDate, referenceNo: `T9-${tag}`, locationId: BRANCH_A, total: 300000000, exchangeRate: 1, isActive: true, clientId: client, currencyId: lakId, isPostedToAR: true });
    const invoice = await db.arInvoiceHeader.create({ invoiceNumber: `INV-T9-${tag}`, invoiceDate: businessDate, totalAmount: '300000000.00', netAmount: '300000000.00', taxAmount: 0, status: 'sent', clientId: client, currencyId: lakId, saleHeaderId: sale.id, sourceType: 'POS_ORDER', glPostingStatus: 'posted', exchangeRate: 1 });
    const line = await db.arInvoiceLine.create({ lineNumber: 1, description: 'Vehicle', quantity: 1, unitPrice: '300000000.00', lineTotal: '300000000.00', invoiceHeaderId: invoice.id });
    await sale.update({ arInvoiceId: invoice.id });
    const dp = await db.arReceiveHeaderV2.create({ receiptNumber: `DP-T9-${tag}`, bookingDate: businessDate, receivedDate: businessDate, invoiceHeaderId: invoice.id, totalReceivedAmount: '60000000.00', paymentMethod: 'cash', status: 'active', currencyId: lakId, glPostingStatus: 'unposted', exchangeRate: 1 });
    await db.arReceiveLine.create({ receiveHeaderId: dp.id, lineNumber: 1, invoiceLineId: line.id, allocatedAmount: '60000000.00', allocationDate: businessDate });
    const app = await call(ADMIN, 'post', `${L}/applications`, { customerId: client, productId: product, currencyId: lakId, vehicleSaleHeaderId: sale.id, vehiclePrice: '300000000', downPaymentAmount: '60000000', requestedAmount: '240000000', tenorMonths: 12, interestRate: '0.18', valueDate: businessDate });
    expectStatus(app, 201, 'application');
    expectStatus(await call(ADMIN, 'post', `${L}/applications/${app.data.data.id}/submit`), 200, 'submit');
    expectStatus(await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/approve`), 200, 'approve');
    const booked = await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/book`);
    expectStatus(booked, 201, 'book');
    const id = Number(booked.data.data.account.id);
    expectStatus(await tx(ADMIN, id, { kind: 'FEE_COLLECT', bankAccountId: bank, insurancePremium: '7000000' }), 201, 'fee collect');
    const disb = await tx(ADMIN, id, { kind: 'DISB' });
    expectStatus(disb, 202, 'DISB pending');
    expectStatus(await authorize(SUPER, disb.data.data.transactionId), 200, 'DISB');
    return id;
  };

  // ---------------------------------------------------------------- setup
  await test('setup (approval by amount): users M9, C9A, C9B (T9_STAFF) and HO9 (T9_HO, the approver group) at branch A; thresholds made in the Parameter Studio (maker SUPER, checker SUPER2) for WRITE_OFF and REPOSSESS in LAK and USD; a threshold row needs its currency and requiredLevel 2', async () => {
    const term = await one('SELECT id FROM terminal WHERE code = 990911');
    if (!term) await q("INSERT INTO terminal (code, name, isActive, createdAt, updateTimestamp, locationId) VALUES (990911, 'T9 terminal A', 1, NOW(), NOW(), ?)", [BRANCH_A]);
    const termId = Number((await one('SELECT id FROM terminal WHERE code = 990911')).id);
    const groups = {};
    for (const code of ['T9_STAFF', 'T9_HO']) {
      await q("INSERT INTO userGroup (name, code, isActive, createdAt, updateTimestamp, homePage) VALUES (?, ?, 1, NOW(), NOW(), '/')", [code, code]);
      groups[code] = Number((await one('SELECT id FROM userGroup WHERE code = ?', [code])).id);
      for (const [f, a] of [['LN_ACCOUNT', 'VIEW'], ['LN_TRANSACTION', 'VIEW'], ['LN_TRANSACTION', 'CREATE'], ['LN_TRANSACTION', 'AUTHORIZE'], ['LN_LOOKUP', 'VIEW']]) {
        await q('INSERT INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, ?, ?)', [groups[code], f, a]);
      }
    }
    hoGroup = groups.T9_HO;
    for (const [name, g] of [['t9_m9', 'T9_STAFF'], ['t9_c9a', 'T9_STAFF'], ['t9_c9b', 'T9_STAFF'], ['t9_ho9', 'T9_HO']]) {
      await q("INSERT INTO user (cus_id, cus_pass, cus_name, isActive, createdAt, updateTimestamp, groupId) VALUES (?, '!not-a-login', ?, 1, NOW(), NOW(), ?)", [name, name, groups[g]]);
      const id = Number((await one('SELECT id FROM user WHERE cus_id = ?', [name])).id);
      await q('INSERT INTO UserTerminals (createdAt, updateTimestamp, userId, terminalId) VALUES (NOW(), NOW(), ?, ?)', [id, termId]);
      U[name.slice(3).toUpperCase()] = id;
    }
    for (const code of ['LOAN_POSTING_ENABLED', 'LOAN_ALLOW_SELF_AUTHORIZE', 'LOAN_FX_MAX_RATE_AGE_DAYS']) prior[code] = (await one('SELECT value v FROM SPF WHERE code = ?', [code])).v;
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    await setSpf('LOAN_ALLOW_SELF_AUTHORIZE', 'false');
    await setSpf('LOAN_FX_MAX_RATE_AGE_DAYS', '3650');
    lakId = Number((await one('SELECT id FROM currency WHERE isLocalCCY = 1 LIMIT 1')).id);
    client = Number((await one('SELECT id FROM client ORDER BY id LIMIT 1')).id);
    product = Number((await one("SELECT id FROM ln_product WHERE productCode = 'CAR-LOAN-DB' AND authStatus = 'AUTHORIZED' AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1")).id);
    bank = Number((await one("SELECT id FROM bankAccount WHERE accountNumber = '1105'")).id);
    businessDate = (await one("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1")).d;
    const usd = await one(`SELECT a.id, a.currencyId c FROM ln_account a WHERE a.currencyId <> ? AND a.accountStage = 'DISBURSED' AND a.status NOT IN ('WRITTEN_OFF', 'REPOSSESSED', 'CLOSED') AND a.branchId = ?
      AND NOT EXISTS (SELECT 1 FROM ln_transaction t WHERE t.loanAccountId = a.id AND t.postingStatus = 'PENDING_AUTH') ORDER BY a.id LIMIT 1`, [lakId, BRANCH_A]);
    assert.ok(usd, 'a disbursed USD account at branch A');
    USD = Number(usd.id);
    usdId = Number(usd.c);

    // The Parameter Studio validates threshold rows
    const base = { minAmount: '1', maxAmount: '9999999999999999', approverRoleId: hoGroup };
    const noCcy = await call(SUPER, 'post', `${L}/params/approval-matrix`, { ...base, entityType: 'WRITE_OFF', requiredLevel: 2 });
    expectStatus(noCcy, 400, 'a threshold without a currency');
    assert.match(noCcy.data.message, /needs its currencyId/);
    const level1 = await call(SUPER, 'post', `${L}/params/approval-matrix`, { ...base, entityType: 'WRITE_OFF', currencyId: lakId, requiredLevel: 1 });
    expectStatus(level1, 400, 'requiredLevel 1');
    assert.match(level1.data.message, /requiredLevel 2/);
    expectStatus(await call(SUPER, 'post', `${L}/params/approval-matrix`, { ...base, entityType: 'WRITE_OFF', currencyId: lakId, requiredLevel: 2, approverRoleId: 99999999 }), 400, 'an approver group that does not exist');
    // closes any threshold an earlier run or seed left, so this test owns the rule
    await q("UPDATE ln_approval_matrix SET authStatus = 'CLOSED' WHERE entityType IN ('WRITE_OFF', 'REPOSSESS') AND authStatus = 'AUTHORIZED'");
    for (const kind of ['WRITE_OFF', 'REPOSSESS']) {
      for (const ccy of [lakId, usdId]) {
        const made = await call(SUPER, 'post', `${L}/params/approval-matrix`, { ...base, entityType: kind, currencyId: ccy, requiredLevel: 2 });
        expectStatus(made, 201, `${kind} ${ccy} threshold`);
        const id = made.data.data.id;
        expectStatus(await call(SUPER, 'post', `${L}/params/approval-matrix/${id}/authorize`), 403, 'the maker cannot authorize their own threshold');
        expectStatus(await call(SUPER2, 'post', `${L}/params/approval-matrix/${id}/authorize`), 200, 'authorized by a second person');
        rows[`${kind}|${ccy}`] = id;
      }
    }
    console.log(`        approver group T9_HO = ${hoGroup}; thresholds ${JSON.stringify(rows)}; USD account ${USD}`);
  });

  // ---------------------------------------------------------------- below / at / above
  let A1;
  let A2;
  await test('WRITE_OFF below the threshold (basis + 1): the preview needs no second approval; one checker (C9A) posts', async () => {
    A1 = await newAccount();
    const p = await preview(U.M9, A1, WO);
    expectStatus(p, 200, 'preview');
    const basis = p.data.data.approval.basis;
    assert.ok(units(basis) >= units('240000000'), `basis ${basis} is the total written off (principal 240,000,000 and more)`);
    // compared as amounts: the basis is written with 4 decimals, the event tag in the engine's shortest form
    assert.strictEqual(units(basis), units(await previewMemo(A1)), 'basis = MEMO_WO, the total written off');
    console.log(`        WRITE_OFF basis ${basis}; transaction amount (principal) ${p.data.data.amount}`);
    await setThreshold('WRITE_OFF', lakId, plus(basis, 1));
    const p2 = await preview(U.M9, A1, WO);
    assert.strictEqual(p2.data.data.approval.requiresSecondApproval, false);
    assert.strictEqual(p2.data.data.approval.label, null);
    const made = await tx(U.M9, A1, WO);
    expectStatus(made, 202, 'pending');
    assert.strictEqual(made.data.data.approval.requiresSecondApproval, false);
    const ok = await authorize(U.C9A, made.data.data.transactionId);
    expectStatus(ok, 200, 'one checker posts below the threshold');
    assert.strictEqual(ok.data.data.postingStatus, 'POSTED');
    assert.strictEqual(ok.data.data.approval.approvedBy, 'ONE_CHECKER');
    assert.ok(await postedLegs(made.data.data.transactionId) > 0);
  });

  // On the fresh accounts above the total written off equals the principal, so they cannot tell the basis from
  // the transaction amount (principal only). An account aged by the earlier EOD tests carries interest as well;
  // previews write nothing, so it is only looked at.
  await test('basis is not the transaction amount: on an aged LAK account with interest outstanding, the WRITE_OFF basis is the whole MEMO_WO and the REPOSSESS basis the whole exposure, both above the principal-only amount', async () => {
    const candidates = await q(`SELECT a.id FROM ln_account a WHERE a.currencyId = ? AND a.branchId = ? AND a.accountStage = 'DISBURSED' AND a.status NOT IN ('WRITTEN_OFF', 'REPOSSESSED', 'CLOSED')
      AND NOT EXISTS (SELECT 1 FROM ln_transaction t WHERE t.loanAccountId = a.id AND t.postingStatus = 'PENDING_AUTH') ORDER BY a.id`, [lakId, BRANCH_A]);
    let found = null;
    for (const c of candidates) {
      const w = await preview(U.M9, Number(c.id), WO);
      if (w.status !== 200 || !w.data.data.approval) continue;
      const memo = w.data.data.events.find(e => e.event === 'WRITE_OFF').tags.MEMO_WO;
      if (units(memo) > units(w.data.data.amount)) { found = { id: Number(c.id), w }; break; }
    }
    assert.ok(found, `an aged LAK account at branch A with interest outstanding (looked at ${candidates.length})`);
    const w = found.w.data.data;
    assert.strictEqual(units(w.approval.basis), units(w.events.find(e => e.event === 'WRITE_OFF').tags.MEMO_WO), 'WRITE_OFF basis = MEMO_WO');
    assert.ok(units(w.approval.basis) > units(w.amount), `WRITE_OFF basis ${w.approval.basis} is above the amount ${w.amount}`);
    const r = (await preview(U.M9, found.id, REP)).data.data;
    const rep = r.events.find(e => e.event === 'REPOSSESS').tags;
    const exposure = ['OUT_PRIN', 'SUSP_CLR', 'UNCOL_INT', 'FEE_WO', 'PEN_WO'].reduce((s, k) => s + (rep[k] ? units(rep[k]) : 0n), 0n);
    assert.strictEqual(units(r.approval.basis), exposure, 'REPOSSESS basis = the outstanding exposure');
    assert.ok(units(r.approval.basis) > units(r.amount), `REPOSSESS basis ${r.approval.basis} is above the amount ${r.amount}`);
    console.log(`        account ${found.id}: WRITE_OFF basis ${w.approval.basis}, REPOSSESS basis ${r.approval.basis}, amount ${w.amount}`);
  });

  // MEMO_WO of a write-off preview, from its events
  async function previewMemo (accountId) {
    const p = await preview(U.M9, accountId, WO);
    return p.data.data.events.find(e => e.event === 'WRITE_OFF').tags.MEMO_WO;
  }

  await test('WRITE_OFF at the threshold (= basis): preview and pending queue say "requires second approval"; the maker never counts (403 even with LOAN_ALLOW_SELF_AUTHORIZE on); C9A gives the first approval (202, "1 of 2 approvals", nothing posted); C9A again is refused (409); nothing is written by a refused authorization; C9B posts (200)', async () => {
    A2 = await newAccount();
    const basis = await previewMemo(A2);
    await setThreshold('WRITE_OFF', lakId, basis);
    const p = await preview(U.M9, A2, WO);
    assert.strictEqual(p.data.data.approval.requiresSecondApproval, true, 'at the threshold');
    assert.strictEqual(p.data.data.approval.label, 'requires second approval');
    assert.strictEqual(p.data.data.approval.approverGroup, 'T9_HO');
    const made = await tx(U.M9, A2, WO);
    expectStatus(made, 202, 'pending');
    const id = made.data.data.transactionId;
    assert.strictEqual(made.data.data.approval.label, 'requires second approval');
    let row = await pendingRow(U.C9A, id);
    assert.strictEqual(row.approval.label, 'requires second approval');
    assert.strictEqual(row.approval.approvals, 0);

    let before = await footprint(id);
    expectStatus(await authorize(U.M9, id), 403, 'the maker (self-authorize off)');
    await setSpf('LOAN_ALLOW_SELF_AUTHORIZE', 'true');
    try {
      const self = await authorize(U.M9, id);
      expectStatus(self, 403, 'the maker never counts above the threshold');
      assert.match(self.data.message, /maker never counts/);
    } finally {
      await setSpf('LOAN_ALLOW_SELF_AUTHORIZE', 'false');
    }
    assert.strictEqual(await footprint(id), before, 'the maker\'s refused authorizations wrote nothing');

    const first = await authorize(U.C9A, id);
    expectStatus(first, 202, 'first approval');
    assert.strictEqual(first.data.data.postingStatus, 'PENDING_AUTH');
    assert.strictEqual(first.data.data.approval.label, '1 of 2 approvals');
    assert.match(first.data.message, /First approval recorded \(1 of 2 approvals\)/);
    assert.strictEqual(await postedLegs(id), 0, 'nothing posted after the first approval');
    assert.strictEqual((await one('SELECT postingStatus s, checkerId c FROM ln_transaction WHERE id = ?', [id])).s, 'PENDING_AUTH');
    assert.strictEqual((await one('SELECT status s FROM ln_account WHERE id = ?', [A2])).s !== 'WRITTEN_OFF', true, 'the account is not written off yet');
    const log = await q("SELECT approvalLevel l, approverUserId u, action a FROM ln_approval_log WHERE entityType = 'LOAN_TRANSACTION' AND entityId = ? ORDER BY id", [id]);
    assert.deepStrictEqual(log.map(x => [Number(x.l), Number(x.u), x.a]), [[1, U.C9A, 'APPROVE']], 'the first approval is logged');
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_audit_log WHERE entityName = 'loan-transaction' AND entityId = ? AND actionType = 'APPROVE_1' AND userId = ?", [id, U.C9A]), 1, 'and audited');
    row = await pendingRow(U.C9B, id);
    assert.strictEqual(row.approval.label, '1 of 2 approvals');
    assert.strictEqual(row.approval.firstApproverId, U.C9A);

    before = await footprint(id);
    const twice = await authorize(U.C9A, id);
    expectStatus(twice, 409, 'the same checker twice');
    assert.match(twice.data.message, /already gave the first approval/);
    assert.strictEqual(await footprint(id), before, 'the refused second try wrote nothing');

    const second = await authorize(U.C9B, id);
    expectStatus(second, 200, 'a second, different checker posts');
    assert.strictEqual(second.data.data.postingStatus, 'POSTED');
    assert.strictEqual(second.data.data.approval.approvedBy, 'SECOND_CHECKER');
    const t = await one('SELECT postingStatus s, checkerId c FROM ln_transaction WHERE id = ?', [id]);
    assert.deepStrictEqual([t.s, Number(t.c)], ['POSTED', U.C9B]);
    assert.ok(await postedLegs(id) > 0, 'posted');
    assert.strictEqual((await one('SELECT status s FROM ln_account WHERE id = ?', [A2])).s, 'WRITTEN_OFF');
    const log2 = await q("SELECT approvalLevel l, approverUserId u FROM ln_approval_log WHERE entityType = 'LOAN_TRANSACTION' AND entityId = ? ORDER BY id", [id]);
    assert.deepStrictEqual(log2.map(x => [Number(x.l), Number(x.u)]), [[1, U.C9A], [2, U.C9B]]);
    assert.strictEqual(await pendingRow(U.C9A, id), undefined, 'gone from the queue');
  });

  let A3;
  await test('REPOSSESS above the threshold (basis - 1): the basis is the outstanding exposure, not the appraised value; a checker of the approver group (HO9) alone posts', async () => {
    A3 = await newAccount();
    const p = await preview(U.M9, A3, REP);
    expectStatus(p, 200, 'preview');
    const rep = p.data.data.events.find(e => e.event === 'REPOSSESS').tags;
    const exposure = ['OUT_PRIN', 'SUSP_CLR', 'UNCOL_INT', 'FEE_WO', 'PEN_WO'].reduce((s, k) => s + (rep[k] ? units(rep[k]) : 0n), 0n);
    const basis = p.data.data.approval.basis;
    assert.strictEqual(units(basis), exposure, `basis ${basis} = the outstanding exposure`);
    assert.ok(units(basis) > units(REP.appraisedValue), 'not the appraised value');
    await setThreshold('REPOSSESS', lakId, plus(basis, -1));
    const made = await tx(U.M9, A3, REP);
    expectStatus(made, 202, 'pending');
    assert.strictEqual(made.data.data.approval.requiresSecondApproval, true);
    const ok = await authorize(U.HO9, made.data.data.transactionId);
    expectStatus(ok, 200, 'the approver group posts alone');
    assert.strictEqual(ok.data.data.approval.approvedBy, 'APPROVER_GROUP');
    assert.ok(await postedLegs(made.data.data.transactionId) > 0);
    assert.strictEqual((await one('SELECT status s FROM ln_account WHERE id = ?', [A3])).s, 'REPOSSESSED');
    const log = await q("SELECT approvalLevel l, approverUserId u FROM ln_approval_log WHERE entityType = 'LOAN_TRANSACTION' AND entityId = ?", [made.data.data.transactionId]);
    assert.deepStrictEqual(log.map(x => [Number(x.l), Number(x.u)]), [[2, U.HO9]]);
  });

  let A4;
  await test('REPOSSESS above the threshold, rejected after the first approval: REJECTED with nothing posted (no leg, no GL row, account unchanged); the trail shows the approval and the rejection', async () => {
    A4 = await newAccount();
    const made = await tx(U.M9, A4, REP);
    expectStatus(made, 202, 'pending');
    const id = made.data.data.transactionId;
    const gl = await num('SELECT COUNT(*) n FROM general_ledger');
    const acct = JSON.stringify(await one('SELECT status, accountStage, CAST(repossessedCarrying AS CHAR) rc FROM ln_account WHERE id = ?', [A4]));
    expectStatus(await authorize(U.C9A, id), 202, 'first approval');
    expectStatus(await reject(U.C9B, id), 200, 'rejected by another checker');
    assert.strictEqual((await one('SELECT postingStatus s FROM ln_transaction WHERE id = ?', [id])).s, 'REJECTED');
    assert.strictEqual(await postedLegs(id), 0);
    assert.strictEqual(await num('SELECT COUNT(*) n FROM general_ledger'), gl, 'no GL row');
    assert.strictEqual(JSON.stringify(await one('SELECT status, accountStage, CAST(repossessedCarrying AS CHAR) rc FROM ln_account WHERE id = ?', [A4])), acct, 'account unchanged');
    const log = await q("SELECT approverUserId u, action a FROM ln_approval_log WHERE entityType = 'LOAN_TRANSACTION' AND entityId = ? ORDER BY id", [id]);
    assert.deepStrictEqual(log.map(x => [Number(x.u), x.a]), [[U.C9A, 'APPROVE'], [U.C9B, 'REJECT']]);
    expectStatus(await authorize(U.C9B, id), 409, 'a rejected transaction cannot be approved');
  });

  await test('no threshold for the kind and currency: one checker posts, as before (REPOSSESS in LAK after its threshold is closed); two AUTHORIZED thresholds for one kind and currency refuse with 409 and post nothing', async () => {
    const dup = await q('SELECT * FROM ln_approval_matrix WHERE id = ?', [rows[`REPOSSESS|${lakId}`]]);
    await q("INSERT INTO ln_approval_matrix (entityType, currencyId, minAmount, maxAmount, requiredLevel, approverRoleId, authStatus, makerId, checkerId, authorizedAt, createdAt, updatedAt) VALUES ('REPOSSESS', ?, 1, 1, 2, ?, 'AUTHORIZED', ?, ?, NOW(), NOW(), NOW())", [lakId, dup[0].approverRoleId, SUPER, SUPER2]);
    const extra = Number((await one("SELECT MAX(id) n FROM ln_approval_matrix WHERE entityType = 'REPOSSESS'")).n);
    const two = await preview(U.M9, A4, REP);
    expectStatus(two, 409, 'two thresholds');
    assert.match(two.data.message, /keep one/);
    await q("UPDATE ln_approval_matrix SET authStatus = 'CLOSED' WHERE id IN (?, ?)", [extra, rows[`REPOSSESS|${lakId}`]]);
    const p = await preview(U.M9, A4, REP);
    expectStatus(p, 200, 'preview');
    assert.strictEqual(p.data.data.approval, undefined, 'no approval block without a threshold');
    const made = await tx(U.M9, A4, REP);
    expectStatus(made, 202, 'pending');
    assert.strictEqual((await pendingRow(U.C9A, made.data.data.transactionId)).approval, null);
    const ok = await authorize(U.C9A, made.data.data.transactionId);
    expectStatus(ok, 200, 'one checker posts');
    assert.strictEqual(ok.data.data.approval, undefined);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_approval_log WHERE entityType = 'LOAN_TRANSACTION' AND entityId = ?", [made.data.data.transactionId]), 0, 'no approval-log row without a threshold');
  });

  await test('multi-currency thresholds: compared in the contract currency; the USD row governs a USD account and the LAK row does not (LAK threshold 1 kip, USD threshold above the USD basis: no second approval; USD threshold at the basis: first approval only, then rejected, nothing posted)', async () => {
    await setThreshold('WRITE_OFF', lakId, '1');
    await setThreshold('WRITE_OFF', usdId, '9999999999999999');
    const p = await preview(U.M9, USD, WO);
    expectStatus(p, 200, 'USD preview');
    const a = p.data.data.approval;
    assert.strictEqual(a.currencyId, usdId, 'the USD threshold applies');
    assert.strictEqual(a.thresholdId, rows[`WRITE_OFF|${usdId}`]);
    assert.strictEqual(a.requiresSecondApproval, false, 'below the USD threshold although far above the LAK one');
    const usdBasis = a.basis;
    assert.ok(units(usdBasis) < units('1000000'), `basis ${usdBasis} is in USD, not converted to LAK`);
    await setThreshold('WRITE_OFF', usdId, usdBasis);
    const p2 = await preview(U.M9, USD, WO);
    assert.strictEqual(p2.data.data.approval.requiresSecondApproval, true, 'at the USD threshold');
    const made = await tx(U.M9, USD, WO);
    expectStatus(made, 202, 'pending');
    const id = made.data.data.transactionId;
    const first = await authorize(U.C9A, id);
    expectStatus(first, 202, 'first approval in USD');
    assert.strictEqual(first.data.data.approval.label, '1 of 2 approvals');
    expectStatus(await reject(U.HO9, id), 200, 'rejected');
    assert.strictEqual(await postedLegs(id), 0, 'nothing posted');
    assert.notStrictEqual((await one('SELECT status s FROM ln_account WHERE id = ?', [USD])).s, 'WRITTEN_OFF');
  });

  await test('cleanup (approval by amount): T9 thresholds closed, switches back, T9 users inactive and their groups without grants', async () => {
    await q("UPDATE ln_approval_matrix SET authStatus = 'CLOSED' WHERE id IN (?)", [Object.values(rows)]);
    for (const [code, v] of Object.entries(prior)) await setSpf(code, v);
    await q("DELETE s FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE g.code IN ('T9_STAFF', 'T9_HO')");
    await q("UPDATE user SET isActive = 0 WHERE cus_id LIKE 't9\\_%'");
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_approval_matrix WHERE entityType IN ('WRITE_OFF', 'REPOSSESS') AND authStatus = 'AUTHORIZED'"), 0, 'no threshold left for later tests');
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_transaction t JOIN user u ON u.id = t.makerId WHERE u.cus_id LIKE 't9\\_%' AND t.postingStatus = 'PENDING_AUTH'"), 0, 'nothing left pending');
  });
};
