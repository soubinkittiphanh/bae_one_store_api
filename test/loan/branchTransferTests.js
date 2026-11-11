/**
 * Phase 6 Stage 4: BRANCH_TRANSFER (plan D2/D3, section 7 "Transfer" and R3).
 * Two accounts: a fresh LAK account, and a USD account whose carrying base comes from a DISB at 21,000 while
 * the latest authorized rate is different. Before and after each transfer, and after its LIFO reversal:
 *  (a) general_ledger per chart account (debit, credit, local) identical, no new GL row, no POS row;
 *  (b) ln_journal_posting summed company-wide per role and currency (amount and baseAmount) identical;
 *  (c) the USD carrying base moves at the carrying base (not today's rate), no FX_DIFF/FX_REVAL leg;
 *  (d) the company BS (loan section on) and the GL tie-out identical;
 *  branch BS: branch A drops by exactly what branch B gains; the reversal restores both, to the decimal.
 * Permissions: maker without the source branch (404), checker covering only one branch (403), the maker
 * authorizing their own (403). Refused with a pending transaction, to the same branch, to a branch without
 * an authorized profile; remarks and toBranchId required.
 * Users (group T8_STAFF: LN_ACCOUNT VIEW, LN_TRANSACTION VIEW/CREATE/AUTHORIZE, LN_LOOKUP VIEW):
 * M8 (A), M8B (B), C8A (A), C8B (B), C8AB (A and B).
 */
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

module.exports = async ({ test, call, q, db, users, L, expectStatus, branch: BRANCH_A }) => {
  const { SUPER, SUPER2, ADMIN } = users;
  const num = async (sql, params) => Number((await q(sql, params))[0].n);
  const one = async (sql, params) => (await q(sql, params))[0];
  const setSpf = (code, value) => q('UPDATE SPF SET value = ? WHERE code = ?', [value, code]);
  const AS_OF = '2100-12-31';
  const T = {};
  const prior = {};
  let BRANCH_B;
  let BRANCH_C; // an active location without an AUTHORIZED, active branch profile
  let lakId;
  let client;
  let product;
  let bank;
  let businessDate;
  const tx = (user, accountId, body) => call(user, 'post', `${L}/accounts/${accountId}/transactions`, body, { 'Idempotency-Key': `t8-${uuidv4()}` });
  const authorize = (user, txId) => call(user, 'post', `${L}/transactions/${txId}/authorize`, {});
  const reject = (user, txId) => call(user, 'post', `${L}/transactions/${txId}/reject`, { remarks: 'T8 test' });
  const branchOf = async id => Number((await one('SELECT branchId b FROM ln_account WHERE id = ?', [id])).b);

  // ---------------------------------------------------------------- snapshots
  const glState = async () => JSON.stringify({
    rows: await num('SELECT COUNT(*) n FROM general_ledger'),
    perAccount: await q(`SELECT x.a, CAST(SUM(x.dr) AS CHAR) dr, CAST(SUM(x.cr) AS CHAR) cr, CAST(SUM(x.ldr) AS CHAR) ldr, CAST(SUM(x.lcr) AS CHAR) lcr FROM (
        SELECT drAccountId a, debit dr, 0 cr, COALESCE(localDebit, 0) ldr, 0 lcr FROM general_ledger
        UNION ALL SELECT crAccountId a, 0, credit, 0, COALESCE(localCredit, 0) FROM general_ledger) x GROUP BY x.a ORDER BY x.a`)
  });
  const posState = async () => JSON.stringify({
    te: await num('SELECT COUNT(*) n FROM transactionEntry'), links: await num('SELECT COUNT(*) n FROM ln_pos_link'),
    ar: await num('SELECT COUNT(*) n FROM ARReceiveHeader'), bank: await q('SELECT id, CAST(balance AS CHAR) b FROM bankAccount ORDER BY id')
  });
  const roleSums = async () => JSON.stringify(await q(`SELECT roleCode, currencyId,
      CAST(SUM(CASE WHEN drCr = 'DR' THEN amount ELSE -amount END) AS CHAR) amount,
      CAST(SUM(CASE WHEN drCr = 'DR' THEN baseAmount ELSE -baseAmount END) AS CHAR) baseAmount
      FROM ln_journal_posting GROUP BY roleCode, currencyId ORDER BY roleCode, currencyId`));
  const ctl = () => require('../../src/GL/adbReportController');
  const runCtl = async (method, query) => { const r = {}; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; await ctl()[method]({ query }, r); return r; };
  const companyBs = async () => JSON.stringify((await runCtl('getBalanceSheet', { asOfDate: AS_OF })).body);
  const tieout = async () => JSON.stringify((await call(SUPER, 'get', `${L}/reports/gl-tieout`)).data.data);
  const branchBs = async b => {
    const r = await require('../../src/loan/reports/balanceSheetSection').buildBranch({ asOfDate: AS_OF, branchId: b });
    const m = {};
    for (const l of [...r.branch.assets, ...r.branch.liabilities]) m[l.accountNumber] = Math.round(Number(l.balance) * 10000);
    return m;
  };
  const delta = (after, before) => {
    const out = {};
    for (const k of new Set([...Object.keys(after), ...Object.keys(before)])) { const d = (after[k] || 0) - (before[k] || 0); if (d !== 0) out[k] = d; }
    return out;
  };
  const snapshot = async () => ({ gl: await glState(), pos: await posState(), roles: await roleSums(), bs: await companyBs(), tie: await tieout(), A: await branchBs(BRANCH_A), B: await branchBs(BRANCH_B) });
  const sameCompany = (now, was, label) => {
    assert.strictEqual(now.gl, was.gl, `${label}: general_ledger identical per chart account, no new row`);
    assert.strictEqual(now.pos, was.pos, `${label}: no transactionEntry, POS link, AR receipt or bank balance change`);
    assert.strictEqual(now.roles, was.roles, `${label}: ln_journal_posting per role and currency identical (amount and baseAmount)`);
    assert.strictEqual(now.bs, was.bs, `${label}: company balance sheet (loan section on) identical`);
    assert.strictEqual(now.tie, was.tie, `${label}: GL tie-out identical (memo legs exempt, not unlinked)`);
  };
  // TB by branch: per chart account, the net balances of the branches plus "Not branch-tagged" = company
  const tbNetHolds = async () => {
    const company = (await runCtl('getTrialBalance', { asOfDate: AS_OF })).body;
    const net = a => Math.round((a.totalDebits - a.totalCredits) * 100);
    const sum = {};
    const branches = (await q('SELECT DISTINCT branchId b FROM ln_journal_posting WHERE branchId IS NOT NULL UNION SELECT DISTINCT branchId FROM ln_transaction')).map(r => Number(r.b));
    let notTagged;
    for (const b of branches) {
      const r = (await runCtl('getTrialBalance', { asOfDate: AS_OF, branchId: String(b) })).body;
      for (const a of r.accounts) sum[a.id] = (sum[a.id] || 0) + net(a);
      notTagged = r.notBranchTagged;
    }
    for (const a of notTagged.accounts) sum[a.id] = (sum[a.id] || 0) + net(a);
    const off = company.accounts.filter(a => (sum[a.id] || 0) !== net(a)).map(a => `${a.accountNumber}: ${sum[a.id] || 0} vs ${net(a)}`);
    assert.deepStrictEqual(off, [], 'TB: branches + not tagged = company net balance per account');
  };

  // ---------------------------------------------------------------- setup
  let LAK; // a fresh disbursed LAK account at A
  let USD; // a USD account at A, DISB at 21,000
  await test('setup (stage 4): branch B with an authorized profile, a location without one, terminals, users M8 M8B C8A C8B C8AB, a fresh LAK account and the USD account with a DISB at 21,000 (latest rate different)', async () => {
    BRANCH_B = Number((await one('SELECT id FROM location WHERE id <> ? ORDER BY id LIMIT 1', [BRANCH_A])).id);
    if (!(await one("SELECT id FROM ln_branch_profile WHERE locationId = ? AND authStatus = 'AUTHORIZED' AND isActive = 1", [BRANCH_B]))) {
      const made = await call(SUPER, 'post', `${L}/params/branch-profile`, { locationId: BRANCH_B, branchCode: 'SR2', isActive: true });
      expectStatus(made, 201, 'profile at B');
      expectStatus(await call(SUPER2, 'post', `${L}/params/branch-profile/${made.data.data.id}/authorize`), 200, 'authorize B');
    }
    let c = await one("SELECT l.id FROM location l WHERE l.isActive = 1 AND l.id NOT IN (?, ?) AND NOT EXISTS (SELECT 1 FROM ln_branch_profile p WHERE p.locationId = l.id AND p.authStatus = 'AUTHORIZED' AND p.isActive = 1) ORDER BY l.id LIMIT 1", [BRANCH_A, BRANCH_B]);
    if (!c) {
      await q("INSERT INTO location (name, description, isActive, createdAt, updateTimestamp) VALUES ('T8 no profile', 'T8', 1, NOW(), NOW())");
      c = await one("SELECT id FROM location WHERE name = 'T8 no profile' ORDER BY id DESC LIMIT 1");
    }
    BRANCH_C = Number(c.id);
    const term = {};
    for (const [k, code, loc] of [['A', 990811, BRANCH_A], ['B', 990812, BRANCH_B]]) {
      await q('INSERT INTO terminal (code, name, isActive, createdAt, updateTimestamp, locationId) VALUES (?, ?, 1, NOW(), NOW(), ?)', [code, `T8 terminal ${k}`, loc]);
      term[k] = Number((await one('SELECT id FROM terminal WHERE code = ?', [code])).id);
    }
    await q("INSERT INTO userGroup (name, code, isActive, createdAt, updateTimestamp, homePage) VALUES ('T8_STAFF', 'T8_STAFF', 1, NOW(), NOW(), '/')");
    const g = Number((await one("SELECT id FROM userGroup WHERE code = 'T8_STAFF'")).id);
    for (const [f, a] of [['LN_ACCOUNT', 'VIEW'], ['LN_TRANSACTION', 'VIEW'], ['LN_TRANSACTION', 'CREATE'], ['LN_TRANSACTION', 'AUTHORIZE'], ['LN_LOOKUP', 'VIEW']]) {
      await q('INSERT INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, ?, ?)', [g, f, a]);
    }
    for (const [name, terms] of [['t8_m8', ['A']], ['t8_m8b', ['B']], ['t8_c8a', ['A']], ['t8_c8b', ['B']], ['t8_c8ab', ['A', 'B']]]) {
      await q("INSERT INTO user (cus_id, cus_pass, cus_name, isActive, createdAt, updateTimestamp, groupId) VALUES (?, '!not-a-login', ?, 1, NOW(), NOW(), ?)", [name, name, g]);
      const id = Number((await one('SELECT id FROM user WHERE cus_id = ?', [name])).id);
      for (const t of terms) await q('INSERT INTO UserTerminals (createdAt, updateTimestamp, userId, terminalId) VALUES (NOW(), NOW(), ?, ?)', [id, term[t]]);
      T[name.slice(3).toUpperCase()] = id;
    }
    for (const code of ['LOAN_POSTING_ENABLED', 'BS_INCLUDE_LOAN_BOOK', 'LOAN_ALLOW_SELF_AUTHORIZE']) prior[code] = (await one('SELECT value v FROM SPF WHERE code = ?', [code])).v;
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    await setSpf('BS_INCLUDE_LOAN_BOOK', 'true');
    await setSpf('LOAN_ALLOW_SELF_AUTHORIZE', 'false');
    lakId = Number((await one('SELECT id FROM currency WHERE isLocalCCY = 1 LIMIT 1')).id);
    client = Number((await one('SELECT id FROM client ORDER BY id LIMIT 1')).id);
    product = Number((await one("SELECT id FROM ln_product WHERE productCode = 'CAR-LOAN-DB' AND authStatus = 'AUTHORIZED' AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1")).id);
    bank = Number((await one("SELECT id FROM bankAccount WHERE accountNumber = '1105'")).id);
    businessDate = (await one("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1")).d;

    // fresh LAK account at A: sale + invoice + down payment, application by ADMIN, booked, fee collected, disbursed
    const tag = uuidv4().slice(0, 8);
    const sale = await db.saleHeader.create({ bookingDate: businessDate, referenceNo: `T8-${tag}`, locationId: BRANCH_A, total: 300000000, exchangeRate: 1, isActive: true, clientId: client, currencyId: lakId, isPostedToAR: true });
    const invoice = await db.arInvoiceHeader.create({ invoiceNumber: `INV-T8-${tag}`, invoiceDate: businessDate, totalAmount: '300000000.00', netAmount: '300000000.00', taxAmount: 0, status: 'sent', clientId: client, currencyId: lakId, saleHeaderId: sale.id, sourceType: 'POS_ORDER', glPostingStatus: 'posted', exchangeRate: 1 });
    const line = await db.arInvoiceLine.create({ lineNumber: 1, description: 'Vehicle', quantity: 1, unitPrice: '300000000.00', lineTotal: '300000000.00', invoiceHeaderId: invoice.id });
    await sale.update({ arInvoiceId: invoice.id });
    const dp = await db.arReceiveHeaderV2.create({ receiptNumber: `DP-T8-${tag}`, bookingDate: businessDate, receivedDate: businessDate, invoiceHeaderId: invoice.id, totalReceivedAmount: '60000000.00', paymentMethod: 'cash', status: 'active', currencyId: lakId, glPostingStatus: 'unposted', exchangeRate: 1 });
    await db.arReceiveLine.create({ receiveHeaderId: dp.id, lineNumber: 1, invoiceLineId: line.id, allocatedAmount: '60000000.00', allocationDate: businessDate });
    const app = await call(ADMIN, 'post', `${L}/applications`, { customerId: client, productId: product, currencyId: lakId, vehicleSaleHeaderId: sale.id, vehiclePrice: '300000000', downPaymentAmount: '60000000', requestedAmount: '240000000', tenorMonths: 12, interestRate: '0.18', valueDate: businessDate });
    expectStatus(app, 201, 'application');
    expectStatus(await call(ADMIN, 'post', `${L}/applications/${app.data.data.id}/submit`), 200, 'submit');
    expectStatus(await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/approve`), 200, 'approve');
    const booked = await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/book`);
    expectStatus(booked, 201, 'book');
    LAK = Number(booked.data.data.account.id);
    expectStatus(await tx(ADMIN, LAK, { kind: 'FEE_COLLECT', bankAccountId: bank, insurancePremium: '7000000' }), 201, 'fee collect');
    const disb = await tx(ADMIN, LAK, { kind: 'DISB' });
    expectStatus(disb, 202, 'DISB pending');
    expectStatus(await authorize(SUPER, disb.data.data.transactionId), 200, 'DISB');

    const usd = await one(`SELECT a.id, a.currencyId c FROM ln_account a JOIN ln_transaction t ON t.loanAccountId = a.id AND t.eventCode = 'DISB' AND t.postingStatus = 'POSTED'
      WHERE a.currencyId <> ? AND t.exchangeRate = 21000 AND a.accountStage = 'DISBURSED' AND a.branchId = ? ORDER BY a.id LIMIT 1`, [lakId, BRANCH_A]);
    assert.ok(usd, 'the posting tests leave a USD account disbursed at 21,000 at branch A');
    USD = Number(usd.id);
    const latest = await one("SELECT CAST(rate AS CHAR) r FROM ln_exchange_rate WHERE currencyId = ? AND authStatus = 'AUTHORIZED' AND rateDate <= ? ORDER BY rateDate DESC LIMIT 1", [usd.c, businessDate]);
    assert.ok(latest && Number(latest.r) !== 21000, `a later rate different from 21,000 (${latest && latest.r})`);
    console.log(`        LAK account ${LAK}, USD account ${USD} (DISB at 21,000, latest rate ${latest.r}), branches A=${BRANCH_A} B=${BRANCH_B} C(no profile)=${BRANCH_C}`);
  });

  // ---------------------------------------------------------------- refusals and permissions
  await test('BRANCH_TRANSFER refusals: remarks and toBranchId required (400); to the same branch, to a branch without an authorized profile, with a pending transaction on the account (409); a maker without the source branch gets 404; nothing is written', async () => {
    // the dialog's destinations: /lookups lists active branches with an AUTHORIZED, active profile (B), not C
    const dest = (await call(T.M8, 'get', `${L}/lookups`)).data.data.transferBranches.map(b => b.id);
    assert.ok(dest.includes(BRANCH_A) && dest.includes(BRANCH_B) && !dest.includes(BRANCH_C), `transfer destinations ${dest.join(', ')}`);
    const before = await snapshot();
    const txCount = await num('SELECT COUNT(*) n FROM ln_transaction');
    expectStatus(await tx(T.M8, LAK, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_B }), 400, 'no remarks');
    expectStatus(await tx(T.M8, LAK, { kind: 'BRANCH_TRANSFER', remarks: 'move' }), 400, 'no toBranchId');
    const same = await tx(T.M8, LAK, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_A, remarks: 'move' });
    expectStatus(same, 409, 'same branch');
    assert.match(same.data.message, /already at branch/);
    const noProfile = await tx(T.M8, LAK, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_C, remarks: 'move' });
    expectStatus(noProfile, 409, 'no profile');
    assert.match(noProfile.data.message, /no AUTHORIZED, active branch profile/);
    expectStatus(await tx(T.M8B, LAK, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_B, remarks: 'move' }), 404, 'maker without the source branch');
    assert.strictEqual(await num('SELECT COUNT(*) n FROM ln_transaction'), txCount, 'no transaction row');
    // a pending transaction blocks the transfer
    const pend = await tx(T.M8, LAK, { kind: 'REPOSSESS', appraisedValue: '100000000', remarks: 'T8 pending' });
    expectStatus(pend, 202, 'a pending REPOSSESS');
    const blocked = await tx(T.M8, LAK, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_B, remarks: 'move' });
    expectStatus(blocked, 409, 'pending transaction');
    assert.match(blocked.data.message, /has a pending transaction/);
    expectStatus(await reject(T.C8A, pend.data.data.transactionId), 200, 'reject the pending one');
    sameCompany(await snapshot(), before, 'refusals');
    assert.strictEqual(await branchOf(LAK), BRANCH_A);
  });

  // ---------------------------------------------------------------- LAK transfer
  let lakBefore;
  let lakTransfer;
  await test('LAK transfer A -> B: M8 makes it (202, PENDING, account still at A); M8 cannot authorize (403); C8A (only A) cannot (403); C8AB (A and B) authorizes; account at B, history row, memo legs only (no GL/POS row), company books, BS and tie-out identical; branch A drops by exactly what B gains; TB nets', async () => {
    lakBefore = await snapshot();
    const made = await tx(T.M8, LAK, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_B, remarks: 'customer moved to branch B' });
    expectStatus(made, 202, 'pending');
    lakTransfer = made.data.data.transactionId;
    assert.ok(made.data.data.preview.journal.length > 0, 'the preview lists the memo legs');
    assert.strictEqual(await branchOf(LAK), BRANCH_A, 'still at A while pending');
    expectStatus(await authorize(T.M8, lakTransfer), 403, 'the maker');
    const one1 = await authorize(T.C8A, lakTransfer);
    expectStatus(one1, 403, 'checker covering only A');
    assert.match(one1.data.message, /covering both branches/);
    expectStatus(await authorize(T.C8AB, lakTransfer), 200, 'checker covering A and B');
    assert.strictEqual(await branchOf(LAK), BRANCH_B, 'account at B');
    const hist = await q('SELECT fromBranchId f, toBranchId t, transactionId x, makerId m, checkerId c FROM ln_account_branch_history WHERE loanAccountId = ? ORDER BY id', [LAK]);
    assert.deepStrictEqual(hist.map(h => [Number(h.f), Number(h.t), Number(h.x), Number(h.m), Number(h.c)]), [[BRANCH_A, BRANCH_B, lakTransfer, T.M8, T.C8AB]]);
    const legs = await q('SELECT branchId b, drCr d, roleCode r, amountTag g, glRecordId gl, CAST(amount AS CHAR) a, CAST(baseAmount AS CHAR) ba FROM ln_journal_posting WHERE transactionId = ?', [lakTransfer]);
    assert.ok(legs.length >= 2 && legs.every(l => l.g === 'BRANCH_TRANSFER' && l.gl === null && [BRANCH_A, BRANCH_B].includes(Number(l.b))), 'memo legs at A and B, no GL row');
    assert.ok(legs.some(l => l.r === 'LOAN_PORTFOLIO'), 'the portfolio moves');
    assert.ok(!legs.some(l => ['CASH_BANK', 'SALE_RECEIVABLE', 'CCY_POSITION', 'TAX_PAYABLE'].includes(l.r)), 'no cash, POS AR, currency position or VAT leg');
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_pos_link WHERE transactionId = ?", [lakTransfer]), 0);
    const after = await snapshot();
    sameCompany(after, lakBefore, 'LAK transfer');
    const dA = delta(after.A, lakBefore.A);
    const dB = delta(after.B, lakBefore.B);
    assert.ok(Object.keys(dB).length > 0, 'branch B gained the account\'s lines');
    assert.deepStrictEqual(dA, Object.fromEntries(Object.entries(dB).map(([k, v]) => [k, -v])), 'branch A drops by exactly what B gains, per chart account');
    await tbNetHolds();
    console.log(`        LAK: ${legs.length} memo legs; branch B gained ${JSON.stringify(dB)} (units of 0.0001)`);
  });

  // ---------------------------------------------------------------- USD transfer
  let usdBefore;
  let usdTransfer;
  await test('USD transfer A -> B (DISB at 21,000, latest rate different): the carrying base moves at the carrying base, not today\'s rate; no FX_DIFF/FX_REVAL leg; company books, BS and tie-out identical; branch A drops by exactly what B gains', async () => {
    // any pending transaction left by the earlier tests blocks it: shown, then rejected by a non-maker
    for (const p of await q("SELECT id, makerId m FROM ln_transaction WHERE loanAccountId = ? AND postingStatus = 'PENDING_AUTH'", [USD])) {
      expectStatus(await tx(T.M8, USD, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_B, remarks: 'x' }), 409, 'pending on the USD account');
      expectStatus(await reject(Number(p.m) === Number(SUPER) ? SUPER2 : SUPER, p.id), 200, 'reject it');
    }
    const carrying = async b => q(`SELECT roleCode r, COALESCE(statusQualifier, '') s, chartAccountId c,
        CAST(SUM(CASE WHEN drCr = 'DR' THEN amount ELSE -amount END) AS CHAR) a, CAST(SUM(CASE WHEN drCr = 'DR' THEN baseAmount ELSE -baseAmount END) AS CHAR) ba
        FROM ln_journal_posting WHERE loanAccountId = ? AND branchId = ? AND roleCode = 'LOAN_PORTFOLIO' GROUP BY 1, 2, 3 HAVING SUM(CASE WHEN drCr = 'DR' THEN amount ELSE -amount END) <> 0 ORDER BY 1, 2, 3`, [USD, b]);
    const atA = await carrying(BRANCH_A);
    assert.ok(atA.length > 0, 'a USD portfolio balance at A');
    usdBefore = await snapshot();
    const made = await tx(T.M8, USD, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_B, remarks: 'USD customer moved' });
    expectStatus(made, 202, 'pending');
    usdTransfer = made.data.data.transactionId;
    expectStatus(await authorize(T.C8AB, usdTransfer), 200, 'authorized');
    const legs = await q("SELECT amountTag g, isBaseOnly bo, branchId b, roleCode r, drCr d, CAST(amount AS CHAR) a, CAST(baseAmount AS CHAR) ba, CAST(exchangeRate AS CHAR) x FROM ln_journal_posting WHERE transactionId = ?", [usdTransfer]);
    assert.ok(!legs.some(l => ['FX_DIFF', 'FX_REVAL'].includes(l.g)), 'no FX_DIFF/FX_REVAL leg');
    assert.deepStrictEqual(await carrying(BRANCH_B), atA, 'B now holds exactly A\'s portfolio amount and carrying base');
    assert.deepStrictEqual(await carrying(BRANCH_A), [], 'A holds none');
    const latest = Number((await one("SELECT rate r FROM ln_exchange_rate WHERE currencyId = (SELECT currencyId FROM ln_account WHERE id = ?) AND authStatus = 'AUTHORIZED' AND rateDate <= ? ORDER BY rateDate DESC LIMIT 1", [USD, businessDate])).r);
    for (const p of atA) {
      const atToday = Math.round(Math.abs(Number(p.a)) * latest);
      assert.notStrictEqual(Math.round(Math.abs(Number(p.ba))), atToday, `carrying base ${p.ba} is not the amount ${p.a} at today's rate ${latest}`);
    }
    const after = await snapshot();
    sameCompany(after, usdBefore, 'USD transfer');
    const dA = delta(after.A, usdBefore.A);
    const dB = delta(after.B, usdBefore.B);
    assert.ok(Object.keys(dB).length > 0);
    assert.deepStrictEqual(dA, Object.fromEntries(Object.entries(dB).map(([k, v]) => [k, -v])), 'branch A drops by exactly what B gains');
    await tbNetHolds();
    const pf = legs.find(l => l.r === 'LOAN_PORTFOLIO' && Number(l.b) === BRANCH_B);
    console.log(`        USD portfolio moved: ${pf.a} at carrying base ${pf.ba} (rate ${pf.x}; latest ${latest}); ${legs.length} memo legs`);
  });

  // ---------------------------------------------------------------- reversals
  await test('LIFO REVERSAL of each transfer: made at B (M8B), C8B (only B) cannot authorize (403), C8AB does; the account is back at A, a second history row; every snapshot (GL, POS, per-role journal sums, company BS, tie-out, branch A and B) equals the one before the transfer, to the decimal', async () => {
    for (const [acct, target, before] of [[USD, usdTransfer, usdBefore], [LAK, lakTransfer, lakBefore]]) {
      expectStatus(await tx(T.M8, acct, { kind: 'REVERSAL', targetTransactionId: target, remarks: 'undo' }), 404, 'M8 (A only) no longer reaches the account at B');
      const rev = await tx(T.M8B, acct, { kind: 'REVERSAL', targetTransactionId: target, remarks: 'undo the transfer' });
      expectStatus(rev, 202, 'reversal pending');
      const onlyB = await authorize(T.C8B, rev.data.data.transactionId);
      expectStatus(onlyB, 403, 'checker covering only B');
      assert.match(onlyB.data.message, /covering both branches/);
      expectStatus(await authorize(T.C8AB, rev.data.data.transactionId), 200, 'reversal authorized');
      assert.strictEqual(await branchOf(acct), BRANCH_A, 'back at A');
      const legs = await q('SELECT branchId b, amountTag g, glRecordId gl FROM ln_journal_posting WHERE transactionId = ?', [rev.data.data.transactionId]);
      assert.ok(legs.length > 0 && legs.every(l => l.g === 'BRANCH_TRANSFER' && l.gl === null && [BRANCH_A, BRANCH_B].includes(Number(l.b))), 'mirrored memo legs on their original branches');
      const hist = await q('SELECT fromBranchId f, toBranchId t FROM ln_account_branch_history WHERE loanAccountId = ? ORDER BY id', [acct]);
      assert.deepStrictEqual(hist.map(h => [Number(h.f), Number(h.t)]), [[BRANCH_A, BRANCH_B], [BRANCH_B, BRANCH_A]]);
      const now = await snapshot();
      if (acct === LAK) assert.deepStrictEqual(now, before, 'LAK: everything as before the transfer (after the USD reversal too)');
      else sameCompany(now, before, 'USD reversal');
    }
    await tbNetHolds();
  });

  await test('BRANCH_TRANSFER is LIFO-safe: a transfer blocks the reversal of an earlier transaction until it is reversed itself', async () => {
    const made = await tx(T.M8, LAK, { kind: 'BRANCH_TRANSFER', toBranchId: BRANCH_B, remarks: 'again' });
    expectStatus(made, 202, 'pending');
    expectStatus(await authorize(T.C8AB, made.data.data.transactionId), 200, 'posted');
    const earlier = await one("SELECT id FROM ln_transaction WHERE loanAccountId = ? AND eventCode = 'FEE_COLLECT' AND postingStatus = 'POSTED' AND isReversed = 0", [LAK]);
    const blocked = await tx(T.M8B, LAK, { kind: 'REVERSAL', targetTransactionId: earlier.id, remarks: 'x' });
    expectStatus(blocked, 409, 'LIFO');
    assert.match(blocked.data.message, /LIFO/);
    const rev = await tx(T.M8B, LAK, { kind: 'REVERSAL', targetTransactionId: made.data.data.transactionId, remarks: 'undo' });
    expectStatus(await authorize(T.C8AB, rev.data.data.transactionId), 200, 'reversed');
    assert.strictEqual(await branchOf(LAK), BRANCH_A);
  });

  await test('cleanup (stage 4): switches back, T8 users inactive and their group without grants', async () => {
    for (const [code, v] of Object.entries(prior)) await setSpf(code, v);
    await q("DELETE s FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE g.code = 'T8_STAFF'");
    await q("UPDATE user SET isActive = 0 WHERE cus_id LIKE 't8\\_%'");
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_transaction WHERE eventCode = 'BRANCH_TRANSFER' AND postingStatus = 'POSTED' AND isReversed = 0"), 0, 'every transfer reversed');
  });
};
