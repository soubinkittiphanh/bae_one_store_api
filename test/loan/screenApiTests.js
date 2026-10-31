/**
 * Phase 5 Part B1 API tests (the endpoints behind the loan screens), run from test/loan/run.js after the
 * posting tests, on the accounts those tests left. Read-only except the document upload and test dates.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const E = require('../../src/loan/engine');

module.exports = async ({ test, call, q, users, L, expectStatus }) => {
  const { SUPER, ADMIN, CASHIER } = users;
  const D = E.dates;
  const one = async (sql, params) => (await q(sql, params))[0];
  const businessDate = async () => (await one("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1")).d;
  const setBusinessDate = d => q('UPDATE ln_system_date SET prevBusinessDate = ?, currentBusinessDate = ?, nextBusinessDate = ?', [D.addDays(d, -1), d, D.addDays(d, 1)]);
  const units = (s) => { const [i, f = ''] = String(s).replace('-', '').split('.'); const u = BigInt(i) * 10000n + BigInt((f + '0000').slice(0, 4)); return String(s).startsWith('-') ? -u : u; };
  const toLak = (amount, rate) => { // half-up to whole LAK, like fx.toBase with 0 decimals
    const [ri, rf = ''] = String(rate).split('.');
    const r = BigInt(ri) * 100000000n + BigInt((rf + '00000000').slice(0, 8));
    const n = units(amount) * r;
    const d = 100000000n * 10000n;
    return `${(n + d / 2n) / d}.0000`;
  };

  const usd = await one("SELECT id FROM currency WHERE code = 'USD' LIMIT 1");
  const usdAccount = await one("SELECT a.id, a.accountNo FROM ln_account a WHERE a.currencyId = ? AND a.accountStage = 'DISBURSED' ORDER BY a.id LIMIT 1", [usd.id]);
  const lakAccount = await one("SELECT a.id, a.accountNo FROM ln_account a JOIN currency c ON c.id = a.currencyId AND c.isLocalCCY = 1 WHERE a.accountStage = 'DISBURSED' ORDER BY a.id LIMIT 1");

  await test('B1 permissions: CASHIER refused everywhere; ADMIN reads accounts but not reports, collection or documents (SUPER_ADMIN only by default)', async () => {
    assert.ok(usdAccount && lakAccount, 'posting tests left a USD and a LAK account');
    for (const url of [`/accounts`, `/accounts/${lakAccount.id}/summary`, `/accounts/${lakAccount.id}/schedule`, `/accounts/${lakAccount.id}/statement`, '/transactions/pending', '/eod/logs', '/reports/overdue', '/reports/portfolio', `/accounts/${lakAccount.id}/documents`]) {
      expectStatus(await call(CASHIER, 'get', `${L}${url}`), 403, `cashier ${url}`);
    }
    for (const url of ['/accounts', `/accounts/${lakAccount.id}/summary`, `/accounts/${lakAccount.id}/history`, '/transactions/pending', '/eod/logs']) expectStatus(await call(ADMIN, 'get', `${L}${url}`), 200, `admin ${url}`);
    for (const url of ['/reports/overdue', '/reports/portfolio', '/reports/aging', '/reports/npl', '/reports/provisions', '/reports/gl-tieout', `/accounts/${lakAccount.id}/documents`]) {
      expectStatus(await call(ADMIN, 'get', `${L}${url}`), 403, `admin ${url}`);
      expectStatus(await call(SUPER, 'get', `${L}${url}`), 200, `super ${url}`);
    }
  });

  await test('B1 account list (search by account number) and summary: a USD account shows contract amount, base amount, rate, rate date and the rate-age warning; a LAK account has no fx block', async () => {
    const list = (await call(ADMIN, 'get', `${L}/accounts`, undefined, {}).then(r => r)).data.data;
    assert.ok(list.length >= 2 && list.every(a => a.accountNo && a.currency && a.customer));
    const found = (await call(ADMIN, 'get', `${L}/accounts?search=${encodeURIComponent(usdAccount.accountNo)}`)).data.data;
    assert.deepStrictEqual(found.map(a => a.id), [usdAccount.id]);

    const d = await businessDate();
    const rateDate = D.addDays(d, -2);
    await q("INSERT INTO ln_exchange_rate (currencyId, rateDate, rate, source, authStatus, makerId, checkerId, authorizedAt) VALUES (?, ?, '21300', 'MANUAL', 'AUTHORIZED', ?, ?, NOW()) ON DUPLICATE KEY UPDATE rate = VALUES(rate), authStatus = 'AUTHORIZED'", [usd.id, rateDate, ADMIN, SUPER]);
    await q("DELETE FROM ln_exchange_rate WHERE currencyId = ? AND rateDate > ? AND rateDate <= ?", [usd.id, rateDate, d]);
    const s = (await call(ADMIN, 'get', `${L}/accounts/${usdAccount.id}/summary`)).data.data;
    console.log(`        USD summary: outstanding ${s.outstanding.amount} = ${s.baseCurrency} ${s.outstanding.baseAmount} at ${s.fx.rate} (${s.fx.rateDate}); warning: ${s.fx.warning}`);
    assert.strictEqual(s.currency, 'USD');
    assert.deepStrictEqual([s.fx.rate, s.fx.rateDate, s.fx.warning], ['21300.00000000', rateDate, `Rate of ${rateDate} used for booking date ${d} (2 days old)`]);
    assert.strictEqual(s.outstanding.baseAmount, toLak(s.outstanding.amount, s.fx.rate));
    assert.ok(Number(s.portfolioCarrying.baseAmount) >= 0);
    const lak = (await call(ADMIN, 'get', `${L}/accounts/${lakAccount.id}/summary`)).data.data;
    assert.strictEqual(lak.fx, null);
    assert.strictEqual(lak.outstanding.baseAmount, lak.outstanding.amount);

    // No rate within LOAN_FX_MAX_RATE_AGE_DAYS: the base amount is empty and the warning says why
    await q('UPDATE ln_exchange_rate SET authStatus = \'PENDING\' WHERE currencyId = ? AND rateDate = ?', [usd.id, rateDate]);
    const none = (await call(ADMIN, 'get', `${L}/accounts/${usdAccount.id}/summary`)).data.data;
    assert.strictEqual(none.outstanding.baseAmount, null);
    assert.match(none.fx.warning, /LOAN_FX_MAX_RATE_AGE_DAYS|No authorized exchange rate/);
    await q('UPDATE ln_exchange_rate SET authStatus = \'AUTHORIZED\' WHERE currencyId = ? AND rateDate = ?', [usd.id, rateDate]);
  });

  await test('B1 schedule, history and statement: the schedule outstanding equals the summary; the statement carries each movement\'s posting rate and base, and its closing principal equals the journal portfolio', async () => {
    const s = (await call(ADMIN, 'get', `${L}/accounts/${usdAccount.id}/summary`)).data.data;
    const sch = (await call(ADMIN, 'get', `${L}/accounts/${usdAccount.id}/schedule`)).data.data;
    assert.strictEqual(sch.outstanding, s.outstanding.amount);
    assert.ok(sch.rows.length >= 12 && sch.rows[0].components.PRINCIPAL);
    const h = (await call(ADMIN, 'get', `${L}/accounts/${usdAccount.id}/history`)).data.data;
    assert.ok(Array.isArray(h.statusHistory) && Array.isArray(h.amendments) && h.audit.some(a => a.actionType === 'BOOK'));
    const st = (await call(ADMIN, 'get', `${L}/accounts/${usdAccount.id}/statement`)).data.data;
    const disb = st.movements.find(m => m.eventCode === 'DISB');
    console.log(`        statement ${st.accountNo}: opening ${st.opening}; ${st.movements.map(m => `${m.eventCode} ${m.amount} @${m.exchangeRate} = ${m.baseAmount} -> ${m.principalBalance}`).join('; ')}; closing ${st.closing.amount}`);
    assert.ok(disb && disb.exchangeRate && disb.baseAmount && disb.exchangeRateDate, 'DISB shows its rate, rate date and base');
    assert.strictEqual(st.opening, '0.0000');
    assert.strictEqual(st.closing.amount, s.portfolioCarrying.amount, 'closing principal = journal portfolio');
    expectStatus(await call(ADMIN, 'get', `${L}/accounts/${usdAccount.id}/statement?from=2030-01-02&to=2030-01-01`), 400, 'to before from');
    const lakSt = (await call(ADMIN, 'get', `${L}/accounts/${lakAccount.id}/statement`)).data.data;
    assert.ok(lakSt.movements.every(m => m.exchangeRate === undefined), 'LAK statement has no rate columns');
  });

  await test('B1 EOD logs: jobs with their authorization state, recent logs and batches, the indicative rate per foreign currency with its warning', async () => {
    const r = (await call(ADMIN, 'get', `${L}/eod/logs`)).data.data;
    assert.ok(r.jobs.some(j => j.jobCode === 'EOD_FX_REVAL'));
    assert.ok(r.logs.length > 0 && r.batches.length > 0);
    const usdRate = r.rates.find(x => x.currency === 'USD');
    assert.ok(usdRate && usdRate.rate && usdRate.warning, JSON.stringify(r.rates));
  });

  await test('B1 collection list: an account past its first unpaid due date appears with DPD, aging bucket, overdue in contract and base, the rate and the customer phone', async () => {
    const before = await businessDate();
    const firstUnpaid = (await one("SELECT DATE_FORMAT(MIN(s.dueDate), '%Y-%m-%d') d FROM ln_schedule s JOIN ln_schedule_component c ON c.scheduleId = s.id WHERE s.loanAccountId = ? AND c.amountDue - c.amountPaid - c.amountWaived > 0", [usdAccount.id])).d;
    const asOf = D.addDays(firstUnpaid, 40);
    try {
      await setBusinessDate(asOf);
      await q("INSERT INTO ln_exchange_rate (currencyId, rateDate, rate, source, authStatus, makerId, checkerId, authorizedAt) VALUES (?, ?, '21400', 'MANUAL', 'AUTHORIZED', ?, ?, NOW()) ON DUPLICATE KEY UPDATE rate = VALUES(rate), authStatus = 'AUTHORIZED'", [usd.id, asOf, ADMIN, SUPER]);
      const r = (await call(SUPER, 'get', `${L}/reports/overdue`)).data.data;
      const row = r.rows.find(x => x.accountId === usdAccount.id);
      console.log(`        overdue ${row.accountNo}: DPD ${row.dpd} (${row.bucket}), ${row.currency} ${row.overdue.amount} = ${r.baseCurrency} ${row.overdue.baseAmount} at ${row.fx.rate}`);
      assert.strictEqual(row.dpd, 40);
      assert.strictEqual(row.bucket, '31-60');
      assert.strictEqual(row.oldestDueDate, firstUnpaid);
      assert.strictEqual(row.overdue.baseAmount, toLak(row.overdue.amount, '21400'));
      assert.deepStrictEqual([row.fx.rate, row.fx.warning], ['21400.00000000', null]);
      assert.ok('telephone' in row);
      assert.ok(r.rows.every(x => x.dpd > 0 && units(x.overdue.amount) > 0n));
    } finally {
      await setBusinessDate(before);
    }
  });

  await test('B1 reports: portfolio and aging cover every disbursed account once; NPL lists only substandard or worse; provisions show the latest ledger; GL tie-out journal equals the linked GL per account in both currency and base', async () => {
    const disbursed = Number((await one("SELECT COUNT(*) n FROM ln_account WHERE accountStage = 'DISBURSED'")).n);
    const p = (await call(SUPER, 'get', `${L}/reports/portfolio`)).data.data;
    const a = (await call(SUPER, 'get', `${L}/reports/aging`)).data.data;
    const sum = r => r.rows.reduce((s, x) => s + x.accounts, 0);
    assert.strictEqual(sum(p), disbursed);
    assert.strictEqual(sum(a), disbursed);
    assert.ok(p.rows.every(x => x.currency === 'LAK' ? x.outstandingBase === x.outstanding : true));
    const n = (await call(SUPER, 'get', `${L}/reports/npl`)).data.data;
    assert.ok(n.rows.every(x => ['CLASS_C', 'CLASS_D', 'CLASS_E'].includes(x.group)));
    const pr = (await call(SUPER, 'get', `${L}/reports/provisions`)).data.data;
    const withLedger = Number((await one('SELECT COUNT(DISTINCT loanAccountId) n FROM ln_provision_ledger')).n);
    assert.strictEqual(pr.rows.length, withLedger);
    const t = (await call(SUPER, 'get', `${L}/reports/gl-tieout`)).data.data;
    console.log(`        GL tie-out: ${t.rows.length} account/currency rows; balanced ${t.balanced}; ${t.rows.filter(r => r.difference.baseAmount !== '0.0000' || r.unlinkedLegs).map(r => `${r.accountNumber} ${r.currency} diff ${r.difference.amount}/${r.difference.baseAmount} unlinked ${r.unlinkedLegs}`).join('; ') || 'no differences'}`);
    assert.ok(t.rows.length > 0);
    for (const r of t.rows) assert.deepStrictEqual(r.difference, { amount: '0.0000', baseAmount: '0.0000' }, `${r.accountNumber} ${r.currency}`);
    assert.strictEqual(t.balanced, true);
  });

  await test('B7 print templates (D11): printing is refused until a checker authorizes the wording; unknown placeholders are refused; the authorized wording is served to anyone who can view accounts', async () => {
    const none = await call(ADMIN, 'get', `${L}/print-templates/CONTRACT_SUMMARY`);
    expectStatus(none, 404, 'draft only');
    assert.match(none.data.message, /No authorized CONTRACT_SUMMARY template/);
    const draft = await one("SELECT id FROM ln_print_template WHERE templateCode = 'CONTRACT_SUMMARY' AND authStatus = 'PENDING'");
    expectStatus(await call(SUPER, 'put', `${L}/params/print-template/${draft.id}`, { body: 'Borrower {{customerName}} owes {{secretField}}' }), 400, 'unknown placeholder');
    expectStatus(await call(ADMIN, 'post', `${L}/params/print-template/${draft.id}/authorize`), 403, 'admin has no LN_PRINT_TEMPLATE');
    const self = await call(SUPER, 'post', `${L}/params/print-template/${draft.id}/authorize`);
    expectStatus(self, 200, 'seeded draft authorized by a checker');
    const t = (await call(ADMIN, 'get', `${L}/print-templates/CONTRACT_SUMMARY`)).data.data;
    assert.ok(t.body.includes('{{customerName}}') && t.placeholders.includes('maturityDate'));
    expectStatus(await call(CASHIER, 'get', `${L}/print-templates/CONTRACT_SUMMARY`), 403, 'cashier');
  });

  await test('B1 documents (D10): PDF/JPG/PNG only, checked by extension, type and content; size limit from LOAN_DOC_MAX_MB; random stored name in a private folder (not the public uploads/); view needs LN_DOCUMENT VIEW', async () => {
    const boundary = '----loanTestBoundary7MA4YWxk';
    const multipart = (fields, file) => {
      const parts = [];
      for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
      if (file) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from('\r\n'));
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      return Buffer.concat(parts);
    };
    const upload = (user, fields, file) => call(user, 'post', `${L}/accounts/${lakAccount.id}/documents`, multipart(fields, file), { 'Content-Type': `multipart/form-data; boundary=${boundary}` });
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const personal = 'Somchai_Phommavong_ID_1234567.pdf';
    const ok = await upload(SUPER, { docType: 'CONTRACT', remarks: 'signed contract' }, { name: personal, type: 'application/pdf', data: pdf });
    expectStatus(ok, 201, 'upload pdf');
    const row = await one('SELECT storedName, sha256, sizeBytes FROM ln_account_document WHERE id = ?', [ok.data.data.id]);
    assert.match(row.storedName, /^[0-9a-f]{32}\.pdf$/, 'random stored name');
    assert.ok(!JSON.stringify(ok.data).includes('Somchai'), 'the original file name is not stored or returned');
    const stored = path.resolve('private', 'loan-documents', row.storedName);
    assert.ok(fs.existsSync(stored), 'stored in the private folder');
    assert.ok(!fs.existsSync(path.resolve('uploads', 'documents', row.storedName)), 'not in the public uploads folder');
    expectStatus(await upload(SUPER, { docType: 'CONTRACT' }, { name: 'tool.exe', type: 'application/octet-stream', data: pdf }), 400, '.exe refused');
    expectStatus(await upload(SUPER, { docType: 'CONTRACT' }, { name: 'a.pdf', type: 'application/pdf', data: png }), 400, 'PNG content named .pdf');
    expectStatus(await upload(SUPER, { docType: 'CONTRACT' }, { name: 'a.png', type: 'application/pdf', data: png }), 400, 'declared type does not match the extension');
    expectStatus(await upload(SUPER, { docType: 'SELFIE' }, { name: 'a.png', type: 'image/png', data: png }), 400, 'unknown docType');
    expectStatus(await upload(SUPER, { docType: 'CONTRACT' }), 400, 'no file');
    assert.strictEqual((await one("SELECT value FROM SPF WHERE code = 'LOAN_DOC_MAX_MB'")).value, '5', 'seeded default');
    await q("UPDATE SPF SET value = '0.00001' WHERE code = 'LOAN_DOC_MAX_MB'");
    try {
      expectStatus(await upload(SUPER, { docType: 'CONTRACT' }, { name: 'a.pdf', type: 'application/pdf', data: pdf }), 413, 'over LOAN_DOC_MAX_MB');
    } finally {
      await q("UPDATE SPF SET value = '5' WHERE code = 'LOAN_DOC_MAX_MB'");
    }
    expectStatus(await upload(ADMIN, { docType: 'CONTRACT' }, { name: 'a.pdf', type: 'application/pdf', data: pdf }), 403, 'admin has no LN_DOCUMENT CREATE');
    const list = (await call(SUPER, 'get', `${L}/accounts/${lakAccount.id}/documents`)).data.data;
    assert.deepStrictEqual(list.map(x => [x.docType, x.fileExt, x.sizeBytes]), [['CONTRACT', 'pdf', pdf.length]]);
    const file = await call(SUPER, 'get', `${L}/documents/${list[0].id}/file`, undefined, {});
    expectStatus(file, 200, 'download');
    assert.match(file.headers['content-type'], /application\/pdf/);
    assert.match(file.headers['cache-control'], /no-store/);
    assert.ok(!/Somchai/.test(file.headers['content-disposition']), 'download name carries no personal data');
    expectStatus(await call(ADMIN, 'get', `${L}/documents/${list[0].id}/file`), 403, 'admin cannot view documents');
    expectStatus(await call(SUPER, 'get', `${L}/documents/999999/file`), 404, 'unknown document');
    const audit = Number((await one("SELECT COUNT(*) n FROM ln_audit_log WHERE entityName = 'account-document'")).n);
    assert.strictEqual(audit, 1, 'upload audited');
  });
};
