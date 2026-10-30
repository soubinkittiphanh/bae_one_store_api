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

module.exports = async ({ test, call, q, db, runNode, users, L, expectStatus }) => {
  const { SUPER, ADMIN } = users;
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
    const out = runNode('loan_propose_accounts.js', ['--apply', '--yes', '--features=VAT']);
    assert.match(out, /Applied: 20 account\(s\) created, \d+ PENDING mapping/);
    expectStatus(await call(ADMIN, 'post', `${L}/params/role-gl-mapping/bulk-authorize`, { keys: [1] }), 403, 'admin cannot authorize GL mappings');
    const pending = (await call(SUPER, 'get', `${L}/params/role-gl-mapping?authStatus=PENDING&limit=500`)).data.data.items;
    assert.ok(pending.length >= 20);
    expectStatus(await call(SUPER, 'post', `${L}/params/role-gl-mapping/bulk-authorize`, { keys: pending.map(m => m.id) }), 200, 'authorize mappings (maker is the seed)');
    await setSpf('GL_MAP_VAT_OUTPUT_ACC', '2131');
    const chart = await db.chartAccount.create({ accountNumber: '1105', accountName: 'Loan test bank', accountLLName: 'Loan test bank', accountType: 'Asset', isActive: true });
    assert.ok(chart.id);
    bank = await db.bankAccount.create({ accountNumber: '1105', accountName: 'Loan test bank', accountType: 'Current', currency: 'LAK', isActive: true, balance: 5000000000 });
    await db.businessDate.create({ currentDate: '2030-12-31', status: 'OPEN' });
    await setBusinessDate('2026-11-02');
    await q("UPDATE ln_system_date SET periodLockDate = '2026-10-01'");
    product = (await call(ADMIN, 'get', `${L}/products?search=CAR-LOAN-DB`)).data.data.find(p => p.authStatus === 'AUTHORIZED' && p.status === 'ACTIVE');
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
    assert.match(refused.data.message, /POS business date is 2001-01-01, which is behind the loan business date\. Run the POS close of business/);
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
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_amendment_history WHERE loanAccountId = ? AND amendmentType = 'PARTIAL_PREPAYMENT'", [A.account.id]), 1);

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
    // The POS file as it is on main (before Phase 4), loaded from a temp copy with its requires made absolute
    const original = execFileSync('git', ['show', 'main:src/GL/adbReportController.js'], { cwd: API_ROOT }).toString()
      .replace(/require\((['"])\.\.\//g, `require($1${path.join(API_ROOT, 'src')}/`)
      .replace(/require\((['"])([^./'"][^'"]*)\1\)/g, (m, q, name) => `require(${JSON.stringify(require.resolve(name, { paths: [API_ROOT] }))})`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-orig-'));
    const origFile = path.join(tmp, 'adbReportController.js');
    fs.writeFileSync(origFile, original);
    const Orig = require(origFile);
    const Current = require('../../src/GL/adbReportController');
    const callBs = async (Ctl) => { const r = {}; r.status = () => r; r.json = (b) => { r.body = b; return r; }; await Ctl.getBalanceSheet({ query: { asOfDate: '2100-12-31' } }, r); return r.body; };
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

  await test('switch back OFF: posting and EOD refuse again', async () => {
    await setSpf('LOAN_POSTING_ENABLED', 'false');
    expectStatus(await call(SUPER, 'post', `${L}/eod/run`), 409, 'eod off');
    expectStatus(await post(ADMIN, B.account.id, { kind: 'RECOVERY', amount: '1', bankAccountId: bank.id }), 409, 'posting off');
  });
};
