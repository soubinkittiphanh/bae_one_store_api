/**
 * Phase 4 posting, EOD and balance-sheet tests (local test DB only, run from test/loan/run.js).
 * Sandbox GL accounts come from loan_propose_accounts.js --apply; the POS sale / AR invoice / down
 * payment are test fixtures created with the POS models.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const E = require('../../src/loan/engine');

const API_ROOT = path.resolve(__dirname, '../..');

module.exports = async ({ test: runTest, call, q, db, runNode, users, L, expectStatus }) => {
  const { SUPER, ADMIN, CASHIER } = users;
  // LOAN_POSTING_ONLY=<regex>: run only the setup and the matching posting tests (for running one case in isolation)
  const only = process.env.LOAN_POSTING_ONLY ? new RegExp(process.env.LOAN_POSTING_ONLY) : null;
  const test = (name, fn) => (!only || /^setup:/.test(name) || only.test(name) ? runTest(name, fn) : console.log(`  SKIP  ${name}`));
  const D = E.dates;
  const num = async (sql, params) => Number((await q(sql, params))[0].n);
  const setSpf = (code, value) => q('UPDATE SPF SET value = ? WHERE code = ?', [value, code]);
  const setBusinessDate = async (d) => {
    await q('UPDATE ln_system_date SET prevBusinessDate = ?, currentBusinessDate = ?, nextBusinessDate = ?', [D.addDays(d, -1), d, D.addDays(d, 1)]);
  };
  const businessDate = async () => (await q("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1"))[0].d;
  const post = (user, accountId, body, { key, failAt } = {}) => call(user, 'post', `${L}/accounts/${accountId}/transactions`, body,
    { 'Idempotency-Key': key || `t-${uuidv4()}`, ...(failAt ? { 'X-Loan-Test-Fail-At': failAt } : {}) });
  const authorize = (user, txId, failAt) => call(user, 'post', `${L}/transactions/${txId}/authorize`, {}, failAt ? { 'X-Loan-Test-Fail-At': failAt } : {});
  // Maker ADMIN creates, checker SUPER authorizes
  const makerChecker = async (accountId, body, label) => {
    const created = await post(ADMIN, accountId, body);
    expectStatus(created, 202, `${label} pending`);
    // Phase 5 B4: the checker queue lists it with its maker
    const queued = (await call(SUPER, 'get', `${L}/transactions/pending`)).data.data.find(t => t.transactionId === created.data.data.transactionId);
    assert.ok(queued && Number(queued.makerId) === Number(ADMIN) && queued.amount !== undefined, `${label} in the pending queue`);
    if (queued.currency !== 'LAK') assert.ok(queued.fx && 'warning' in queued.fx, `${label}: foreign pending shows its rate block`);
    expectStatus(await authorize(ADMIN, created.data.data.transactionId), 403, `${label} self authorize`);
    const done = await authorize(SUPER, created.data.data.transactionId);
    expectStatus(done, 200, `${label} authorize`);
    return done.data.data;
  };
  const tagsOf = (body, event) => (body.events.find(e => e.event === event) || {}).tags;
  const counts = async (bankId) => ({
    tx: await num('SELECT COUNT(*) n FROM ln_transaction'),
    jp: await num('SELECT COUNT(*) n FROM ln_journal_posting'),
    gl: await num('SELECT COUNT(*) n FROM general_ledger'),
    te: await num('SELECT COUNT(*) n FROM transactionEntry'),
    links: await num('SELECT COUNT(*) n FROM ln_pos_link'),
    ar: await num('SELECT COUNT(*) n FROM ARReceiveHeader'),
    idem: await num("SELECT COUNT(*) n FROM ln_idempotency WHERE endpoint LIKE 'POST%'"),
    bank: bankId ? (await q('SELECT CAST(balance AS CHAR) b FROM bankAccount WHERE id = ?', [bankId]))[0].b : null
  });
  const bankBalance = async id => Number((await q('SELECT balance b FROM bankAccount WHERE id = ?', [id]))[0].b);
  // The balance sheet controller as it is on main (before the loan module), loaded from a temp copy with absolute requires
  let mainBsController;
  const loadMainBsController = () => {
    if (mainBsController) return mainBsController;
    const original = execFileSync('git', ['show', 'main:src/GL/adbReportController.js'], { cwd: API_ROOT }).toString()
      .replace(/require\((['"])\.\.\//g, `require($1${path.join(API_ROOT, 'src')}/`)
      .replace(/require\((['"])([^./'"][^'"]*)\1\)/g, (m, q, name) => `require(${JSON.stringify(require.resolve(name, { paths: [API_ROOT] }))})`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-orig-'));
    const origFile = path.join(tmp, 'adbReportController.js');
    fs.writeFileSync(origFile, original);
    mainBsController = require(origFile);
    return mainBsController;
  };
  const callBs = async (Ctl) => { const r = {}; r.status = () => r; r.json = (b) => { r.body = b; return r; }; await Ctl.getBalanceSheet({ query: { asOfDate: '2100-12-31' } }, r); return r.body; };

  // ------------------------------------------------------------------ condition 2: bank snapshot and statement
  await test('POS bank: LOAN_IN of X raises the COB daily snapshot and the statement by X; LOAN_OUT lowers them (real POS functions)', async () => {
    const { bankMovement } = require('../../src/loan/posting/posAdapters');
    const cob = require('../../src/accountDailyBalance/controller');
    const statement = require('../../src/transactionEntry/controller');
    const bank = await db.bankAccount.create({ accountNumber: `LN-COB-${Date.now()}`, accountName: 'Loan COB test', accountType: 'Current', currency: 'LAK', isActive: true, balance: 0 });
    await db.sequelize.transaction(async (t) => {
      await bankMovement({ transactionId: 0, txNo: 'COBTEST-1', bankAccountId: bank.id, units: 15000000000n, currencyCode: 'LAK', description: 'condition 2 in', userId: SUPER }, t);
      await bankMovement({ transactionId: 0, txNo: 'COBTEST-2', bankAccountId: bank.id, units: -4000000000n, currencyCode: 'LAK', description: 'condition 2 out', userId: SUPER }, t);
    });
    await q('DELETE FROM ln_pos_link WHERE transactionId = 0');
    const posDate = (await q("SELECT DATE_FORMAT(currentDate, '%Y-%m-%d') d FROM businessDate ORDER BY id DESC LIMIT 1"))[0].d;
    const entries = await q('SELECT transactionType t, debit, credit FROM transactionEntry WHERE bankAccountId = ? ORDER BY id', [bank.id]);
    assert.deepStrictEqual(entries.map(e => `${e.t}:${e.debit}:${e.credit}`), ['LOAN_IN:0:1500000', 'LOAN_OUT:400000:0'], 'LOAN_IN is a credit (in), LOAN_OUT a debit (out)');
    const resOf = () => { const r = {}; r.status = () => r; r.json = (b) => { r.body = b; return r; }; return r; };
    const cobRes = resOf();
    await cob.runCOBBatch({}, cobRes);
    const snap = cobRes.body.summary.find(s => s.accountId === bank.id);
    const stRes = resOf();
    await statement.getAccountStatement({ params: { accountId: bank.id }, query: { startDate: posDate, endDate: posDate } }, stRes);
    const st = stRes.body.statement;
    const rows = st.transactions.map(t => `${t.transactionType} in=${t.amountIn} out=${t.amountOut}`);
    console.log(`        COB snapshot ${posDate}: totalIn ${snap.totalIn}, totalOut ${snap.totalOut}, closing ${snap.closingBalance}`);
    console.log(`        Statement: ${rows.join('; ')}; totalIn ${st.totalIn}, totalOut ${st.totalOut}, closing ${st.closingBalance}`);
    assert.deepStrictEqual([snap.totalIn, snap.totalOut, snap.closingBalance], [1500000, 400000, 1100000]);
    assert.deepStrictEqual(rows, ['LOAN_IN in=1500000 out=0', 'LOAN_OUT in=0 out=400000']);
    assert.deepStrictEqual([st.totalIn, st.totalOut, st.closingBalance], [1500000, 400000, 1100000]);
    assert.strictEqual(await bankBalance(bank.id), 1100000);
    const school = await q("SELECT COUNT(*) n FROM transactionEntry WHERE bankAccountId = ? AND transactionType IN ('TOPUP','REFUND','WITHDRAW')", [bank.id]);
    assert.strictEqual(Number(school[0].n), 0, 'not visible to the school TOPUP/REFUND report');
  });

  // ------------------------------------------------------------------ setup: sandbox accounts, switches, fixtures
  let bank;
  let product;
  let lakId;
  await test('setup: proposed accounts applied (sandbox) and mappings authorized by a second user; switches; bank account; dates', async () => {
    const out = runNode('loan_propose_accounts.js', ['--apply', '--yes', '--features=VAT,FX']);
    assert.match(out, /Applied: 26 account\(s\) created, \d+ PENDING mapping/);
    // Phase 5 FX roles and tags are seeded PENDING: a checker authorizes them like any parameter
    for (const [entity, codes] of [['accounting-role', ['FX_GAIN_REALIZED', 'FX_LOSS_REALIZED', 'FX_GAIN_UNREALIZED', 'FX_LOSS_UNREALIZED', 'CCY_POSITION']], ['amount-tag', ['FX_DIFF', 'FX_REVAL']]]) {
      const col = entity === 'accounting-role' ? 'roleCode' : 'tagCode';
      const table = entity === 'accounting-role' ? 'ln_accounting_role' : 'ln_amount_tag';
      const ids = (await q(`SELECT id FROM ${table} WHERE ${col} IN (${codes.map(() => '?').join(',')}) AND authStatus = 'PENDING'`, codes)).map(r => Number(r.id));
      assert.strictEqual(ids.length, codes.length, `${entity}: pending FX rows`);
      expectStatus(await call(SUPER, 'post', `${L}/params/${entity}/bulk-authorize`, { keys: ids }), 200, `authorize ${entity}`);
    }
    expectStatus(await call(ADMIN, 'post', `${L}/params/role-gl-mapping/bulk-authorize`, { keys: [1] }), 403, 'admin cannot authorize GL mappings');
    const pending = (await call(SUPER, 'get', `${L}/params/role-gl-mapping?authStatus=PENDING&limit=500`)).data.data.items;
    assert.ok(pending.length >= 20);
    expectStatus(await call(SUPER, 'post', `${L}/params/role-gl-mapping/bulk-authorize`, { keys: pending.map(m => m.id) }), 200, 'authorize mappings (maker is the seed)');
    await setSpf('GL_MAP_VAT_OUTPUT_ACC', '2131');
    const chart = await db.chartAccount.create({ accountNumber: '1105', accountName: 'Loan test bank', accountLLName: 'Loan test bank', accountType: 'Asset', isActive: true });
    assert.ok(chart.id);
    bank = await db.bankAccount.create({ accountNumber: '1105', accountName: 'Loan test bank', accountType: 'Current', currency: 'LAK', isActive: true, balance: 5000000000 });
    await db.businessDate.create({ currentDate: '2030-12-31', status: 'OPEN' });
    // Manual POS close of business: loan EOD for a date runs only once the POS date is later (Phase 5, D7)
    await setSpf('USE_BUSINESS_DATE', 'Y');
    await setBusinessDate('2026-11-02');
    await q("UPDATE ln_system_date SET periodLockDate = '2026-10-01'");
    // The 2A/2B seeds stamp effectiveFrom with the day they run (Asia/Vientiane). The business date above is
    // fixed, so on any run after 2026-11-02 the seeded rules would not be in force yet. Backdate only the rows
    // the seeds stamped today (entry rules: seed rows have no maker), so the suite does not depend on the calendar.
    const seedDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });
    if (seedDay > '2026-11-02') {
      await q("UPDATE ln_accounting_entry_rule SET effectiveFrom = '2026-01-01' WHERE effectiveFrom = ? AND makerId IS NULL", [seedDay]);
      await q("UPDATE ln_status_movement_rule SET effectiveFrom = '2026-01-01' WHERE effectiveFrom = ?", [seedDay]);
      await q("UPDATE ln_provision_rule SET effectiveFrom = '2026-01-01' WHERE effectiveFrom = ?", [seedDay]);
    }
    product =(await call(ADMIN, 'get', `${L}/products?search=CAR-LOAN-DB`)).data.data.find(p => p.authStatus === 'AUTHORIZED' && p.status === 'ACTIVE');
    lakId = (await q('SELECT id FROM currency WHERE isLocalCCY = 1 LIMIT 1'))[0].id;
    await q("UPDATE ln_tax_profile SET confirmationStatus = 'CONFIRMED'");
  });

  let saleSeq = 0;
  const makeLoan = async () => {
    saleSeq++;
    const d = await businessDate();
    const client = (await q('SELECT id FROM client ORDER BY id LIMIT 1'))[0];
    const sale = await db.saleHeader.create({ bookingDate: d, referenceNo: `LN-SALE-${saleSeq}-${Date.now()}`, total: 300000000, exchangeRate: 1, isActive: true, clientId: client.id, currencyId: lakId, isPostedToAR: true });
    const invoice = await db.arInvoiceHeader.create({ invoiceNumber: `INV-LN-${saleSeq}-${Date.now()}`, invoiceDate: d, totalAmount: '300000000.00', netAmount: '300000000.00', taxAmount: 0, status: 'sent', clientId: client.id, currencyId: lakId, saleHeaderId: sale.id, sourceType: 'POS_ORDER', glPostingStatus: 'posted', exchangeRate: 1 });
    const line = await db.arInvoiceLine.create({ lineNumber: 1, description: 'Vehicle', quantity: 1, unitPrice: '300000000.00', lineTotal: '300000000.00', invoiceHeaderId: invoice.id });
    await sale.update({ arInvoiceId: invoice.id });
    const dp = await db.arReceiveHeaderV2.create({ receiptNumber: `DP-LN-${saleSeq}-${Date.now()}`, bookingDate: d, receivedDate: d, invoiceHeaderId: invoice.id, totalReceivedAmount: '60000000.00', paymentMethod: 'cash', status: 'active', currencyId: lakId, glPostingStatus: 'unposted', exchangeRate: 1 });
    await db.arReceiveLine.create({ receiveHeaderId: dp.id, lineNumber: 1, invoiceLineId: line.id, allocatedAmount: '60000000.00', allocationDate: d });
    const app = await call(ADMIN, 'post', `${L}/applications`, { customerId: client.id, productId: product.id, currencyId: lakId, vehicleSaleHeaderId: sale.id, vehiclePrice: '300000000', downPaymentAmount: '60000000', requestedAmount: '240000000', tenorMonths: 12, interestRate: '0.18', valueDate: d });
    expectStatus(app, 201, 'application');
    expectStatus(await call(ADMIN, 'post', `${L}/applications/${app.data.data.id}/submit`), 200, 'submit');
    expectStatus(await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/approve`), 200, 'approve');
    const booked = await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/book`);
    expectStatus(booked, 201, 'book');
    return { account: booked.data.data.account, sale, invoice };
  };
  const feeCollect = async (accountId, insurancePremium = '7000000') => {
    const r = await post(ADMIN, accountId, { kind: 'FEE_COLLECT', bankAccountId: bank.id, insurancePremium });
    expectStatus(r, 201, 'fee collect');
    return r.data.data;
  };
  const disburse = accountId => makerChecker(accountId, { kind: 'DISB' }, 'DISB');

  // ------------------------------------------------------------------ guard rails before anything posts
  let A;
  // ------------------------------------------------------------------ Phase 5 A5: exchange rates
  await test('exchange rates: copy POS rate (PENDING, normalized), maker-checker, self-authorize audited when allowed; effective rate up to 3 days old with a warning, older refused; base currency is 1', async () => {
    const cur = async code => (await q('SELECT id FROM currency WHERE code = ? LIMIT 1', [code]))[0].id;
    const usdId = await cur('USD');
    const thbId = await cur('THB');
    expectStatus(await call(CASHIER, 'post', `${L}/exchange-rates/copy-pos`, { currencyId: usdId, rateDate: '2030-01-10' }), 403, 'cashier');
    expectStatus(await call(ADMIN, 'post', `${L}/exchange-rates/copy-pos`, { currencyId: lakId, rateDate: '2030-01-10' }), 400, 'base currency');
    const copied = await call(ADMIN, 'post', `${L}/exchange-rates/copy-pos`, { currencyId: usdId, rateDate: '2030-01-10' });
    expectStatus(copied, 201, 'copy USD');
    const row = (await q("SELECT id, CAST(rate AS CHAR) rate, source, authStatus FROM ln_exchange_rate WHERE currencyId = ? AND rateDate = '2030-01-10'", [usdId]))[0];
    assert.deepStrictEqual([row.rate, row.source, row.authStatus], ['21200.00000000', 'POS_COPY', 'PENDING']);
    const selfAllowed = (await q("SELECT value v FROM SPF WHERE code = 'LOAN_ALLOW_SELF_AUTHORIZE'"))[0];
    await setSpf('LOAN_ALLOW_SELF_AUTHORIZE', 'false');
    expectStatus(await call(ADMIN, 'post', `${L}/params/exchange-rate/${row.id}/authorize`), 403, 'maker self-authorize refused');
    expectStatus(await call(CASHIER, 'get', `${L}/exchange-rates/effective?currencyId=${usdId}&date=2030-01-10`), 403, 'cashier view');
    expectStatus(await call(ADMIN, 'get', `${L}/exchange-rates/effective?currencyId=${usdId}&date=2030-01-10`), 409, 'pending rate is not used');
    expectStatus(await call(SUPER, 'post', `${L}/params/exchange-rate/${row.id}/authorize`), 200, 'checker authorizes');
    const eff = async date => call(ADMIN, 'get', `${L}/exchange-rates/effective?currencyId=${usdId}&date=${date}`);
    const same = await eff('2030-01-10');
    expectStatus(same, 200, 'same day');
    assert.deepStrictEqual([same.data.data.rate, same.data.data.rateDate, same.data.data.warning], ['21200.00000000', '2030-01-10', null]);
    const old2 = await eff('2030-01-12');
    assert.strictEqual(old2.data.data.warning, 'Rate of 2030-01-10 used for booking date 2030-01-12 (2 days old)');
    const old4 = await eff('2030-01-14');
    expectStatus(old4, 409, 'four days old');
    assert.match(old4.data.message, /2030-01-10, 4 days before the booking date 2030-01-14 \(LOAN_FX_MAX_RATE_AGE_DAYS = 3\)/);
    const lak = await call(ADMIN, 'get', `${L}/exchange-rates/effective?currencyId=${lakId}&date=2030-01-14`);
    assert.strictEqual(lak.data.data.rate, '1.00000000');
    // LOAN_ALLOW_SELF_AUTHORIZE applies to exchange rates: allowed and audited
    await setSpf('LOAN_ALLOW_SELF_AUTHORIZE', 'true');
    try {
      expectStatus(await call(ADMIN, 'post', `${L}/exchange-rates/copy-pos`, { currencyId: thbId, rateDate: '2030-01-10' }), 201, 'copy THB');
      const thb = (await q("SELECT id, CAST(rate AS CHAR) rate FROM ln_exchange_rate WHERE currencyId = ? AND rateDate = '2030-01-10'", [thbId]))[0];
      assert.strictEqual(thb.rate, '670.00000000');
      expectStatus(await call(ADMIN, 'post', `${L}/params/exchange-rate/${thb.id}/authorize`), 200, 'self-authorize allowed');
      assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_audit_log WHERE entityName = 'exchange-rate' AND actionType = 'SELF_AUTH' AND userId = ?", [ADMIN]), 1, 'self-authorization audited');
    } finally {
      await setSpf('LOAN_ALLOW_SELF_AUTHORIZE', selfAllowed ? selfAllowed.v : 'false');
    }
  });

  await test('guards: switch OFF, unconfirmed tax profile and a missing Idempotency-Key refuse; nothing is written', async () => {
    A = await makeLoan();
    const before = await counts(bank.id);
    expectStatus(await post(ADMIN, A.account.id, { kind: 'FEE_COLLECT', bankAccountId: bank.id }), 409, 'switch off');
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    await q("UPDATE ln_tax_profile SET confirmationStatus = 'UNCONFIRMED'");
    const gate = await post(ADMIN, A.account.id, { kind: 'FEE_COLLECT', bankAccountId: bank.id });
    expectStatus(gate, 409, 'tax gate');
    assert.match(gate.data.message, /blocked while the tax profile is UNCONFIRMED/);
    await q("UPDATE ln_tax_profile SET confirmationStatus = 'CONFIRMED'");
    expectStatus(await call(ADMIN, 'post', `${L}/accounts/${A.account.id}/transactions`, { kind: 'FEE_COLLECT', bankAccountId: bank.id }), 400, 'no idempotency key');
    expectStatus(await post(ADMIN, A.account.id, { kind: 'REPAYMENT', amount: '1000', bankAccountId: bank.id }), 409, 'repayment before disbursement');
    assert.deepStrictEqual(await counts(bank.id), before);
  });

  await test('crash/rollback: a failure at every step of a posting leaves nothing (transaction, journal, GL, bank entry, link, idempotency, bank balance)', async () => {
    const before = await counts(bank.id);
    for (const step of ['AFTER_TRANSACTION', 'AFTER_JOURNAL', 'AFTER_GL', 'AFTER_BANK', 'AFTER_AR', 'BEFORE_COMMIT']) {
      const r = await post(ADMIN, A.account.id, { kind: 'FEE_COLLECT', bankAccountId: bank.id, insurancePremium: '7000000' }, { failAt: step });
      expectStatus(r, 500, `fail at ${step}`);
      assert.strictEqual(r.data.message, `TEST_FAIL_AT ${step}`, 'the injected failure, not another error');
      assert.deepStrictEqual(await counts(bank.id), before, `nothing left after a failure at ${step}`);
    }
    const tampered = await post(ADMIN, A.account.id, { kind: 'FEE_COLLECT', bankAccountId: bank.id }, { failAt: 'TAMPER_JOURNAL' });
    expectStatus(tampered, 409, 'tampered journal');
    assert.match(tampered.data.message, /Journal failed validation; nothing was posted/);
    assert.deepStrictEqual(await counts(bank.id), before);
  });

  await test('FEE_COLLECT: fees + 10% VAT + insurance; GL pairs, LOAN_IN bank entry, links; legs tied to GL rows', async () => {
    const before = await counts(bank.id);
    const r = await feeCollect(A.account.id);
    assert.deepStrictEqual(tagsOf(r, 'FEE_COLLECT'), { TOTAL_PAID: '9970000', FEE_DOC: '2700000', INS_PREM: '7000000', VAT_OUT: '270000' });
    const gl = await q("SELECT a.accountNumber dr, b.accountNumber cr, CAST(g.debit AS CHAR) amt FROM general_ledger g JOIN chart_of_account a ON a.id = g.drAccountId JOIN chart_of_account b ON b.id = g.crAccountId WHERE g.postingReference = ? ORDER BY amt + 0 DESC", [r.txNo]);
    assert.deepStrictEqual(gl.map(x => `${x.dr}>${x.cr}:${x.amt}`), ['1105>2121:7000000.00', '1105>4203:2700000.00', '1105>2131:270000.00']);
    const te = await q('SELECT transactionType t, credit, externalRefno x, description d FROM transactionEntry WHERE externalRefno = ?', [r.txNo]);
    assert.deepStrictEqual([te[0].t, Number(te[0].credit), te[0].x], ['LOAN_IN', 9970000, r.txNo]);
    assert.match(te[0].d, new RegExp(`Loan ${r.txNo}`));
    assert.strictEqual(await bankBalance(bank.id), Number(before.bank) + 9970000);
    assert.strictEqual(await num('SELECT COUNT(*) n FROM ln_journal_posting WHERE transactionId = ? AND glRecordId IS NULL', [r.transactionId]), 0);
    assert.strictEqual(await num('SELECT COUNT(*) n FROM ln_pos_link WHERE transactionId = ?', [r.transactionId]), 4);
    expectStatus(await post(ADMIN, A.account.id, { kind: 'FEE_COLLECT', bankAccountId: bank.id }), 409, 'collect twice');
  });

  let disbTx;
  await test('DISB (maker-checker): Dr portfolio / Cr sale receivable; the invoice is settled by a posted AR receipt the POS cash batch will not pick up', async () => {
    disbTx = await disburse(A.account.id);
    assert.deepStrictEqual(tagsOf(disbTx, 'DISB'), { PRINCIPAL: '240000000' });
    const gl = await q("SELECT a.accountNumber dr, b.accountNumber cr, CAST(g.debit AS CHAR) amt FROM general_ledger g JOIN chart_of_account a ON a.id = g.drAccountId JOIN chart_of_account b ON b.id = g.crAccountId WHERE g.postingReference = ?", [disbTx.txNo]);
    assert.deepStrictEqual(gl.map(x => `${x.dr}>${x.cr}:${x.amt}`), ['1211>1201:240000000.00']);
    const inv = await q('SELECT status FROM ARInvoiceHeader WHERE id = ?', [A.invoice.id]);
    assert.strictEqual(inv[0].status, 'paid');
    const rec = await q('SELECT status, glPostingStatus g, glBatchId b, CAST(totalReceivedAmount AS CHAR) amt FROM ARReceiveHeader WHERE referenceNumber = ?', [disbTx.txNo]);
    assert.deepStrictEqual([rec[0].status, rec[0].g, rec[0].b, rec[0].amt], ['active', 'posted', disbTx.txNo, '240000000.00']);
    const cash = require('../../src/GL/cashPostingService');
    const unposted = await cash.previewUnposted('2000-01-01', '2100-12-31', 'AR_RECEIPT');
    assert.ok(!JSON.stringify(unposted).includes(disbTx.txNo), 'loan AR receipt is not in the POS cash batch');
    assert.strictEqual((await q('SELECT accountStage s FROM ln_account WHERE id = ?', [A.account.id]))[0].s, 'DISBURSED');
  });

  let due1;
  let due2;
  await test('EOD: refused with guidance when the POS business date is behind; at the first due date posts ACCR in a summarized batch and rolls the date', async () => {
    due1 = (await q("SELECT DATE_FORMAT(dueDate, '%Y-%m-%d') d FROM ln_schedule WHERE loanAccountId = ? AND installmentNo = 1", [A.account.id]))[0].d;
    due2 = (await q("SELECT DATE_FORMAT(dueDate, '%Y-%m-%d') d FROM ln_schedule WHERE loanAccountId = ? AND installmentNo = 2", [A.account.id]))[0].d;
    await setBusinessDate(due1);
    const posRow = await db.businessDate.create({ currentDate: '2001-01-01', status: 'OPEN' });
    const refused = await call(SUPER, 'post', `${L}/eod/run`);
    expectStatus(refused, 409, 'POS date behind');
    assert.match(refused.data.message, /USE_BUSINESS_DATE = Y \(manual POS close of business\) and the POS business date is 2001-01-01, not later than the loan business date\. Run the POS close of business/);
    await posRow.destroy();
    const run = await call(SUPER, 'post', `${L}/eod/run`);
    expectStatus(run, 200, 'eod');
    assert.strictEqual(run.data.data.nextBusinessDate, D.addDays(due1, 1));
    const batch = run.data.data.batches.find(b => /EOD_ACCRUAL/.test(b.batchNumber));
    assert.ok(batch && batch.total === '3600000.0000', 'accrual batch total');
    const gl = await q("SELECT a.accountNumber dr, b.accountNumber cr, CAST(g.debit AS CHAR) amt FROM general_ledger g JOIN chart_of_account a ON a.id = g.drAccountId JOIN chart_of_account b ON b.id = g.crAccountId WHERE g.postingReference = ?", [batch.batchNumber]);
    assert.deepStrictEqual(gl.map(x => `${x.dr}>${x.cr}:${x.amt}`), ['1221>4201:3600000.00']);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_journal_posting WHERE glBatchId = ? AND glRecordId IS NULL", [batch.batchNumber]), 0);
  });

  await test('REPAYMENT on time (inside grace): LIQD; double submit with one key posts once; concurrent payments with different keys serialize', async () => {
    const before = await counts(bank.id);
    const key = `dbl-${uuidv4()}`;
    const body = { kind: 'REPAYMENT', amount: '22003198', bankAccountId: bank.id };
    const [r1, r2] = await Promise.all([post(ADMIN, A.account.id, body, { key }), post(ADMIN, A.account.id, body, { key })]);
    expectStatus(r1, 201, 'first');
    expectStatus(r2, 201, 'second (replay)');
    assert.strictEqual(r1.data.data.transactionId, r2.data.data.transactionId);
    assert.deepStrictEqual(tagsOf(r1.data.data, 'LIQD'), { TOTAL_PAID: '22003198', INT_PAID: '3600000', PRIN_PAID: '18403198' });
    const after = await counts(bank.id);
    assert.strictEqual(after.tx, before.tx + 1, 'one transaction');
    assert.strictEqual(Number(after.bank), Number(before.bank) + 22003198);
    const sameKeyOther = await post(ADMIN, A.account.id, { ...body, amount: '1' }, { key });
    expectStatus(sameKeyOther, 409, 'same key, different request');
    const [p1, p2] = await Promise.all([
      post(ADMIN, A.account.id, { kind: 'REPAYMENT', amount: '1000000', bankAccountId: bank.id }),
      post(ADMIN, A.account.id, { kind: 'REPAYMENT', amount: '1000000', bankAccountId: bank.id })
    ]);
    expectStatus(p1, 201, 'concurrent 1');
    expectStatus(p2, 201, 'concurrent 2');
    assert.notStrictEqual(p1.data.data.transactionId, p2.data.data.transactionId);
    const acct = await q('SELECT CAST(advanceBalance AS CHAR) a, onTimeStreak s FROM ln_account WHERE id = ?', [A.account.id]);
    assert.deepStrictEqual([acct[0].a, Number(acct[0].s)], ['2000000.0000', 1], 'both overpayments in the advance; on-time streak 1');
  });

  await test('ADV_REFUND and INS_REMIT need a second person; both pay out through LOAN_OUT', async () => {
    const before = await bankBalance(bank.id);
    const refund = await makerChecker(A.account.id, { kind: 'ADV_REFUND', amount: '2000000', bankAccountId: bank.id }, 'ADV_REFUND');
    assert.deepStrictEqual(tagsOf(refund, 'ADV_REFUND'), { REFUND_AMT: '2000000' });
    const remit = await makerChecker(A.account.id, { kind: 'INS_REMIT', amount: '7000000', bankAccountId: bank.id }, 'INS_REMIT');
    assert.deepStrictEqual(tagsOf(remit, 'INS_REMIT'), { REMIT_AMT: '7000000' });
    assert.strictEqual(await bankBalance(bank.id), before - 9000000);
    expectStatus(await post(ADMIN, A.account.id, { kind: 'INS_REMIT', amount: '1', bankAccountId: bank.id }), 400, 'nothing left to remit');
    const out = await q("SELECT COUNT(*) n FROM transactionEntry WHERE externalRefno IN (?, ?) AND transactionType = 'LOAN_OUT'", [refund.txNo, remit.txNo]);
    assert.strictEqual(Number(out[0].n), 2);
  });

  await test('isolated: ADV_REFUND larger than the advance is refused (2,000,000 against 1,000,000) and writes nothing; the exact advance can be refunded; DISB amendment records its checker', async () => {
    // Self-contained (also runs alone with LOAN_POSTING_ONLY): posting on, tax profile confirmed
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    await q("UPDATE ln_tax_profile SET confirmationStatus = 'CONFIRMED'");
    const start = await businessDate();
    const F = await makeLoan();
    await feeCollect(F.account.id, '0');
    // Disburse one day after booking: the schedule is regenerated and the amendment is approved by the DISB checker
    await setBusinessDate(D.addDays(start, 1));
    try {
      const disb = await disburse(F.account.id);
      const amend = await q("SELECT approvedBy, source, transactionId, makerId FROM ln_amendment_history WHERE loanAccountId = ? AND amendmentType = 'DISB_DATE'", [F.account.id]);
      assert.deepStrictEqual(amend.map(a => [Number(a.approvedBy), a.source, Number(a.transactionId), Number(a.makerId)]), [[Number(SUPER), 'TRANSACTION', disb.transactionId, Number(ADMIN)]], 'DISB amendment: checker SUPER approved, maker ADMIN');

      const pay = await post(ADMIN, F.account.id, { kind: 'REPAYMENT', amount: '1000000', bankAccountId: bank.id });
      expectStatus(pay, 201, 'overpayment');
      const advance = async () => (await q('SELECT CAST(advanceBalance AS CHAR) a FROM ln_account WHERE id = ?', [F.account.id]))[0].a;
      assert.strictEqual(await advance(), '1000000.0000', 'precondition: the advance is exactly 1,000,000');

      const before = { ...(await counts(bank.id)), pending: await num("SELECT COUNT(*) n FROM ln_transaction WHERE loanAccountId = ? AND postingStatus = 'PENDING_AUTH'", [F.account.id]) };
      const over = await post(ADMIN, F.account.id, { kind: 'ADV_REFUND', amount: '2000000', bankAccountId: bank.id });
      console.log(`        over-refund response: HTTP ${over.status} "${over.data.message}"`);
      expectStatus(over, 400, 'over-refund');
      assert.match(over.data.message, /^Refund 2000000 exceeds the customer advance of 1000000/);
      const after = { ...(await counts(bank.id)), pending: await num("SELECT COUNT(*) n FROM ln_transaction WHERE loanAccountId = ? AND postingStatus = 'PENDING_AUTH'", [F.account.id]) };
      assert.deepStrictEqual(after, before, 'nothing written: no pending transaction, journal, GL, bank entry, link or idempotency row; bank balance unchanged');
      assert.strictEqual(await advance(), '1000000.0000', 'advance unchanged');
      expectStatus(await post(ADMIN, F.account.id, { kind: 'ADV_REFUND', amount: '1000001', bankAccountId: bank.id }), 400, 'one kip over');

      const exact = await makerChecker(F.account.id, { kind: 'ADV_REFUND', amount: '1000000', bankAccountId: bank.id }, 'exact refund');
      assert.deepStrictEqual(tagsOf(exact, 'ADV_REFUND'), { REFUND_AMT: '1000000' });
      assert.strictEqual(await advance(), '0.0000');
    } finally {
      await setBusinessDate(start);
    }
  });

  let prepayTx;
  await test('partial principal prepayment regenerates the remaining schedule (REDUCE_INSTALLMENT); LIFO reversal refuses older transactions and undoes the latest exactly', async () => {
    const rowsBefore = await q('SELECT s.installmentNo n, CAST(c.amountDue AS CHAR) a FROM ln_schedule s JOIN ln_schedule_component c ON c.scheduleId = s.id WHERE s.loanAccountId = ? ORDER BY s.installmentNo, c.componentId', [A.account.id]);
    const r = await post(ADMIN, A.account.id, { kind: 'REPAYMENT', amount: '50000000', bankAccountId: bank.id, prepayPrincipal: true });
    expectStatus(r, 201, 'partial prepayment');
    prepayTx = r.data.data;
    assert.deepStrictEqual(tagsOf(prepayTx, 'LIQD'), { TOTAL_PAID: '50000000', PRIN_PAID: '50000000' });
    const future = await q("SELECT COUNT(*) n FROM ln_schedule WHERE loanAccountId = ? AND status <> 'PAID'", [A.account.id]);
    assert.strictEqual(Number(future[0].n), 11, 'REDUCE_INSTALLMENT keeps the remaining count');
    const p2 = await q('SELECT CAST(c.amountDue AS CHAR) a FROM ln_schedule s JOIN ln_schedule_component c ON c.scheduleId = s.id WHERE s.loanAccountId = ? AND s.installmentNo = 2 AND c.componentId = (SELECT id FROM ln_component WHERE componentCode = "PRINCIPAL")', [A.account.id]);
    assert.ok(Number(p2[0].a) < 18679246, 'smaller principal installments after the prepayment');
    const amend = await q("SELECT approvedBy, source, transactionId, makerId FROM ln_amendment_history WHERE loanAccountId = ? AND amendmentType = 'PARTIAL_PREPAYMENT'", [A.account.id]);
    assert.strictEqual(amend.length, 1);
    // A cashier REPAYMENT has no checker: nobody approved the amendment, so approvedBy stays NULL
    assert.deepStrictEqual([amend[0].approvedBy, amend[0].source, Number(amend[0].transactionId), Number(amend[0].makerId)], [null, 'TRANSACTION', prepayTx.transactionId, Number(ADMIN)]);

    const older = await post(ADMIN, A.account.id, { kind: 'REVERSAL', targetTransactionId: disbTx.transactionId });
    expectStatus(older, 409, 'non-LIFO reversal');
    assert.match(older.data.message, /LIFO/);
    const bankBefore = await bankBalance(bank.id);
    const rev = await makerChecker(A.account.id, { kind: 'REVERSAL', targetTransactionId: prepayTx.transactionId }, 'REVERSAL');
    assert.strictEqual(rev.reverses, prepayTx.txNo);
    const rowsAfter = await q('SELECT s.installmentNo n, CAST(c.amountDue AS CHAR) a FROM ln_schedule s JOIN ln_schedule_component c ON c.scheduleId = s.id WHERE s.loanAccountId = ? ORDER BY s.installmentNo, c.componentId', [A.account.id]);
    assert.deepStrictEqual(rowsAfter.filter(x => x.n !== 13), rowsBefore.filter(x => x.n !== 13), 'schedule restored exactly');
    assert.strictEqual(await bankBalance(bank.id), bankBefore - 50000000);
    const net = await q("SELECT a.accountNumber acct, SUM(CASE WHEN g.drAccountId = a.id THEN g.debit ELSE -g.credit END) n FROM general_ledger g JOIN chart_of_account a ON a.id IN (g.drAccountId, g.crAccountId) WHERE g.postingReference IN (?, ?) GROUP BY a.accountNumber", [prepayTx.txNo, rev.txNo]);
    assert.ok(net.every(x => Number(x.n) === 0), 'GL nets to zero per account');
    assert.strictEqual(Number((await q('SELECT isReversed r FROM ln_transaction WHERE id = ?', [prepayTx.transactionId]))[0].r), 1);

    // Step 4 click-through: the newest row is now the REVERSAL itself. LIFO must still look past it, so the
    // older DISB (with later repayments standing) stays refused, for both the preview and the submit.
    const pendingBefore = await num("SELECT COUNT(*) n FROM ln_transaction WHERE loanAccountId = ? AND postingStatus = 'PENDING_AUTH'", [A.account.id]);
    const lifoPreview = await call(ADMIN, 'post', `${L}/accounts/${A.account.id}/preview/REVERSAL`, { targetTransactionId: disbTx.transactionId });
    expectStatus(lifoPreview, 409, 'preview: non-LIFO reversal behind a reversal');
    assert.match(lifoPreview.data.message, /LIFO/);
    const lifoSubmit = await post(ADMIN, A.account.id, { kind: 'REVERSAL', targetTransactionId: disbTx.transactionId });
    expectStatus(lifoSubmit, 409, 'submit: non-LIFO reversal behind a reversal');
    assert.match(lifoSubmit.data.message, /LIFO/);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_transaction WHERE loanAccountId = ? AND postingStatus = 'PENDING_AUTH'", [A.account.id]), pendingBefore, 'no pending reversal created');
  });

  await test('EOD crash at an account resumes without duplicates; late REPAYMENT carries the memo penalty as PEN_CASH', async () => {
    await setBusinessDate(due2);
    const crash = await call(SUPER, 'post', `${L}/eod/run`, {}, { 'X-Loan-Test-Fail-At': `EOD_ACCOUNT_${A.account.id}` });
    expectStatus(crash, 500, 'eod crash');
    assert.strictEqual(crash.data.message, `TEST_FAIL_AT EOD_ACCOUNT_${A.account.id}`);
    assert.strictEqual(await businessDate(), due2, 'date not rolled after a crash');
    expectStatus(await call(SUPER, 'post', `${L}/eod/run`), 200, 'eod resume');
    const legs = await num("SELECT COUNT(*) n FROM ln_journal_posting WHERE loanAccountId = ? AND eventCode = 'ACCR' AND glBatchId LIKE ?", [A.account.id, `EOD-${due2.replace(/-/g, '')}%`]);
    assert.strictEqual(legs, 2, 'one ACCR (two legs) for installment 2');
    const late = D.addDays(due2, 20);
    await setBusinessDate(late);
    const row2 = await q('SELECT CAST(SUM(c.amountDue - c.amountPaid - c.amountWaived) AS CHAR) t FROM ln_schedule s JOIN ln_schedule_component c ON c.scheduleId = s.id WHERE s.loanAccountId = ? AND s.installmentNo = 2', [A.account.id]);
    const open = String(Number(row2[0].t));
    const penalty = E.interest.memoPenalty({ overdueAmount: open, daysLate: 20, penaltyRate: '0.18', capPct: '0.20', graceDays: 3, daysInYear: 360, rounder: E.rounding.makeRounder({ decimalPlaces: 0 }) });
    const r = await post(ADMIN, A.account.id, { kind: 'REPAYMENT', amount: String(Number(open) + Number(penalty)), bankAccountId: bank.id });
    expectStatus(r, 201, 'late repayment');
    const tags = tagsOf(r.data.data, 'LIQD');
    assert.strictEqual(tags.PEN_CASH, penalty);
    assert.strictEqual(Number(tags.TOTAL_PAID), Number(open) + Number(penalty));
  });

  await test('PREPAY settles everything; the account is CLOSED', async () => {
    const r = await post(ADMIN, A.account.id, { kind: 'PREPAY', bankAccountId: bank.id });
    expectStatus(r, 201, 'prepay');
    assert.ok(tagsOf(r.data.data, 'PREPAY').OUT_PRIN);
    const acct = await q('SELECT status, accountStage s FROM ln_account WHERE id = ?', [A.account.id]);
    assert.deepStrictEqual([acct[0].status, acct[0].s], ['CLOSED', 'CLOSED']);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_schedule WHERE loanAccountId = ? AND status <> 'PAID'", [A.account.id]), 0);
  });

  let B;
  await test('NPL path: EOD at month-end classifies SUBSTANDARD (STCH, interest suspended) and provisions 20%; INT_WAIVE of suspended interest; WRITE_OFF; RECOVERY', async () => {
    B = await makeLoan();
    await feeCollect(B.account.id, '0');
    await disburse(B.account.id);
    const bDue1 = (await q("SELECT DATE_FORMAT(dueDate, '%Y-%m-%d') d FROM ln_schedule WHERE loanAccountId = ? AND installmentNo = 1", [B.account.id]))[0].d;
    const target = D.addDays(bDue1, 61);
    const p = D.parts(target);
    const monthEnd = D.format(p.y, p.m, D.daysInMonth(p.y, p.m));
    await setBusinessDate(monthEnd);
    const run = await call(SUPER, 'post', `${L}/eod/run`);
    expectStatus(run, 200, 'eod');
    const acct = await q('SELECT status, currentDpd d FROM ln_account WHERE id = ?', [B.account.id]);
    assert.strictEqual(acct[0].status, 'SUBSTANDARD');
    assert.ok(Number(acct[0].d) >= 61 && Number(acct[0].d) <= 90);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_schedule_component c JOIN ln_schedule s ON s.id = c.scheduleId WHERE s.loanAccountId = ? AND c.bucket = 'BOOKED'", [B.account.id]), 0, 'booked interest moved to SUSPENDED');
    const prov = await q('SELECT CAST(bookedProvision AS CHAR) b FROM ln_provision_ledger WHERE loanAccountId = ? ORDER BY id DESC LIMIT 1', [B.account.id]);
    assert.strictEqual(prov[0].b, '48000000.0000', '20% of 240,000,000 (no collateral)');
    const stch = await q("SELECT roleCode r, drCr, statusQualifier qf, amountTag t FROM ln_journal_posting WHERE loanAccountId = ? AND eventCode = 'STCH' ORDER BY id", [B.account.id]);
    assert.deepStrictEqual(stch.map(x => `${x.t} ${x.drCr} ${x.r}${x.qf ? `[${x.qf}]` : ''}`).slice(0, 2), ['OUT_PRIN DR LOAN_PORTFOLIO[SUBSTANDARD]', 'OUT_PRIN CR LOAN_PORTFOLIO[NORMAL]']);
    const waive = await makerChecker(B.account.id, { kind: 'WAIVE', component: 'INTEREST', amount: '1000000' }, 'INT_WAIVE');
    assert.deepStrictEqual(tagsOf(waive, 'INT_WAIVE'), { INT_WAIVE_SUSP: '1000000' });
    const wo = await makerChecker(B.account.id, { kind: 'WRITE_OFF' }, 'WRITE_OFF');
    const t = tagsOf(wo, 'WRITE_OFF');
    assert.deepStrictEqual([t.PRIN_WO, t.SHORTFALL], ['48000000', '192000000']);
    assert.ok(Number(t.SUSP_CLR) > 0 && Number(t.MEMO_WO) === 240000000 + Number(t.SUSP_CLR));
    assert.strictEqual((await q('SELECT status FROM ln_account WHERE id = ?', [B.account.id]))[0].status, 'WRITTEN_OFF');
    const rec = await post(ADMIN, B.account.id, { kind: 'RECOVERY', amount: '10000000', bankAccountId: bank.id });
    expectStatus(rec, 201, 'recovery');
    assert.deepStrictEqual(tagsOf(rec.data.data, 'RECOVERY'), { REC_AMT: '10000000' });
    const memo = await q('SELECT CAST(writtenOffMemo AS CHAR) m FROM ln_account WHERE id = ?', [B.account.id]);
    assert.strictEqual(Number(memo[0].m), Number(t.MEMO_WO) - 10000000);
  });

  await test('period lock and backdating: value-dated adjustment booked on the business date; too far back or future refused; unmapped bank account refused', async () => {
    const C = await makeLoan();
    await feeCollect(C.account.id, '0');
    await disburse(C.account.id);
    const d = await businessDate();
    await setBusinessDate(D.addDays(d, 3));
    await setSpf('LOAN_MAX_BACKDATE_DAYS', '5');
    await q('UPDATE ln_system_date SET periodLockDate = ?', [D.addDays(d, 3)]);
    const adj = await post(ADMIN, C.account.id, { kind: 'REPAYMENT', amount: '1000000', bankAccountId: bank.id, valueDate: D.addDays(d, 1) });
    expectStatus(adj, 201, 'value-dated');
    assert.deepStrictEqual([adj.data.data.valueDatedAdjustment, adj.data.data.bookingDate], [true, D.addDays(d, 3)]);
    const desc = await q('SELECT description FROM general_ledger WHERE postingReference = ? LIMIT 1', [adj.data.data.txNo]);
    assert.match(desc[0].description, new RegExp(`value-dated adjustment for ${D.addDays(d, 1)}`));
    expectStatus(await post(ADMIN, C.account.id, { kind: 'REPAYMENT', amount: '1', bankAccountId: bank.id, valueDate: D.addDays(d, -10) }), 400, 'too far back');
    expectStatus(await post(ADMIN, C.account.id, { kind: 'REPAYMENT', amount: '1', bankAccountId: bank.id, valueDate: D.addDays(d, 10) }), 400, 'future');
    await setSpf('LOAN_MAX_BACKDATE_DAYS', '0');
    await q("UPDATE ln_system_date SET periodLockDate = '2026-10-01'");
    const before = await counts(bank.id);
    const unmapped = await post(ADMIN, C.account.id, { kind: 'REPAYMENT', amount: '1000', bankAccountId: 124 });
    expectStatus(unmapped, 409, 'unmapped bank account');
    assert.match(unmapped.data.message, /has no active chart_of_account with the same number/);
    assert.deepStrictEqual(await counts(bank.id), before);

    const rep = await makerChecker(C.account.id, { kind: 'REPOSSESS', appraisedValue: '200000000' }, 'REPOSSESS');
    const rt = tagsOf(rep, 'REPOSSESS');
    assert.deepStrictEqual([rt.APPRAISED, rt.SHORTFALL, rt.OUT_PRIN], ['200000000', '40000000', '240000000']);
    const disp = await makerChecker(C.account.id, { kind: 'VEH_DISPOSE', salePrice: '190000000', bankAccountId: bank.id }, 'VEH_DISPOSE');
    assert.deepStrictEqual(tagsOf(disp, 'VEH_DISPOSE'), { SALE_PRICE: '190000000', CARRYING: '200000000', VAT_OUT: '17272727', LOSS: '27272727' }, 'resale tax-inclusive 10%');
  });

  await test('FEE_REFUND cancels a booked account (stage CANCELLED, bank nets to zero); REVERSAL of a DISB voids the AR receipt and reopens the invoice', async () => {
    const Dl = await makeLoan();
    const bankBefore = await bankBalance(bank.id);
    await feeCollect(Dl.account.id);
    const refund = await makerChecker(Dl.account.id, { kind: 'FEE_REFUND', bankAccountId: bank.id }, 'FEE_REFUND');
    assert.deepStrictEqual(tagsOf(refund, 'FEE_REFUND'), { FEE_DOC: '2700000', INS_PREM: '7000000', VAT_OUT: '270000', REFUND_AMT: '9970000' });
    assert.strictEqual(await bankBalance(bank.id), bankBefore);
    assert.strictEqual((await q('SELECT accountStage s FROM ln_account WHERE id = ?', [Dl.account.id]))[0].s, 'CANCELLED');

    const El = await makeLoan();
    await feeCollect(El.account.id, '0');
    const disb = await disburse(El.account.id);
    assert.strictEqual((await q('SELECT status FROM ARInvoiceHeader WHERE id = ?', [El.invoice.id]))[0].status, 'paid');
    const rev = await makerChecker(El.account.id, { kind: 'REVERSAL', targetTransactionId: disb.transactionId }, 'REVERSAL of DISB');
    assert.strictEqual(rev.reverses, disb.txNo);
    const rec = await q('SELECT status FROM ARReceiveHeader WHERE referenceNumber = ?', [disb.txNo]);
    assert.strictEqual(rec[0].status, 'voided');
    assert.notStrictEqual((await q('SELECT status FROM ARInvoiceHeader WHERE id = ?', [El.invoice.id]))[0].status, 'paid');
    assert.strictEqual((await q('SELECT accountStage s FROM ln_account WHERE id = ?', [El.account.id]))[0].s, 'BOOKED');
  });

  // Rule: the target must be the newest POSTED ONLINE transaction that is not already reversed, ignoring REVERSAL rows.
  await test('reversal order (LIFO): T1,T2,T3 -> only T3; after T3 reversed only T2; a reversal row is never a target; after T3 and T2 reversed T1 is allowed and the account is exactly as it was after T1', async () => {
    const R = await makeLoan();
    await feeCollect(R.account.id, '0');
    await disburse(R.account.id);
    const id = R.account.id;
    const pendingCount = () => num("SELECT COUNT(*) n FROM ln_transaction WHERE loanAccountId = ? AND postingStatus = 'PENDING_AUTH'", [id]);
    // Every stored amount of the account, as exact decimal strings
    const snapshot = async () => ({
      account: await q('SELECT CAST(disbursedAmount AS CHAR) disbursed, CAST(advanceBalance AS CHAR) advance, CAST(writtenOffMemo AS CHAR) wo, CAST(repossessedCarrying AS CHAR) repo, onTimeStreak streak, accountStage stage FROM ln_account WHERE id = ?', [id]),
      balances: await q('SELECT componentId c, CAST(outstandingAmount AS CHAR) o, CAST(totalAccrued AS CHAR) ac, CAST(totalBilled AS CHAR) b, CAST(totalPaid AS CHAR) p, CAST(totalWaived AS CHAR) w FROM ln_account_balance WHERE loanAccountId = ? ORDER BY componentId', [id]),
      schedule: await q('SELECT s.installmentNo n, s.status st, c.componentId c, CAST(c.amountDue AS CHAR) due, CAST(c.amountPaid AS CHAR) paid, CAST(c.amountWaived AS CHAR) waived, c.status cst FROM ln_schedule s JOIN ln_schedule_component c ON c.scheduleId = s.id WHERE s.loanAccountId = ? ORDER BY s.installmentNo, c.componentId', [id]),
      bank: (await q('SELECT CAST(balance AS CHAR) b FROM bankAccount WHERE id = ?', [bank.id]))[0].b
    });
    const refused = async (target, label) => {
      const before = await pendingCount();
      const pv = await call(ADMIN, 'post', `${L}/accounts/${id}/preview/REVERSAL`, { targetTransactionId: target.transactionId });
      expectStatus(pv, 409, `preview: ${label}`);
      const sb = await post(ADMIN, id, { kind: 'REVERSAL', targetTransactionId: target.transactionId });
      expectStatus(sb, 409, `submit: ${label}`);
      assert.strictEqual(await pendingCount(), before, `${label}: no pending reversal created`);
      return sb.data.message;
    };
    const allowed = async (target, label) => {
      expectStatus(await call(ADMIN, 'post', `${L}/accounts/${id}/preview/REVERSAL`, { targetTransactionId: target.transactionId }), 200, `preview: ${label}`);
      const rev = await makerChecker(id, { kind: 'REVERSAL', targetTransactionId: target.transactionId }, label);
      assert.strictEqual(rev.reverses, target.txNo);
      return rev;
    };
    const pay = async (amount) => {
      const r = await post(ADMIN, id, { kind: 'REPAYMENT', amount, bankAccountId: bank.id });
      expectStatus(r, 201, `REPAYMENT ${amount}`);
      return r.data.data;
    };

    const T1 = await pay('1000000');
    const afterT1 = await snapshot();
    const T2 = await pay('2000000');
    const T3 = await pay('3000000');

    // (a) T1, T2, T3 posted: T1 and T2 refused (naming T3), T3 allowed
    assert.match(await refused(T1, 'T1 behind T2,T3'), new RegExp(`LIFO.*${T3.txNo}`));
    assert.match(await refused(T2, 'T2 behind T3'), new RegExp(`LIFO.*${T3.txNo}`));
    const R3 = await allowed(T3, 'REVERSAL of T3');

    // (b) T3 reversed: T2 is now the newest standing transaction; T1 still refused (naming T2, not the reversal row)
    assert.match(await refused(T1, 'T1 behind T2 (newest row is a reversal)'), new RegExp(`LIFO.*${T2.txNo}`));

    // (c) a reversal row is never a target, and T3 cannot be reversed twice
    assert.match(await refused(R3, 'reversal of a reversal'), /cannot be reversed.*REVERSAL/);
    assert.match(await refused(T3, 'T3 again'), /already reversed/);

    const R2 = await allowed(T2, 'REVERSAL of T2');

    // (d) T3 and T2 reversed: the account is exactly as after T1 (every amount, to the last decimal), the GL of
    // T2, T3 and their reversals nets to zero per chart account, and T1 is now allowed
    assert.deepStrictEqual(await snapshot(), afterT1, 'state after reversing T3 and T2 equals the state after T1');
    const net = await q("SELECT a.accountNumber acct, CAST(SUM(CASE WHEN g.drAccountId = a.id THEN g.debit ELSE -g.credit END) AS CHAR) n FROM general_ledger g JOIN chart_of_account a ON a.id IN (g.drAccountId, g.crAccountId) WHERE g.postingReference IN (?, ?, ?, ?) GROUP BY a.accountNumber", [T2.txNo, T3.txNo, R2.txNo, R3.txNo]);
    assert.ok(net.length > 0 && net.every(x => Number(x.n) === 0), `GL nets to zero per account: ${JSON.stringify(net)}`);
    await allowed(T1, 'REVERSAL of T1');
    assert.deepStrictEqual((await q('SELECT txNo, isReversed r FROM ln_transaction WHERE id IN (?, ?, ?) ORDER BY id', [T1.transactionId, T2.transactionId, T3.transactionId])).map(t => Number(t.r)), [1, 1, 1]);
  });

  await test('books stay consistent: trial balance balanced, every posted leg points to an existing GL row, every loan cash entry links to a loan transaction', async () => {
    const tb = await call(SUPER, 'get', '/api/gl/reports/trial-balance?asOfDate=2100-12-31');
    expectStatus(tb, 200, 'trial balance');
    assert.strictEqual(tb.data.totalDebits, tb.data.totalCredits);
    assert.strictEqual(await num('SELECT COUNT(*) n FROM ln_journal_posting j LEFT JOIN general_ledger g ON g.id = j.glRecordId WHERE j.glRecordId IS NOT NULL AND g.id IS NULL'), 0);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM transactionEntry t LEFT JOIN ln_pos_link l ON l.posTable = 'transactionEntry' AND l.posId = t.id WHERE t.transactionType IN ('LOAN_IN','LOAN_OUT') AND t.externalRefno NOT LIKE 'COBTEST%' AND l.id IS NULL"), 0);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_journal_posting j JOIN ln_transaction t ON t.id = j.transactionId WHERE t.source = 'ONLINE' AND j.glRecordId IS NULL AND j.eventCode <> 'REVERSAL' AND j.roleCode <> 'LOAN_PORTFOLIO'"), 0);
  });

  await test('balance sheet: switch OFF returns exactly what the original POS code returns; switch ON adds loan lines, the Loan result line and the reconciliation, and the plug excludes the loan result', async () => {
    // Every earlier loan is closed, written off or reversed by now: disburse one more so the book has a live loan
    const Live = await makeLoan();
    await feeCollect(Live.account.id, '0');
    await disburse(Live.account.id);
    const Orig = loadMainBsController();
    const Current = require('../../src/GL/adbReportController');
    await setSpf('BS_INCLUDE_LOAN_BOOK', 'false');
    assert.deepStrictEqual(await callBs(Current), await callBs(Orig), 'switch off: identical to the original');
    await setSpf('BS_INCLUDE_LOAN_BOOK', 'true');
    const on = await callBs(Current);
    const off = await callBs(Orig);
    assert.ok(on.loanReconciliation && on.loanReconciliation.cashAndBank && on.loanReconciliation.accountsReceivable);
    const loanResult = on.equity.items.find(i => /Loan result/.test(i.accountName));
    assert.ok(loanResult, 'loan result line');
    assert.ok(on.assets.items.some(i => /\(loan\)/.test(i.accountName)), 'loan asset lines');
    const portfolio = on.assets.items.filter(i => /\(loan\)/.test(i.accountName) && String(i.accountNumber) === '1211');
    assert.strictEqual(portfolio.length, 1, 'portfolio line');
    assert.strictEqual(portfolio[0].balance, Number(await num("SELECT (SELECT COALESCE(SUM(localDebit),0) FROM general_ledger WHERE drAccountId = a.id AND status = 'POSTED') - (SELECT COALESCE(SUM(localCredit),0) FROM general_ledger WHERE crAccountId = a.id AND status = 'POSTED') n FROM chart_of_account a WHERE accountNumber = '1211'")), 'portfolio line equals the GL balance');
    const plug = on.equity.items[2].balance;
    const netProfit = on.equity.items[0].balance;
    assert.ok(Math.abs(plug - (on.assets.total - on.liabilities.total - netProfit - loanResult.balance)) < 0.01, 'plug excludes the loan result');
    assert.strictEqual(netProfit, off.equity.items[0].balance, 'POS net profit unchanged');
    await setSpf('BS_INCLUDE_LOAN_BOOK', 'false');
  });

  await test('POS AR receipt API: loan settlement receipts are left out of both list endpoints unless includeLoanSettlement=1 (then labelled); edit, delete, void, cancel and reactivate are refused', async () => {
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    await q("UPDATE ln_tax_profile SET confirmationStatus = 'CONFIRMED'");
    const G = await makeLoan();
    await feeCollect(G.account.id, '0');
    const disb = await disburse(G.account.id);
    const loanRec = (await q('SELECT id, status FROM ARReceiveHeader WHERE referenceNumber = ?', [disb.txNo]))[0];
    const dpRec = (await q("SELECT id FROM ARReceiveHeader WHERE invoiceHeaderId = ? AND receiptNumber LIKE 'DP-%'", [G.invoice.id]))[0];
    const ids = res => res.data.data.receiveHeaders.map(r => Number(r.id)).sort((a, b) => a - b);
    const AR = '/api/ar-receive-headers';
    for (const ep of [AR, `${AR}/pl`]) {
      const plain = await call(SUPER, 'get', `${ep}?invoiceHeaderId=${G.invoice.id}&limit=50`);
      expectStatus(plain, 200, `${ep} default`);
      assert.deepStrictEqual(ids(plain), [Number(dpRec.id)], `${ep}: only the down payment by default`);
      const withLoan = await call(SUPER, 'get', `${ep}?invoiceHeaderId=${G.invoice.id}&limit=50&includeLoanSettlement=1`);
      expectStatus(withLoan, 200, `${ep} includeLoanSettlement`);
      assert.deepStrictEqual(ids(withLoan), [Number(dpRec.id), Number(loanRec.id)].sort((a, b) => a - b), `${ep}: both with the flag`);
      const label = Object.fromEntries(withLoan.data.data.receiveHeaders.map(r => [Number(r.id), r.loanSettlementTxNo]));
      assert.deepStrictEqual(label, { [dpRec.id]: null, [loanRec.id]: disb.txNo }, `${ep}: loanSettlementTxNo`);
    }
    const message = `This receipt settles loan ${disb.txNo}; reverse it from the loan module.`;
    const attempts = [
      ['put', `${AR}/${loanRec.id}`, { notes: 'edited in POS' }],
      ['delete', `${AR}/${loanRec.id}`],
      ['post', `${AR}/${loanRec.id}/void`, { reason: 'test' }],
      ['post', `${AR}/${loanRec.id}/cancel`, { reason: 'test' }],
      ['post', `${AR}/${loanRec.id}/reactivate`, { reason: 'test' }]
    ];
    for (const [method, url, body] of attempts) {
      const r = await call(SUPER, method, url, body);
      expectStatus(r, 409, `${method} ${url}`);
      assert.strictEqual(r.data.message, message);
    }
    console.log(`        refusal: HTTP 409 "${message}"`);
    assert.deepStrictEqual(await q('SELECT id, status FROM ARReceiveHeader WHERE id = ?', [loanRec.id]), [loanRec], 'receipt unchanged');
    assert.strictEqual((await q('SELECT status FROM ARInvoiceHeader WHERE id = ?', [G.invoice.id]))[0].status, 'paid');
    // An ordinary receipt passes the guard
    const { refuseLoanReceipt } = require('../../src/loan/posting/posReceiptLink');
    let passed = false;
    await refuseLoanReceipt({ params: { id: String(dpRec.id) } }, { status: () => { throw new Error('refused an ordinary receipt'); } }, () => { passed = true; });
    assert.ok(passed, 'ordinary receipt reaches the POS controller');
  });

  await test('DISB reversal: with the loan section on, the balance sheet AR line and the loan reconciliation return to zero; with it off, the output is identical to main (voided receipt on an open invoice)', async () => {
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    await q("UPDATE ln_tax_profile SET confirmationStatus = 'CONFIRMED'");
    await setSpf('BS_INCLUDE_LOAN_BOOK', 'true');
    const Current = require('../../src/GL/adbReportController');
    const snapshot = async () => {
      const bs = await callBs(Current);
      return {
        arLine: bs.assets.items.find(i => /^Accounts Receivable/.test(i.accountName)).balance,
        portfolio: bs.assets.items.filter(i => /\(loan\)/.test(i.accountName) && String(i.accountNumber) === '1211').reduce((s, i) => s + i.balance, 0),
        recon: bs.loanReconciliation.accountsReceivable
      };
    };
    const delta = (a, b) => ({
      arLine: b.arLine - a.arLine, portfolio: b.portfolio - a.portfolio,
      reconGl: b.recon.gl - a.recon.gl, reconSubledger: b.recon.subledger - a.recon.subledger, reconDifference: b.recon.difference - a.recon.difference
    });
    try {
      const H = await makeLoan();
      await feeCollect(H.account.id, '0');
      const before = await snapshot();
      const disb = await disburse(H.account.id);
      const afterDisb = await snapshot();
      const rev = await makerChecker(H.account.id, { kind: 'REVERSAL', targetTransactionId: disb.transactionId }, 'REVERSAL of DISB');
      assert.strictEqual(rev.reverses, disb.txNo);
      const afterRev = await snapshot();
      const inv = (await q('SELECT status FROM ARInvoiceHeader WHERE id = ?', [H.invoice.id]))[0].status;
      const recs = await q('SELECT receiptNumber, status, CAST(totalReceivedAmount AS CHAR) amt FROM ARReceiveHeader WHERE invoiceHeaderId = ? ORDER BY id', [H.invoice.id]);
      console.log(`        before DISB      : AR line ${before.arLine}, AR recon gl ${before.recon.gl} / subledger ${before.recon.subledger} / difference ${before.recon.difference}`);
      console.log(`        after DISB       : ${JSON.stringify(delta(before, afterDisb))}`);
      console.log(`        after REVERSAL   : ${JSON.stringify(delta(before, afterRev))} (deltas against before DISB)`);
      console.log(`        invoice ${inv}; receipts ${recs.map(r => `${r.receiptNumber.replace(/-\d+$/, '')}=${r.status}:${r.amt}`).join(', ')}`);
      // DISB: the 240m moves from sale receivable to the portfolio in the GL and the invoice leaves the open AR list
      assert.deepStrictEqual(delta(before, afterDisb), { arLine: -240000000, portfolio: 240000000, reconGl: -240000000, reconSubledger: -240000000, reconDifference: 0 });
      // REVERSAL: the GL is restored and, with the switch on, only active receipts reduce the reopened invoice,
      // so the AR line and the reconciliation are back where they were
      assert.deepStrictEqual(delta(before, afterRev), { arLine: 0, portfolio: 0, reconGl: 0, reconSubledger: 0, reconDifference: 0 });
      assert.notStrictEqual(inv, 'paid');

      // Switch off: byte-for-byte what main returns, with the voided 240m receipt sitting on the open invoice
      assert.deepStrictEqual(recs.map(r => r.status), ['active', 'voided'], 'fixture: a voided receipt on an open invoice');
      await setSpf('BS_INCLUDE_LOAN_BOOK', 'false');
      const offNow = await callBs(Current);
      const offMain = await callBs(loadMainBsController());
      assert.deepStrictEqual(offNow, offMain, 'switch off: identical to main');
      const offAr = offNow.assets.items.find(i => /^Accounts Receivable/.test(i.accountName)).balance;
      console.log(`        switch OFF       : identical to main; AR line ${offAr} (main still subtracts the voided receipt: ${afterRev.arLine - offAr} below the switch-on figure)`);
      assert.ok(afterRev.arLine - offAr >= 240000000, 'switch off keeps the original behaviour (the voided 240m is still subtracted)');
    } finally {
      await setSpf('BS_INCLUDE_LOAN_BOOK', 'false');
    }
  });

  // ------------------------------------------------------------------ Phase 5 Part A: multi-currency posting
  const fxState = {};
  const fxSetup = async () => {
    if (fxState.ready) return fxState;
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    await q("UPDATE ln_tax_profile SET confirmationStatus = 'CONFIRMED'");
    fxState.usdId = Number((await q("SELECT id FROM currency WHERE code = 'USD' LIMIT 1"))[0].id);
    // Test fixtures: the product offers USD with its own amount limits and fixed fee (Phase 5 B0)
    if (!(await num('SELECT COUNT(*) n FROM ln_product_currency WHERE productId = ? AND currencyId = ?', [product.id, fxState.usdId]))) {
      await q("INSERT INTO ln_product_currency (productId, currencyId, isDefault, minAmount, maxAmount, authStatus, createdAt, updatedAt) VALUES (?, ?, 0, 1000, 200000, 'AUTHORIZED', NOW(), NOW())", [product.id, fxState.usdId]);
      await q("INSERT INTO ln_product_amount (productId, currencyId, itemType, itemCode, defaultValue, `minValue`, `maxValue`, authStatus, createdAt, updatedAt) VALUES (?, ?, 'COMPONENT', 'DOCUMENTATION_FEE', 15, 0, 100, 'AUTHORIZED', NOW(), NOW())", [product.id, fxState.usdId]);
    }
    const chart = await db.chartAccount.create({ accountNumber: '1106', accountName: 'Loan test bank USD', accountLLName: 'Loan test bank USD', accountType: 'Asset', isActive: true });
    assert.ok(chart.id);
    fxState.bank = await db.bankAccount.create({ accountNumber: '1106', accountName: 'Loan test bank USD', accountType: 'Current', currency: 'USD', isActive: true, balance: 1000000 });
    fxState.ready = true;
    return fxState;
  };
  const setRate = (currencyId, date, rate) => q("INSERT INTO ln_exchange_rate (currencyId, rateDate, rate, source, authStatus, makerId, checkerId, authorizedAt) VALUES (?, ?, ?, 'MANUAL', 'AUTHORIZED', ?, ?, NOW()) ON DUPLICATE KEY UPDATE rate = VALUES(rate), authStatus = 'AUTHORIZED'", [currencyId, date, rate, ADMIN, SUPER]);
  let usdSeq = 0;
  // A USD car sold at the POS: header and invoice in LAK (315,000,000), the vehicle line USD 15,000.00 at 21,000;
  // down payment LAK 63,000,000 received; loan in USD
  const makeUsdLoan = async (requested = '12000') => {
    usdSeq++;
    const d = await businessDate();
    const client = (await q('SELECT id FROM client ORDER BY id LIMIT 1'))[0];
    const productId = (await q('SELECT id FROM product ORDER BY id LIMIT 1'))[0].id;
    const sale = await db.saleHeader.create({ bookingDate: d, referenceNo: `USD-SALE-${usdSeq}-${Date.now()}`, total: 315000000, exchangeRate: 1, isActive: true, clientId: client.id, currencyId: lakId, isPostedToAR: true });
    await db.saleLine.create({ headerId: sale.id, saleHeaderId: sale.id, productId, quantity: 1, unitRate: 1, price: 15000, total: 15000, currencyId: fxState.usdId, exchangeRate: 21000, isActive: true });
    const invoice = await db.arInvoiceHeader.create({ invoiceNumber: `INV-USD-${usdSeq}-${Date.now()}`, invoiceDate: d, totalAmount: '315000000.00', netAmount: '315000000.00', taxAmount: 0, status: 'sent', clientId: client.id, currencyId: lakId, saleHeaderId: sale.id, sourceType: 'POS_ORDER', glPostingStatus: 'posted', exchangeRate: 1 });
    const line = await db.arInvoiceLine.create({ lineNumber: 1, description: 'Vehicle (USD line)', quantity: 1, unitPrice: '15000.00', lineTotal: '15000.00', invoiceHeaderId: invoice.id });
    await sale.update({ arInvoiceId: invoice.id });
    const dp = await db.arReceiveHeaderV2.create({ receiptNumber: `DP-USD-${usdSeq}-${Date.now()}`, bookingDate: d, receivedDate: d, invoiceHeaderId: invoice.id, totalReceivedAmount: '63000000.00', paymentMethod: 'cash', status: 'active', currencyId: lakId, glPostingStatus: 'unposted', exchangeRate: 1 });
    await db.arReceiveLine.create({ receiveHeaderId: dp.id, lineNumber: 1, invoiceLineId: line.id, allocatedAmount: '63000000.00', allocationDate: d });
    const app = await call(ADMIN, 'post', `${L}/applications`, { customerId: client.id, productId: product.id, currencyId: fxState.usdId, vehicleSaleHeaderId: sale.id, vehiclePrice: '15000', downPaymentAmount: '3000', requestedAmount: requested, tenorMonths: 12, interestRate: '0.18', valueDate: d });
    expectStatus(app, 201, 'USD application');
    expectStatus(await call(ADMIN, 'post', `${L}/applications/${app.data.data.id}/submit`), 200, 'submit');
    expectStatus(await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/approve`), 200, 'approve');
    const booked = await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/book`);
    expectStatus(booked, 201, 'book');
    return { account: booked.data.data.account, sale, invoice };
  };
  const glBase = async accountNumber => num("SELECT (SELECT COALESCE(SUM(localDebit),0) FROM general_ledger WHERE drAccountId = a.id AND status = 'POSTED') - (SELECT COALESCE(SUM(localCredit),0) FROM general_ledger WHERE crAccountId = a.id AND status = 'POSTED') n FROM chart_of_account a WHERE accountNumber = ?", [accountNumber]);
  const legBase = async (accountId, role) => num("SELECT COALESCE(SUM(CASE WHEN drCr = 'DR' THEN baseAmount ELSE -baseAmount END),0) n FROM ln_journal_posting WHERE loanAccountId = ? AND roleCode = ?", [accountId, role]);
  const tbBalanced = async () => {
    const tb = await call(SUPER, 'get', '/api/gl/reports/trial-balance?asOfDate=2100-12-31');
    expectStatus(tb, 200, 'trial balance');
    assert.strictEqual(tb.data.totalDebits, tb.data.totalCredits, 'trial balance balanced');
  };

  await test('FX X2: a USD 12,000 loan settles the LAK invoice of a POS sale (USD line 15,000 at 21,000) through CCY_POSITION; table rate 21,150 within tolerance posts with a warning; no FX at DISB; CCY_POSITION nets to zero in the GL; trial balance balanced', async () => {
    await fxSetup();
    const start = '2027-03-01';
    await setBusinessDate(start);
    await setRate(fxState.usdId, start, '21150');
    const U = await makeUsdLoan();
    fxState.U = U;
    const prop = await call(ADMIN, 'get', `${L}/sales/${U.sale.id}/financing-proposal?currencyId=${fxState.usdId}&date=${start}`);
    expectStatus(prop, 200, 'financing proposal');
    assert.deepStrictEqual([prop.data.data.openBalance, prop.data.data.lineRate, prop.data.data.proposedPrincipal, prop.data.data.tableRate, prop.data.data.deviationTablePct, prop.data.data.withinTolerance],
      ['252000000.0000', '21000.00000000', '12000.0000', '21150.00000000', '0.7092', true], 'principal proposed from the USD sale line');
    const fee = await post(ADMIN, U.account.id, { kind: 'FEE_COLLECT', bankAccountId: fxState.bank.id, insurancePremium: '0' });
    expectStatus(fee, 201, 'USD fee collect');
    assert.strictEqual(fee.data.data.fx.rate, '21150.00000000');
    assert.strictEqual(fee.data.data.fx.warning, null);
    const feeLines = fee.data.data.journal;
    assert.ok(feeLines.every(l => l.baseAmount !== undefined), 'base amounts on every line');
    const cash = feeLines.find(l => l.role === 'CASH_BANK');
    assert.strictEqual(cash.baseAmount, `${Math.round(Number(cash.amount) * 21150)}.0000`, 'cash at the table rate');
    fxState.feeTotal = fee.data.data.amount;
    const created = await post(ADMIN, U.account.id, { kind: 'DISB' });
    expectStatus(created, 202, 'DISB pending');
    const preview = created.data.data.preview;
    console.log(`        DISB warning: ${preview.fx.warning}`);
    assert.match(preview.fx.warning, /Implied rate 21,000\.00 differs from the table rate 21,150\.00 for 2027-03-01 by 0\.71% \(tolerance 1\.00%\)/);
    assert.strictEqual(preview.implied.rate, '21000.00000000');
    const done = await authorize(SUPER, created.data.data.transactionId);
    expectStatus(done, 200, 'DISB authorize');
    const lines = done.data.data.journal.map(l => `${l.drCr} ${l.role} ${l.currencyId === lakId ? 'LAK' : 'USD'} ${l.amount} ${l.baseAmount}`).sort();
    assert.deepStrictEqual(lines, [
      `CR CCY_POSITION USD 12000.0000 252000000.0000`, `CR SALE_RECEIVABLE LAK 252000000.0000 252000000.0000`,
      `DR CCY_POSITION LAK 252000000.0000 252000000.0000`, `DR LOAN_PORTFOLIO USD 12000.0000 252000000.0000`
    ].sort());
    assert.ok(!done.data.data.journal.some(l => l.tag === 'FX_DIFF'), 'no FX at DISB');
    const gl = await q("SELECT a.accountNumber dr, b.accountNumber cr, CAST(g.debit AS CHAR) amt, CAST(g.localDebit AS CHAR) loc, CAST(g.rate AS CHAR) r, c.code ccy FROM general_ledger g JOIN chart_of_account a ON a.id = g.drAccountId JOIN chart_of_account b ON b.id = g.crAccountId LEFT JOIN currency c ON c.id = g.currencyId WHERE g.postingReference = ? ORDER BY g.id", [done.data.data.txNo]);
    console.log(`        DISB GL rows: ${gl.map(x => `${x.dr}>${x.cr} ${x.ccy} ${x.amt} / LAK ${x.loc} @${x.r}`).join('; ')}`);
    assert.deepStrictEqual(gl.map(x => `${x.dr}>${x.cr} ${x.ccy} ${x.amt} ${x.loc} ${x.r}`), ['1211>1990 USD 12000.00 252000000.00 21000.000000', `1990>${gl[1].cr} LAK 252000000.00 252000000.00 1.000000`]);
    assert.strictEqual(await glBase('1990'), 0, 'CCY_POSITION nets to zero in base');
    assert.strictEqual(await legBase(U.account.id, 'LOAN_PORTFOLIO'), 252000000, 'portfolio carries the invoice base');
    const inv = (await q('SELECT status FROM ARInvoiceHeader WHERE id = ?', [U.invoice.id]))[0].status;
    const rec = (await q('SELECT CAST(totalReceivedAmount AS CHAR) amt, currencyId c, CAST(exchangeRate AS CHAR) r FROM ARReceiveHeader WHERE referenceNumber = ?', [done.data.data.txNo]))[0];
    assert.deepStrictEqual([inv, rec.amt, Number(rec.c)], ['paid', '252000000.00', Number(lakId)]);
    const txn = (await q('SELECT CAST(exchangeRate AS CHAR) r, DATE_FORMAT(exchangeRateDate, "%Y-%m-%d") d, fxWarning w FROM ln_transaction WHERE id = ?', [done.data.data.transactionId]))[0];
    assert.deepStrictEqual([txn.r, txn.d], ['21150.00000000', start]);
    assert.match(txn.w, /Implied rate 21,000\.00/);
    await tbBalanced();
  });

  await test('FX U2: installment 1 (1,100.16 = 920.16 + 180.00) paid at 21,500 -> interest recognized at 21,500 (no FX), principal relieved at the carrying 21,000 -> realized gain 460,080; GL base row; REVERSAL restores the carrying base exactly', async () => {
    await fxSetup();
    const U = fxState.U;
    const due1 = (await q("SELECT DATE_FORMAT(dueDate, '%Y-%m-%d') d FROM ln_schedule WHERE loanAccountId = ? AND installmentNo = 1", [U.account.id]))[0].d;
    await setBusinessDate(due1);
    await setRate(fxState.usdId, due1, '21500');
    const pay = await post(ADMIN, U.account.id, { kind: 'REPAYMENT', amount: '1100.16', bankAccountId: fxState.bank.id });
    expectStatus(pay, 201, 'USD repayment');
    const show = pay.data.data.journal.map(l => `${l.drCr} ${l.role} ${l.tag} ${l.isBaseOnly ? '-' : l.amount} ${l.baseAmount}`).sort();
    console.log(`        repayment journal: ${show.join('; ')}`);
    assert.deepStrictEqual(show, [
      'CR FX_GAIN_REALIZED FX_DIFF - 460080.0000', 'CR INTEREST_INCOME INT_ACCR 180.0000 3870000.0000', 'CR INTEREST_RECEIVABLE INT_PAID 180.0000 3870000.0000',
      'CR LOAN_PORTFOLIO PRIN_PAID 920.1600 19323360.0000', 'DR CASH_BANK TOTAL_PAID 1100.1600 23653440.0000', 'DR INTEREST_RECEIVABLE INT_ACCR 180.0000 3870000.0000'
    ].sort());
    assert.strictEqual(await legBase(U.account.id, 'LOAN_PORTFOLIO'), 232676640, 'carrying base 11,079.84 x 21,000');
    const gl = await q("SELECT a.accountNumber dr, b.accountNumber cr, CAST(g.debit AS CHAR) amt, CAST(g.localDebit AS CHAR) loc FROM general_ledger g JOIN chart_of_account a ON a.id = g.drAccountId JOIN chart_of_account b ON b.id = g.crAccountId WHERE g.postingReference = ? ORDER BY g.id", [pay.data.data.txNo]);
    console.log(`        repayment GL rows: ${gl.map(x => `${x.dr}>${x.cr} ${x.amt} / ${x.loc}`).join('; ')}`);
    assert.ok(gl.some(x => String(x.dr) === '1211' && String(x.cr) === '4901' && x.amt === '0.00' && x.loc === '460080.00'), 'base-only FX row Dr portfolio / Cr realized gain');
    const expectedBank = (1000000 + Number(fxState.feeTotal) + 1100.16).toFixed(2);
    assert.strictEqual(Number((await q('SELECT balance b FROM bankAccount WHERE id = ?', [fxState.bank.id]))[0].b).toFixed(2), expectedBank, 'USD bank moved by the fee and the payment, in USD');
    await tbBalanced();
    const rev = await makerChecker(U.account.id, { kind: 'REVERSAL', targetTransactionId: pay.data.data.transactionId }, 'REVERSAL of USD repayment');
    assert.strictEqual(rev.reverses, pay.data.data.txNo);
    assert.strictEqual(await legBase(U.account.id, 'LOAN_PORTFOLIO'), 252000000, 'carrying base restored');
    assert.strictEqual(await legBase(U.account.id, 'INTEREST_RECEIVABLE'), 0);
    assert.strictEqual(await num("SELECT COALESCE(SUM(CASE WHEN drCr = 'DR' THEN baseAmount ELSE -baseAmount END),0) n FROM ln_journal_posting WHERE transactionId IN (?, ?) AND roleCode = 'FX_GAIN_REALIZED'", [pay.data.data.transactionId, rev.transactionId]), 0, 'gain reversed');
    await tbBalanced();
  });

  await test('FX refusals and warnings: wrong principal (implied 21,913.04, 4.35%) refused, or accepted only by the checker under CHECKER_OVERRIDE; rate older than 3 days refused; 2-day-old rate posts with a warning; LAK bank for a USD loan refused; manual rate off, out of tolerance refused, within tolerance needs a checker', async () => {
    await fxSetup();
    const U = fxState.U;
    const d = await businessDate();
    // Wrong principal: USD 11,500 against the LAK 252,000,000 balance
    const W = await makeUsdLoan('11500');
    await setRate(fxState.usdId, d, '21000');
    expectStatus(await post(ADMIN, W.account.id, { kind: 'FEE_COLLECT', bankAccountId: fxState.bank.id, insurancePremium: '0' }), 201, 'fee W');
    const refused = await post(ADMIN, W.account.id, { kind: 'DISB' });
    expectStatus(refused, 409, 'wrong principal');
    console.log(`        refusal: ${refused.data.message}`);
    assert.strictEqual(refused.data.message, 'Implied rate 21,913.04 (LAK 252,000,000 / USD 11,500.00) differs from the sale line rate 21,000.00 by 4.35% and from the table rate 21,000.00 by 4.35% (tolerance 1.00%). Check the principal: proposed USD 12,000.00.');
    await setSpf('LOAN_FX_IMPLIED_RATE_BREACH', 'CHECKER_OVERRIDE');
    try {
      expectStatus(await post(ADMIN, W.account.id, { kind: 'DISB' }), 409, 'reason required');
      const pend = await post(ADMIN, W.account.id, { kind: 'DISB', rateDeviationReason: 'Customer agreed USD 11,500; dealer absorbs the difference' });
      expectStatus(pend, 202, 'pending with reason');
      const noAccept = await authorize(SUPER, pend.data.data.transactionId);
      expectStatus(noAccept, 409, 'checker did not accept');
      assert.match(noAccept.data.message, /The checker must accept the deviation/);
      const ok = await call(SUPER, 'post', `${L}/transactions/${pend.data.data.transactionId}/authorize`, { acceptRateDeviation: true });
      expectStatus(ok, 200, 'checker accepts');
      assert.match(ok.data.data.fx.warning, /Accepted rate deviation/);
      assert.strictEqual(await legBase(W.account.id, 'LOAN_PORTFOLIO'), 252000000, 'the invoice base is carried over');
      assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_audit_log WHERE entityName = 'loan-transaction' AND entityId = ? AND actionType = 'AUTH' AND newValuesJson LIKE '%acceptedRateDeviation%'", [pend.data.data.transactionId]), 1, 'acceptance audited');
    } finally {
      await setSpf('LOAN_FX_IMPLIED_RATE_BREACH', 'REFUSE');
    }
    // Rate age: 4 days old refused; 2 days old posts with the warning
    const later4 = D.addDays(d, 4);
    await setBusinessDate(later4);
    const stale = await post(ADMIN, U.account.id, { kind: 'REPAYMENT', amount: '10', bankAccountId: fxState.bank.id });
    expectStatus(stale, 409, 'stale rate');
    assert.match(stale.data.message, /4 days before the booking date .* \(LOAN_FX_MAX_RATE_AGE_DAYS = 3\)/);
    const later2 = D.addDays(d, 2);
    await setBusinessDate(later2);
    const warned = await post(ADMIN, U.account.id, { kind: 'REPAYMENT', amount: '10', bankAccountId: fxState.bank.id });
    expectStatus(warned, 201, 'two-day-old rate');
    assert.strictEqual(warned.data.data.fx.warning, `Rate of ${d} used for booking date ${later2} (2 days old)`);
    assert.strictEqual((await q('SELECT fxWarning w FROM ln_transaction WHERE id = ?', [warned.data.data.transactionId]))[0].w, warned.data.data.fx.warning);
    // Wrong bank currency
    const lakBank = await post(ADMIN, U.account.id, { kind: 'REPAYMENT', amount: '10', bankAccountId: bank.id });
    expectStatus(lakBank, 400, 'LAK bank');
    assert.match(lakBank.data.message, /is LAK; the loan is USD/);
    // Manual rate: off by default; out of tolerance refused; within tolerance -> checker
    await setRate(fxState.usdId, later2, '21000');
    expectStatus(await post(ADMIN, U.account.id, { kind: 'REPAYMENT', amount: '10', bankAccountId: fxState.bank.id, exchangeRate: '21100' }), 409, 'manual rates off');
    await setSpf('LOAN_FX_OVERRIDE_TOLERANCE_PCT', '1.00');
    try {
      expectStatus(await post(ADMIN, U.account.id, { kind: 'REPAYMENT', amount: '10', bankAccountId: fxState.bank.id, exchangeRate: '21300' }), 409, 'outside tolerance');
      const manual = await post(ADMIN, U.account.id, { kind: 'REPAYMENT', amount: '10', bankAccountId: fxState.bank.id, exchangeRate: '21100' });
      expectStatus(manual, 202, 'manual rate needs a checker');
      expectStatus(await authorize(ADMIN, manual.data.data.transactionId), 403, 'maker cannot authorize');
      const done = await authorize(SUPER, manual.data.data.transactionId);
      expectStatus(done, 200, 'checker authorizes manual rate');
      assert.strictEqual(done.data.data.fx.rate, '21100.00000000');
      assert.match(done.data.data.fx.warning, /Manual rate 21100\.00000000 instead of the table rate 21000\.00000000/);
    } finally {
      await setSpf('LOAN_FX_OVERRIDE_TOLERANCE_PCT', '0');
    }
    await tbBalanced();
  });

  await test('FX month-end revaluation (switch on, carry forward) posts FX_REVAL legs and a summarized base-only GL row; off by default; COB rules: USE_BUSINESS_DATE Y needs a POS date strictly later, N follows the Vientiane calendar; loan EOD never moves the POS date', async () => {
    await fxSetup();
    const U = fxState.U;
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_journal_posting WHERE amountTag = 'FX_REVAL'"), 0, 'no revaluation while the job is disabled and the switch off');
    // A month-end no earlier test has run EOD for (EOD batches are unique per date, job, branch and currency)
    const monthEnd = '2028-01-31';
    await setBusinessDate(monthEnd);
    await setRate(fxState.usdId, monthEnd, '20800');
    // COB rules through the status endpoint (X-Loan-Test-Today sets the calendar date the rule sees)
    const status = async (today) => (await call(SUPER, 'get', `${L}/eod/status`, undefined, today ? { 'X-Loan-Test-Today': today } : {})).data.data;
    const y = await status();
    assert.deepStrictEqual([y.cob.mode, y.cob.canRun], ['MANUAL_COB', true], 'POS date 2030-12-31 is later');
    assert.match(y.cob.warning, /microfinance module EOD also moves the POS business date/);
    const posRow = await db.businessDate.create({ currentDate: monthEnd, status: 'OPEN' });
    const equal = await status();
    assert.strictEqual(equal.cob.canRun, false, 'POS date equal to the loan date: day not closed');
    assert.match(equal.cob.reason, /not later than the loan business date/);
    await posRow.destroy();
    await setSpf('USE_BUSINESS_DATE', 'N');
    try {
      const n1 = await status(monthEnd);
      assert.deepStrictEqual([n1.cob.mode, n1.cob.canRun], ['CALENDAR', false]);
      const refusedN = await call(SUPER, 'post', `${L}/eod/run`, undefined, { 'X-Loan-Test-Today': monthEnd });
      expectStatus(refusedN, 409, 'calendar day not over');
      assert.strictEqual(refusedN.data.message, `Loan EOD for ${monthEnd} cannot run: USE_BUSINESS_DATE = N (no manual POS close of business), so the loan follows the calendar in Asia/Vientiane and ${monthEnd} is not over yet (today is ${monthEnd}). Run it after the day has ended. Loan EOD never moves the POS business date.`);
      assert.strictEqual((await status(D.addDays(monthEnd, 1))).cob.canRun, true);
    } finally {
      await setSpf('USE_BUSINESS_DATE', 'Y');
    }
    // Revaluation: switch on and job enabled + authorized
    await setSpf('LOAN_FX_REVAL_ENABLED', 'true');
    await q("UPDATE ln_batch_job SET isEnabled = 1, authStatus = 'AUTHORIZED' WHERE jobCode = 'EOD_FX_REVAL'");
    const posBefore = (await q("SELECT COUNT(*) n, MAX(id) m FROM businessDate"))[0];
    try {
      const carryBefore = await legBase(U.account.id, 'LOAN_PORTFOLIO');
      const prinBefore = await num("SELECT COALESCE(SUM(CASE WHEN drCr = 'DR' THEN amount ELSE -amount END),0) n FROM ln_journal_posting WHERE loanAccountId = ? AND roleCode = 'LOAN_PORTFOLIO'", [U.account.id]);
      const run = await call(SUPER, 'post', `${L}/eod/run`);
      expectStatus(run, 200, 'month-end EOD');
      const reval = await q("SELECT drCr, roleCode r, CAST(baseAmount AS CHAR) b FROM ln_journal_posting WHERE loanAccountId = ? AND amountTag = 'FX_REVAL' ORDER BY id", [U.account.id]);
      console.log(`        revaluation legs (USD loan): ${reval.map(x => `${x.drCr} ${x.r} ${x.b}`).join('; ')}`);
      const expected = Math.round(prinBefore * 20800) - carryBefore;
      const portfolioLeg = reval.find(x => x.r === 'LOAN_PORTFOLIO');
      assert.ok(portfolioLeg, 'portfolio revalued');
      assert.strictEqual((portfolioLeg.drCr === 'DR' ? 1 : -1) * Number(portfolioLeg.b), expected, 'carrying base moved to balance x 20,800');
      assert.strictEqual(await legBase(U.account.id, 'LOAN_PORTFOLIO'), Math.round(prinBefore * 20800), 'carry forward');
      const batch = run.data.data.batches.find(b => /EOD_FX_REVAL/.test(b.batchNumber));
      assert.ok(batch, 'revaluation batch summarized');
      const gl = await q("SELECT CAST(debit AS CHAR) d, CAST(localDebit AS CHAR) l FROM general_ledger WHERE postingReference = ?", [batch.batchNumber]);
      assert.ok(gl.length && gl.every(r => r.d === '0.00'), 'base-only GL rows');
      const after = (await q("SELECT COUNT(*) n, MAX(id) m FROM businessDate"))[0];
      assert.deepStrictEqual([after.n, after.m], [posBefore.n, posBefore.m], 'loan EOD did not move the POS business date');
    } finally {
      await setSpf('LOAN_FX_REVAL_ENABLED', 'false');
      await q("UPDATE ln_batch_job SET isEnabled = 0 WHERE jobCode = 'EOD_FX_REVAL'");
    }
    await tbBalanced();
    assert.strictEqual(await glBase('1990'), 0, 'CCY_POSITION still nets to zero');
  });

  await test('FX books: balance sheet with the loan section shows the currency position check at zero and the portfolio at its carrying base; trial balance balanced; LAK journals have no base-only legs and rate 1', async () => {
    await fxSetup();
    const Current = require('../../src/GL/adbReportController');
    await setSpf('BS_INCLUDE_LOAN_BOOK', 'true');
    try {
      const bs = await callBs(Current);
      assert.ok(bs.loanReconciliation.currencyPosition, 'currency position check present');
      assert.strictEqual(bs.loanReconciliation.currencyPosition.gl, 0, 'currency position nets to zero');
      const portfolio = bs.assets.items.filter(i => /\(loan\)/.test(i.accountName) && String(i.accountNumber) === '1211').reduce((s, i) => s + i.balance, 0);
      assert.strictEqual(portfolio, await glBase('1211'), 'portfolio line equals the GL base balance');
    } finally {
      await setSpf('BS_INCLUDE_LOAN_BOOK', 'false');
    }
    await tbBalanced();
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_journal_posting j JOIN ln_account a ON a.id = j.loanAccountId JOIN currency c ON c.id = a.currencyId WHERE c.isLocalCCY = 1 AND (j.isBaseOnly = 1 OR j.baseAmount <> j.amount OR j.exchangeRate <> 1)"), 0, 'LAK journals unchanged by Phase 5');
  });

  await test('POS defect 9 (evidence only, POS code unchanged): a credit sale with a USD line, invoiced from the order and posted by the AR batch', async () => {
    // A future date: an invoice whose due date is already past is saved as 'overdue', and the AR batch only picks 'sent'/'paid'
    const day = '2026-12-29';
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ARInvoiceHeader WHERE invoiceDate = ? AND glPostingStatus = 'unposted'", [day]), 0, 'fixture date is free');
    const usd = (await q("SELECT id FROM currency WHERE code = 'USD' LIMIT 1"))[0];
    const client = (await q('SELECT id FROM client ORDER BY id LIMIT 1'))[0];
    const productId = (await q('SELECT id FROM product ORDER BY id LIMIT 1'))[0].id;
    const arAcc = (await q("SELECT id FROM chart_of_account WHERE accountType = 'Asset' ORDER BY id LIMIT 1"))[0].id;
    const revAcc = (await q("SELECT id FROM chart_of_account WHERE accountType = 'Revenue' ORDER BY id LIMIT 1"))[0].id;
    // What the POS screen sends: the header in base (lines converted at their rate), the line in the product's currency
    const sale = await db.saleHeader.create({ bookingDate: day, referenceNo: `DEF9-${Date.now()}`, total: 315000000, exchangeRate: 1, currencyId: lakId, isActive: true, clientId: client.id });
    // Both keys, as sales/controller.js assignHeaderId sets them
    await db.saleLine.create({ headerId: sale.id, saleHeaderId: sale.id, productId, quantity: 1, unitRate: 1, price: 15000, total: 15000, currencyId: usd.id, exchangeRate: 21000, isActive: true });
    const inv = await call(SUPER, 'post', `/api/ar-invoices/from-order/${sale.id}`, { invoiceDate: day, DRglAccountId: arAcc, CRglAccountId: revAcc });
    assert.ok([200, 201].includes(inv.status), `invoice from order: ${inv.status} ${JSON.stringify(inv.data && inv.data.message)}`);
    const header = (await q("SELECT id, invoiceNumber, status, CAST(totalAmount AS CHAR) total, currencyId, CAST(exchangeRate AS CHAR) rate, glPostingStatus FROM ARInvoiceHeader WHERE saleHeaderId = ?", [sale.id]))[0];
    assert.strictEqual(header.status, 'sent', 'fixture: invoice is sent (not yet overdue)');
    const lines = await q('SELECT CAST(unitPrice AS CHAR) price, CAST(lineTotal AS CHAR) total FROM ARInvoiceLine WHERE invoiceHeaderId = ?', [header.id]);
    const glBefore = await num('SELECT COUNT(*) n FROM general_ledger WHERE postingReference = ?', [header.invoiceNumber]);
    const batch = await call(SUPER, 'post', '/api/gl/posting/batch', { startDate: day, endDate: day, module: 'AR' });
    expectStatus(batch, 200, 'AR posting batch');
    const gl = await q('SELECT CAST(debit AS CHAR) d, CAST(localDebit AS CHAR) ld, CAST(rate AS CHAR) r, currencyId FROM general_ledger WHERE postingReference = ? OR description LIKE ?', [header.invoiceNumber, `%${header.invoiceNumber}%`]);
    const postedLocal = gl.reduce((s, r) => s + Number(r.ld), 0);
    console.log(`        invoice ${header.invoiceNumber}: header ${header.total} (currency ${header.currencyId}, rate ${header.rate}); lines ${lines.map(l => l.total).join(', ')} (no currency column)`);
    console.log(`        GL rows before batch: ${glBefore}; after AR batch: ${gl.length} row(s), localDebit total ${postedLocal} (currency ${gl.map(r => r.currencyId).join(',')}, rate ${gl.map(r => r.r).join(',')}); expected for the car: 315000000`);
    console.log(`        invoice glPostingStatus after batch: ${(await q('SELECT glPostingStatus s FROM ARInvoiceHeader WHERE id = ?', [header.id]))[0].s}`);
    // Record the observed behaviour exactly (POS code is not changed)
    assert.strictEqual(header.total, '315000000.00');
    assert.deepStrictEqual(lines.map(l => l.total), ['15000.00']);
    assert.strictEqual(postedLocal, 15000, 'DEFECT 9 CONFIRMED: the AR batch posts the USD line amount as LAK');
  });

  await test('preview/:kind (write kinds): the pre-submit journal matches what posting produces, writes nothing (every ln_ table, audit, idempotency and the number sequences), releases the lock at once, and reports clearly when posting is off', async () => {
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    const preview = (accountId, kind, body = {}) => call(ADMIN, 'post', `${L}/accounts/${accountId}/preview/${kind}`, body);
    // Snapshot of every ln_ table plus the POS ledgers, with a content checksum of the number sequences:
    // a consumed document number would change ln_numbering_sequence even if no row were added anywhere.
    const tables = (await q("SELECT table_name t FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name IN ('general_ledger', 'transactionEntry'))")).map(r => r.t);
    const state = async () => {
      const c = {};
      for (const t of tables) c[t] = Number((await q(`SELECT COUNT(*) n FROM \`${t}\``))[0].n);
      const checksums = await q('CHECKSUM TABLE ln_numbering_sequence, ln_idempotency, ln_audit_log, ln_account, ln_schedule EXTENDED');
      return JSON.stringify({ c, checksums }, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
    };

    // A fresh BOOKED loan: preview DISB, then actually disburse, and prove the preview journal equals the posted one.
    const loan = await makeLoan();
    await feeCollect(loan.account.id);
    const before = await state();
    const pv = await preview(loan.account.id, 'DISB', {});
    expectStatus(pv, 200, 'preview DISB on a BOOKED account');
    assert.strictEqual(pv.data.data.dryRun, true, 'preview is flagged dryRun');
    assert.ok(pv.data.data.previewedAt, 'preview reports the time it was computed');
    assert.strictEqual(await state(), before, 'preview DISB wrote nothing (no row, no consumed number, no audit, no idempotency)');
    const disb = await disburse(loan.account.id);
    assert.strictEqual(JSON.stringify(pv.data.data.events), JSON.stringify(disb.events), 'preview events == posted events');
    assert.deepStrictEqual(pv.data.data.journal.map(l => `${l.drCr} ${l.role} ${l.amount}`), disb.journal.map(l => `${l.drCr} ${l.role} ${l.amount}`), 'preview journal legs == posted legs');

    // Lock released at once: a repayment posts on the SAME account immediately after a preview (would hang/deadlock otherwise).
    await preview(loan.account.id, 'WAIVE', { component: 'INTEREST', amount: '1', remarks: 'preview only' });
    const rep = await post(ADMIN, loan.account.id, { kind: 'REPAYMENT', amount: '1000000', bankAccountId: bank.id });
    expectStatus(rep, 201, 'repayment posts right after a preview on the same account');

    // Posting switch off: the preview reports it clearly and still writes nothing (same guard as create).
    const s2 = await state();
    await setSpf('LOAN_POSTING_ENABLED', 'false');
    const off = await preview(loan.account.id, 'DISB', {});
    expectStatus(off, 409, 'preview refused while posting is off');
    assert.match(off.data.message, /posting/i, 'the message points at the posting switch');
    await setSpf('LOAN_POSTING_ENABLED', 'true');
    assert.strictEqual(await state(), s2, 'a refused preview wrote nothing');
    console.log(`        preview wrote nothing across ${tables.length} ln_/POS tables; preview journal matched the posted DISB`);
  });

  await test('switch back OFF: posting and EOD refuse again', async () => {
    await setSpf('LOAN_POSTING_ENABLED', 'false');
    expectStatus(await call(SUPER, 'post', `${L}/eod/run`), 409, 'eod off');
    expectStatus(await post(ADMIN, B.account.id, { kind: 'RECOVERY', amount: '1', bankAccountId: bank.id }), 409, 'posting off');
  });
};
