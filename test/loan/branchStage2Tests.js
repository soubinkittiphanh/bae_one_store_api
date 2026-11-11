/**
 * Phase 6 Stage 2 (plan section 7): branch from the sale (R1) with re-checks, journal legs tagged at posting,
 * branch bank mapping, {BRANCH} numbering, EOD over two branches, the branchId filter on the loan reports,
 * and the branch split of the balance sheet loan section and the trial balance ("Not branch-tagged (POS)").
 * Run from run.js after the Stage 1 scope tests. Users (same grants): MA at branch A, MAB at A and B, MN with
 * no terminal, MH with LN_ALL_BRANCHES, CA a checker at A.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const API_ROOT = path.resolve(__dirname, '../..');
const STAGE1 = 'a6c7d1c'; // the committed code before Stage 2: "no filter" must answer exactly like it

module.exports = async ({ test, call, q, db, users, L, expectStatus, branch: BRANCH_A }) => {
  const { SUPER, SUPER2, ADMIN } = users;
  const num = async (sql, params) => Number((await q(sql, params))[0].n);
  const one = async (sql, params) => (await q(sql, params))[0];
  const setSpf = (code, value) => q('UPDATE SPF SET value = ? WHERE code = ?', [value, code]);
  const T = {};
  const term = {};
  let BRANCH_B;
  let lakId;
  let client;
  let product;
  let businessDate;
  let bank; // the posting tests' LAK bank (1105), mapped to branch A
  const prior = {};
  const appCount = () => num('SELECT COUNT(*) n FROM ln_application');
  const seqNext = code => num('SELECT nextNumber n FROM ln_numbering_sequence WHERE sequenceCode = ?', [code]);
  const newSale = async (locationId) => {
    const s = await db.saleHeader.create({ bookingDate: businessDate, referenceNo: `T7-SALE-${uuidv4().slice(0, 8)}`, locationId, total: 300000000, exchangeRate: 1, isActive: true, clientId: client, currencyId: lakId });
    return s.id;
  };
  const appBody = extra => ({ customerId: client, productId: product, currencyId: lakId, vehiclePrice: '300000000', downPaymentAmount: '60000000', requestedAmount: '240000000', tenorMonths: 12, interestRate: '0.18', valueDate: businessDate, ...extra });
  const createApp = (user, extra) => call(user, 'post', `${L}/applications`, appBody(extra));
  const link = (user, t) => q('INSERT IGNORE INTO UserTerminals (createdAt, updateTimestamp, userId, terminalId) VALUES (NOW(), NOW(), ?, ?)', [user, t]);
  const unlink = (user, t) => q('DELETE FROM UserTerminals WHERE userId = ? AND terminalId = ?', [user, t]);
  const repay = (user, accountId, bankAccountId, amount = '1000') => call(user, 'post', `${L}/accounts/${accountId}/transactions`, { kind: 'REPAYMENT', amount, bankAccountId }, { 'Idempotency-Key': `t7-${uuidv4()}` });
  // A disbursed account at branch A, made the way the posting tests make one: sale with AR invoice and down
  // payment, application by ADMIN (terminal at A), approved and booked by SUPER, fee collected, DISB maker-checker.
  const openLoan = async () => {
    const tag = uuidv4().slice(0, 8);
    const sale = await db.saleHeader.create({ bookingDate: businessDate, referenceNo: `T7-OPEN-${tag}`, locationId: BRANCH_A, total: 300000000, exchangeRate: 1, isActive: true, clientId: client, currencyId: lakId, isPostedToAR: true });
    const invoice = await db.arInvoiceHeader.create({ invoiceNumber: `INV-T7-${tag}`, invoiceDate: businessDate, totalAmount: '300000000.00', netAmount: '300000000.00', taxAmount: 0, status: 'sent', clientId: client, currencyId: lakId, saleHeaderId: sale.id, sourceType: 'POS_ORDER', glPostingStatus: 'posted', exchangeRate: 1 });
    const line = await db.arInvoiceLine.create({ lineNumber: 1, description: 'Vehicle', quantity: 1, unitPrice: '300000000.00', lineTotal: '300000000.00', invoiceHeaderId: invoice.id });
    await sale.update({ arInvoiceId: invoice.id });
    const dp = await db.arReceiveHeaderV2.create({ receiptNumber: `DP-T7-${tag}`, bookingDate: businessDate, receivedDate: businessDate, invoiceHeaderId: invoice.id, totalReceivedAmount: '60000000.00', paymentMethod: 'cash', status: 'active', currencyId: lakId, glPostingStatus: 'unposted', exchangeRate: 1 });
    await db.arReceiveLine.create({ receiveHeaderId: dp.id, lineNumber: 1, invoiceLineId: line.id, allocatedAmount: '60000000.00', allocationDate: businessDate });
    const app = await createApp(ADMIN, { vehicleSaleHeaderId: sale.id });
    expectStatus(app, 201, 'open loan: application');
    expectStatus(await call(ADMIN, 'post', `${L}/applications/${app.data.data.id}/submit`), 200, 'open loan: submit');
    expectStatus(await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/approve`), 200, 'open loan: approve');
    const booked = await call(SUPER, 'post', `${L}/applications/${app.data.data.id}/book`);
    expectStatus(booked, 201, 'open loan: book');
    const id = Number(booked.data.data.account.id);
    const tx = (user, body) => call(user, 'post', `${L}/accounts/${id}/transactions`, body, { 'Idempotency-Key': `t7-${uuidv4()}` });
    expectStatus(await tx(ADMIN, { kind: 'FEE_COLLECT', bankAccountId: bank, insurancePremium: '7000000' }), 201, 'open loan: fee collect');
    const disb = await tx(ADMIN, { kind: 'DISB' });
    expectStatus(disb, 202, 'open loan: DISB pending');
    expectStatus(await call(SUPER, 'post', `${L}/transactions/${disb.data.data.transactionId}/authorize`), 200, 'open loan: DISB authorized');
    assert.strictEqual((await one('SELECT accountStage s FROM ln_account WHERE id = ?', [id])).s, 'DISBURSED');
    return id;
  };
  const lnState = async () => {
    const tables = (await q("SELECT table_name t FROM information_schema.tables WHERE table_schema = DATABASE() AND (table_name LIKE 'ln\\_%' OR table_name IN ('general_ledger', 'transactionEntry'))")).map(r => r.t);
    const counts = {};
    for (const t of tables) counts[t] = await num(`SELECT COUNT(*) n FROM \`${t}\``);
    const sums = await q('CHECKSUM TABLE ln_numbering_sequence, ln_account, ln_application, bankAccount EXTENDED');
    return JSON.stringify({ counts, sums }, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  };

  await test('setup (stage 2): branch B, terminals, users MA MAB MN MH CA with the same grants (+ LN_ALL_BRANCHES for MH), product, client, the mapped bank; posting on', async () => {
    BRANCH_B = Number((await one('SELECT id FROM location WHERE id <> ? ORDER BY id LIMIT 1', [BRANCH_A])).id);
    for (const [k, code, loc] of [['A', 990711, BRANCH_A], ['B', 990712, BRANCH_B]]) {
      await q('INSERT INTO terminal (code, name, isActive, createdAt, updateTimestamp, locationId) VALUES (?, ?, 1, NOW(), NOW(), ?)', [code, `T7 terminal ${k}`, loc]);
      term[k] = Number((await one('SELECT id FROM terminal WHERE code = ?', [code])).id);
    }
    const grants = [['LN_APPLICATION', 'VIEW'], ['LN_APPLICATION', 'CREATE'], ['LN_APPLICATION', 'EDIT'], ['LN_APPLICATION', 'AUTHORIZE'], ['LN_ACCOUNT', 'VIEW'], ['LN_ACCOUNT', 'CREATE'],
      ['LN_TRANSACTION', 'VIEW'], ['LN_TRANSACTION', 'CREATE'], ['LN_TRANSACTION', 'AUTHORIZE'], ['LN_REPORT', 'VIEW'], ['LN_COLLECTION', 'VIEW'], ['LN_PRODUCT', 'VIEW'], ['LN_VAT_REPORT', 'VIEW']];
    const addGroup = async (code, list) => {
      await q("INSERT INTO userGroup (name, code, isActive, createdAt, updateTimestamp, homePage) VALUES (?, ?, 1, NOW(), NOW(), '/')", [code, code]);
      const id = Number((await one('SELECT id FROM userGroup WHERE code = ?', [code])).id);
      for (const [f, a] of list) await q('INSERT INTO sec_group_grant (userGroupId, functionCode, actionCode) VALUES (?, ?, ?)', [id, f, a]);
      return id;
    };
    const staff = await addGroup('T7_STAFF', grants);
    const ho = await addGroup('T7_HO', [...grants, ['LN_ALL_BRANCHES', 'VIEW']]);
    const addUser = async (name, groupId, terminals) => {
      await q("INSERT INTO user (cus_id, cus_pass, cus_name, isActive, createdAt, updateTimestamp, groupId) VALUES (?, '!not-a-login', ?, 1, NOW(), NOW(), ?)", [name, name, groupId]);
      const id = Number((await one('SELECT id FROM user WHERE cus_id = ?', [name])).id);
      for (const t of terminals) await link(id, t);
      return id;
    };
    T.MA = await addUser('t7_ma', staff, [term.A]);
    T.MAB = await addUser('t7_mab', staff, [term.A, term.B]);
    T.MN = await addUser('t7_mn', staff, []);
    T.MH = await addUser('t7_mh', ho, []);
    T.CA = await addUser('t7_ca', staff, [term.A]);
    lakId = Number((await one('SELECT id FROM currency WHERE isLocalCCY = 1 LIMIT 1')).id);
    client = Number((await one('SELECT id FROM client ORDER BY id LIMIT 1')).id);
    product = Number((await one("SELECT id FROM ln_product WHERE productCode = 'CAR-LOAN-DB' AND authStatus = 'AUTHORIZED' AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1")).id);
    businessDate = (await one("SELECT DATE_FORMAT(currentBusinessDate, '%Y-%m-%d') d FROM ln_system_date LIMIT 1")).d;
    bank = Number((await one("SELECT id FROM bankAccount WHERE accountNumber = '1105'")).id);
    for (const code of ['LOAN_POSTING_ENABLED', 'BS_INCLUDE_LOAN_BOOK']) prior[code] = (await one('SELECT value v FROM SPF WHERE code = ?', [code])).v;
    for (const code of ['LOAN_APPLICATION', 'LOAN_TRANSACTION', 'LOAN_ACCOUNT']) prior[code] = (await one('SELECT formatPattern p FROM ln_numbering_sequence WHERE sequenceCode = ?', [code])).p;
    await setSpf('LOAN_POSTING_ENABLED', 'true');
  });

  await test('R1 with a sale: the application takes the sale\'s location and ignores a branchId in the body (create and edit); a sale outside the maker\'s branches is refused (403) and writes nothing (no row, no number); allowed for an LN_ALL_BRANCHES maker; a sale without a location is refused (409), never location 1', async () => {
    const saleA = await newSale(BRANCH_A);
    const made = await createApp(T.MA, { vehicleSaleHeaderId: saleA, branchId: BRANCH_B });
    expectStatus(made, 201, 'MA, sale at A, body says B');
    assert.strictEqual(Number(made.data.data.branchId), BRANCH_A, 'the sale decides');
    expectStatus(await call(T.MA, 'put', `${L}/applications/${made.data.data.id}`, { branchId: BRANCH_B, tenorMonths: 12 }), 200, 'edit with branchId B');
    assert.strictEqual(Number((await one('SELECT branchId b FROM ln_application WHERE id = ?', [made.data.data.id])).b), BRANCH_A, 'still A after the edit');

    const saleB = await newSale(BRANCH_B);
    const [count, seq] = [await appCount(), await seqNext('LOAN_APPLICATION')];
    const refused = await createApp(T.MA, { vehicleSaleHeaderId: saleB });
    expectStatus(refused, 403, 'MA, sale at B');
    assert.match(refused.data.message, /outside yours/);
    assert.deepStrictEqual([await appCount(), await seqNext('LOAN_APPLICATION')], [count, seq], 'nothing written, no number used');
    const ho = await createApp(T.MH, { vehicleSaleHeaderId: saleB });
    expectStatus(ho, 201, 'MH (all branches), sale at B');
    assert.strictEqual(Number(ho.data.data.branchId), BRANCH_B);

    const saleNone = await newSale(null);
    const before = await appCount();
    const nowhere = await createApp(T.MH, { vehicleSaleHeaderId: saleNone });
    expectStatus(nowhere, 409, 'sale without a location');
    assert.match(nowhere.data.message, /has no location/);
    assert.strictEqual(await appCount(), before);
  });

  await test('R1 without a sale: the maker\'s single branch (a branchId in the body is ignored); a maker with several branches must pick one (400 without, 403 outside them, 201 inside); a maker with no branch is refused (403); an LN_ALL_BRANCHES maker must pick an existing location', async () => {
    const a = await createApp(T.MA, { branchId: BRANCH_B });
    expectStatus(a, 201, 'MA, no sale');
    assert.strictEqual(Number(a.data.data.branchId), BRANCH_A);
    const count = await appCount();
    const pick = await createApp(T.MAB, {});
    expectStatus(pick, 400, 'MAB without branchId');
    assert.match(pick.data.message, /branchId is required/);
    expectStatus(await createApp(T.MAB, { branchId: 999999 }), 403, 'MAB outside its branches');
    const none = await createApp(T.MN, {});
    expectStatus(none, 403, 'MN has no branch');
    assert.match(none.data.message, /not linked to any branch/);
    assert.strictEqual(await appCount(), count, 'refusals write nothing');
    const b = await createApp(T.MAB, { branchId: BRANCH_B });
    expectStatus(b, 201, 'MAB picks B');
    assert.strictEqual(Number(b.data.data.branchId), BRANCH_B);
    expectStatus(await createApp(T.MH, {}), 400, 'MH must pick');
    expectStatus(await createApp(T.MH, { branchId: 999999 }), 400, 'MH: no such location');
    const h = await createApp(T.MH, { branchId: BRANCH_B });
    expectStatus(h, 201, 'MH picks B');
    assert.strictEqual(Number(h.data.data.branchId), BRANCH_B);
  });

  await test('R1 re-checks: submit refuses when the sale moved to another branch (409); approve and book refuse (403) while the maker has lost the branch\'s terminal and pass once it is back; book refuses (409) when the sale moved; the booked account carries the application\'s branch', async () => {
    const saleA = await newSale(BRANCH_A);
    const moved = await createApp(T.MA, { vehicleSaleHeaderId: saleA });
    expectStatus(moved, 201, 'create');
    await q('UPDATE saleHeader SET locationId = ? WHERE id = ?', [BRANCH_B, saleA]);
    const sub = await call(T.MA, 'post', `${L}/applications/${moved.data.data.id}/submit`);
    expectStatus(sub, 409, 'submit after the sale moved');
    assert.match(sub.data.message, /now at location/);
    await q('UPDATE saleHeader SET locationId = ? WHERE id = ?', [BRANCH_A, saleA]);

    const saleA2 = await newSale(BRANCH_A);
    const app = (await createApp(T.MA, { vehicleSaleHeaderId: saleA2 })).data.data;
    expectStatus(await call(T.MA, 'post', `${L}/applications/${app.id}/submit`), 200, 'submit');
    await unlink(T.MA, term.A);
    const ap = await call(T.CA, 'post', `${L}/applications/${app.id}/approve`);
    expectStatus(ap, 403, 'approve while the maker has no terminal at A');
    assert.match(ap.data.message, /no longer works at branch/);
    await link(T.MA, term.A);
    expectStatus(await call(T.CA, 'post', `${L}/applications/${app.id}/approve`), 200, 'approve once the maker is back');
    await unlink(T.MA, term.A);
    expectStatus(await call(T.CA, 'post', `${L}/applications/${app.id}/book`), 403, 'book while the maker has no terminal at A');
    await link(T.MA, term.A);
    await q('UPDATE saleHeader SET locationId = ? WHERE id = ?', [BRANCH_B, saleA2]);
    expectStatus(await call(T.CA, 'post', `${L}/applications/${app.id}/book`), 409, 'book after the sale moved');
    await q('UPDATE saleHeader SET locationId = ? WHERE id = ?', [BRANCH_A, saleA2]);
    const booked = await call(T.CA, 'post', `${L}/applications/${app.id}/book`);
    expectStatus(booked, 201, 'book');
    assert.strictEqual(Number(booked.data.data.account.branchId), BRANCH_A);
  });

  let profile;
  await test('{BRANCH} numbering: branch profiles by maker-checker under LN_BRANCH (SUPER_ADMIN only: ADMIN 403; bad code 400; the maker cannot authorize); branch A\'s profile comes from the posting fixture; with {BRANCH} in the pattern the number carries the branch code; one company-wide counter across branches; a branch without an AUTHORIZED active profile is refused (409) and writes nothing; widths fit', async () => {
    expectStatus(await call(ADMIN, 'post', `${L}/params/branch-profile`, { locationId: BRANCH_B, branchCode: 'SR2' }), 403, 'ADMIN has no LN_BRANCH');
    expectStatus(await call(SUPER, 'post', `${L}/params/branch-profile`, { locationId: BRANCH_B, branchCode: 'sr-2' }), 400, 'bad code');
    const a = await one("SELECT id, branchCode c FROM ln_branch_profile WHERE locationId = ? AND authStatus = 'AUTHORIZED' AND isActive = 1", [BRANCH_A]);
    assert.ok(a && a.c === 'SR1', 'the posting fixture authorized branch A\'s profile');
    profile = { [BRANCH_A]: Number(a.id) };
    const made = await call(SUPER, 'post', `${L}/params/branch-profile`, { locationId: BRANCH_B, branchCode: 'SR2' });
    expectStatus(made, 201, 'profile SR2');
    expectStatus(await call(SUPER, 'post', `${L}/params/branch-profile/${made.data.data.id}/authorize`), 403, 'maker cannot authorize');
    expectStatus(await call(SUPER2, 'post', `${L}/params/branch-profile/${made.data.data.id}/authorize`), 200, 'a second person authorizes SR2');
    profile[BRANCH_B] = made.data.data.id;
    await q("UPDATE ln_numbering_sequence SET formatPattern = '{PREFIX}-{BRANCH}-{YEAR}{MONTH}-{NUMBER}' WHERE sequenceCode IN ('LOAN_APPLICATION', 'LOAN_TRANSACTION', 'LOAN_ACCOUNT')");
    const seq = await seqNext('LOAN_APPLICATION');
    const appA = (await createApp(T.MA, {})).data.data;
    const appB = (await createApp(T.MH, { branchId: BRANCH_B })).data.data;
    const ym = businessDate.slice(0, 7).replace('-', '');
    assert.strictEqual(appA.appNo, `APP-SR1-${ym}-${String(seq).padStart(5, '0')}`);
    assert.strictEqual(appB.appNo, `APP-SR2-${ym}-${String(seq + 1).padStart(5, '0')}`, 'the next number of the same counter');
    await q('UPDATE ln_branch_profile SET isActive = 0 WHERE id = ?', [profile[BRANCH_B]]);
    const [count, seq2] = [await appCount(), await seqNext('LOAN_APPLICATION')];
    const noCode = await createApp(T.MH, { branchId: BRANCH_B });
    expectStatus(noCode, 409, 'branch B without an active profile');
    assert.match(noCode.data.message, /no AUTHORIZED, active branch profile/);
    assert.deepStrictEqual([await appCount(), await seqNext('LOAN_APPLICATION')], [count, seq2], 'nothing written, number not used');
    await q('UPDATE ln_branch_profile SET isActive = 1 WHERE id = ?', [profile[BRANCH_B]]);
    const widths = await q("SELECT table_name t, column_name c, character_maximum_length m FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name, column_name) IN (('ln_account','accountNo'), ('ln_application','appNo'), ('ln_transaction','txNo')))");
    const longest = { accountNo: 'LN-ABCDEFGHIJ-202611-00001', appNo: 'APP-ABCDEFGHIJ-202611-00001', txNo: 'TXN-ABCDEFGHIJ-202611-000001' };
    for (const w of widths) assert.ok(longest[w.c].length <= Number(w.m), `${w.t}.${w.c} (${w.m}) fits a 10-character branch code`);
  });

  let Y; // a disbursed account moved to branch B
  let Z; // a disbursed account left at branch A
  await test('bank mapping and journal tagging: the account\'s bank list holds only AUTHORIZED, active accounts mapped to its branch; a posting with an unmapped or only PENDING-mapped bank is refused (400) and writes nothing; after moving the account to B, A\'s mapping no longer counts; once mapped to B it posts, every leg carries branch B and the number SR2; a posting at A is tagged A with SR1', async () => {
    // Two fresh disbursed LAK accounts at A (the earlier tests leave too few open ones to borrow)
    Y = await openLoan();
    Z = await openLoan();
    const other = await db.bankAccount.create({ accountNumber: `T7-UNMAPPED-${Date.now()}`, accountName: 'T7 unmapped', accountType: 'Current', currency: 'LAK', isActive: true, balance: 0 });
    const listed = async id => (await call(SUPER, 'get', `${L}/accounts/${id}/bank-accounts`)).data.data.map(b => Number(b.id));
    assert.ok((await listed(Y)).includes(bank) && !(await listed(Y)).includes(other.id), 'A\'s list: mapped bank only');
    // The seed's prefilled rows are PENDING: their bank is refused until a second person authorizes the row
    const pre = await one("SELECT id, bankAccountId b FROM ln_branch_bank_account WHERE locationId = ? AND authStatus = 'PENDING' AND makerId IS NULL ORDER BY id LIMIT 1", [BRANCH_A]);
    assert.ok(pre, 'the seed prefilled a PENDING row at A');
    const prefRefused = await repay(SUPER, Z, pre.b);
    expectStatus(prefRefused, 400, 'prefilled PENDING bank');
    assert.match(prefRefused.data.message, /not mapped to branch/);
    assert.ok(!(await listed(Z)).includes(Number(pre.b)), 'not listed while PENDING');
    expectStatus(await call(SUPER2, 'post', `${L}/params/branch-bank-account/${pre.id}/authorize`), 200, 'a second person authorizes the prefilled row');
    assert.ok((await listed(Z)).includes(Number(pre.b)), 'listed once authorized');
    const prefAfter = await repay(SUPER, Z, pre.b);
    assert.ok(!(prefAfter.status === 400 && /not mapped to branch/.test(prefAfter.data.message)), `the mapping no longer refuses it (got ${prefAfter.status} ${prefAfter.data.message || ''})`);
    let before = await lnState();
    const r1 = await repay(SUPER, Y, other.id);
    expectStatus(r1, 400, 'unmapped bank');
    assert.match(r1.data.message, /not mapped to branch/);
    const pendingMap = await call(SUPER, 'post', `${L}/params/branch-bank-account`, { locationId: BRANCH_A, bankAccountId: other.id, purpose: 'BANK' });
    expectStatus(pendingMap, 201, 'a PENDING mapping');
    before = await lnState();
    expectStatus(await repay(SUPER, Y, other.id), 400, 'a PENDING mapping does not count');
    assert.ok(!(await listed(Y)).includes(other.id), 'not listed while PENDING');
    assert.strictEqual(await lnState(), before, 'refusals wrote nothing');

    await q('UPDATE ln_account SET branchId = ? WHERE id = ?', [BRANCH_B, Y]);
    assert.deepStrictEqual(await listed(Y), [], 'B has no mapped bank yet');
    before = await lnState();
    expectStatus(await repay(SUPER, Y, bank), 400, 'A\'s bank is not B\'s');
    assert.strictEqual(await lnState(), before);
    const mapB = await call(SUPER, 'post', `${L}/params/branch-bank-account`, { locationId: BRANCH_B, bankAccountId: bank, purpose: 'BANK' });
    expectStatus(mapB, 201, 'map to B');
    expectStatus(await call(SUPER2, 'post', `${L}/params/branch-bank-account/${mapB.data.data.id}/authorize`), 200, 'authorize');
    assert.deepStrictEqual(await listed(Y), [bank]);
    const atB = await repay(SUPER, Y, bank);
    expectStatus(atB, 201, 'posts at B');
    assert.match(atB.data.data.txNo, /^TXN-SR2-\d{6}-\d{6}$/);
    const legsB = await q('SELECT DISTINCT branchId b FROM ln_journal_posting WHERE transactionId = ?', [atB.data.data.transactionId]);
    assert.deepStrictEqual(legsB.map(r => Number(r.b)), [BRANCH_B], 'every leg at B');
    assert.strictEqual(Number((await one('SELECT branchId b FROM ln_transaction WHERE id = ?', [atB.data.data.transactionId])).b), BRANCH_B);
    const atA = await repay(SUPER, Z, bank);
    expectStatus(atA, 201, 'posts at A');
    assert.match(atA.data.data.txNo, /^TXN-SR1-/);
    assert.deepStrictEqual((await q('SELECT DISTINCT branchId b FROM ln_journal_posting WHERE transactionId = ?', [atA.data.data.transactionId])).map(r => Number(r.b)), [BRANCH_A]);
    const untagged = await num("SELECT COUNT(*) n FROM ln_journal_posting jp JOIN ln_transaction t ON t.id = jp.transactionId WHERE t.createdAt >= NOW() - INTERVAL 1 HOUR AND jp.branchId IS NULL");
    assert.strictEqual(untagged, 0, 'no leg posted today is untagged');
  });

  await test('EOD: one run over two branches; every EOD transaction and leg carries its account\'s branch, numbers carry the branch code, and each GL batch is per branch (batch number B<branch> = its branchId)', async () => {
    const lastId = await num('SELECT IFNULL(MAX(id), 0) n FROM ln_transaction');
    // Y and Z were disbursed today: no accrual (not month-end), no penalty, so EOD would drop their empty
    // transactions. A stale DPD gives the classification job real work on both accounts.
    await q('UPDATE ln_account SET currentDpd = 99 WHERE id IN (?, ?)', [Y, Z]);
    const run = await call(SUPER, 'post', `${L}/eod/run`);
    expectStatus(run, 200, 'eod');
    assert.deepStrictEqual((await q('SELECT currentDpd d FROM ln_account WHERE id IN (?, ?)', [Y, Z])).map(r => Number(r.d)), [0, 0], 'EOD reclassified both');
    const txns = await q("SELECT id, loanAccountId a, branchId b, txNo FROM ln_transaction WHERE id > ? AND source = 'EOD'", [lastId]);
    const ofY = txns.filter(t => Number(t.a) === Y);
    const ofZ = txns.filter(t => Number(t.a) === Z);
    assert.ok(ofY.length > 0 && ofZ.length > 0, 'both accounts ran in the same EOD');
    assert.ok(ofY.every(t => Number(t.b) === BRANCH_B && /^TXN-SR2-/.test(t.txNo)), 'Y at B');
    assert.ok(ofZ.every(t => Number(t.b) === BRANCH_A && /^TXN-SR1-/.test(t.txNo)), 'Z at A');
    const mismatched = await num('SELECT COUNT(*) n FROM ln_journal_posting jp JOIN ln_transaction t ON t.id = jp.transactionId WHERE t.id > ? AND NOT (jp.branchId <=> t.branchId)', [lastId]);
    assert.strictEqual(mismatched, 0, 'every EOD leg carries its transaction\'s branch');
    const batches = await q("SELECT DISTINCT b.batchNumber n, b.branchId br FROM ln_gl_batch b JOIN ln_journal_posting jp ON jp.glBatchId = b.batchNumber JOIN ln_transaction t ON t.id = jp.transactionId WHERE t.id > ?", [lastId]);
    assert.ok(batches.every(x => x.n.includes(`-B${x.br}-`)), `batch numbers carry their branch: ${batches.map(x => x.n).join(', ')}`);
    console.log(`        EOD: ${txns.length} transactions (Y at B: ${ofY.length}, Z at A: ${ofZ.length}); batches: ${batches.map(x => x.n).join(', ') || 'none with legs'}`);
  });

  await test('report filter: ?branchId narrows every loan list to one branch inside the caller\'s scope (403 outside it, 403 for branchId=all without LN_ALL_BRANCHES, 400 when malformed); MH sees only branch B with ?branchId=B; portfolio groupBy=branch counts each branch\'s accounts', async () => {
    const get = async (who, url, status = 200) => { const r = await call(T[who], 'get', `${L}${url}`); expectStatus(r, status, `${who} ${url}`); return r.data.data; };
    const bAccounts = (await q('SELECT id FROM ln_account WHERE branchId = ?', [BRANCH_B])).map(r => Number(r.id));
    const disbursedAt = async b => num("SELECT COUNT(*) n FROM ln_account WHERE accountStage = 'DISBURSED' AND branchId = ?", [b]);
    for (const url of ['/accounts', '/applications', '/transactions/pending', '/reports/overdue', '/reports/portfolio', '/reports/aging', '/reports/npl', '/reports/provisions', '/reports/gl-tieout', '/reports/vat']) {
      await get('MA', `${url}?branchId=${BRANCH_B}`, 403);
      await get('MA', `${url}?branchId=all`, 403);
      await get('MH', `${url}?branchId=x`, 400);
      assert.deepStrictEqual(await get('MA', `${url}?branchId=${BRANCH_A}`), await get('MA', url), `MA ${url}: its own branch = no filter`);
    }
    assert.ok((await get('MH', `/accounts?limit=500&branchId=${BRANCH_B}`)).every(a => bAccounts.includes(Number(a.id))), 'accounts at B only');
    const port = await get('MH', `/reports/portfolio?branchId=${BRANCH_B}`);
    assert.strictEqual(port.rows.reduce((s, r) => s + r.accounts, 0), await disbursedAt(BRANCH_B));
    assert.ok((await get('MH', `/reports/overdue?branchId=${BRANCH_B}`)).rows.every(r => bAccounts.includes(Number(r.accountId))));
    const byBranch = await get('MH', '/reports/portfolio?groupBy=branch');
    const counts = {};
    for (const r of byBranch.rows) counts[r.group] = (counts[r.group] || 0) + r.accounts;
    assert.deepStrictEqual(counts[String(BRANCH_B)], await disbursedAt(BRANCH_B));
    assert.deepStrictEqual(counts[String(BRANCH_A)], await disbursedAt(BRANCH_A));
    assert.deepStrictEqual(await get('MH', '/reports/portfolio?branchId=all'), await get('MH', '/reports/portfolio'), 'all = no filter');
  });

  await test('BS loan section and TB by branch: per account, every branch\'s lines plus "Not branch-tagged (POS)" equal the company total (TB debits and credits; BS loan assets, liabilities and loan result); without a branchId both reports answer exactly as the Stage 1 code did (BS with the loan switch on and off)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage1-'));
    const fromGit = (file) => execFileSync('git', ['show', `${STAGE1}:${file}`], { cwd: API_ROOT }).toString();
    const absolutize = src => src
      .replace(/require\((['"])\.\.\/\.\.\//g, `require($1${path.join(API_ROOT, 'src')}/`)
      .replace(/require\((['"])\.\.\/engine\//g, `require($1${path.join(API_ROOT, 'src/loan/engine')}/`)
      .replace(/require\((['"])([^./'"][^'"]*)\1\)/g, (m, qq, name) => `require(${JSON.stringify(require.resolve(name, { paths: [API_ROOT] }))})`);
    const oldSection = path.join(tmp, 'balanceSheetSection.js');
    fs.writeFileSync(oldSection, absolutize(fromGit('src/loan/reports/balanceSheetSection.js')));
    const oldCtl = path.join(tmp, 'adbReportController.js');
    fs.writeFileSync(oldCtl, fromGit('src/GL/adbReportController.js')
      .replace(/require\((['"])\.\.\/loan\/reports\/balanceSheetSection\1\)/g, `require(${JSON.stringify(oldSection)})`)
      .replace(/require\((['"])\.\.\//g, `require($1${path.join(API_ROOT, 'src')}/`)
      .replace(/require\((['"])([^./'"][^'"]*)\1\)/g, (m, qq, name) => `require(${JSON.stringify(require.resolve(name, { paths: [API_ROOT] }))})`));
    const Old = require(oldCtl);
    const New = require('../../src/GL/adbReportController');
    const run = async (Ctl, method, query) => { const r = {}; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; await Ctl[method]({ query }, r); return r; };
    const asOfDate = '2100-12-31';
    const tbDiff = async () => { const [n, o] = [await run(New, 'getTrialBalance', { asOfDate }), await run(Old, 'getTrialBalance', { asOfDate })]; assert.deepStrictEqual(n.body, o.body, 'TB without a filter = Stage 1'); return n.body; };
    const company = await tbDiff();
    for (const sw of ['false', 'true']) {
      await setSpf('BS_INCLUDE_LOAN_BOOK', sw);
      assert.deepStrictEqual((await run(New, 'getBalanceSheet', { asOfDate })).body, (await run(Old, 'getBalanceSheet', { asOfDate })).body, `BS without a filter = Stage 1 (loan switch ${sw})`);
    }
    // branches that hold loan GL rows
    const branches = (await q('SELECT DISTINCT branchId b FROM ln_journal_posting WHERE branchId IS NOT NULL UNION SELECT DISTINCT branchId FROM ln_transaction')).map(r => Number(r.b));
    assert.ok(branches.includes(BRANCH_A) && branches.includes(BRANCH_B), `two branches carry loan rows (${branches.join(', ')})`);
    const parts = {};
    const add = (key, dr, cr) => { parts[key] = parts[key] || { dr: 0, cr: 0 }; parts[key].dr += dr; parts[key].cr += cr; };
    let notTagged;
    for (const b of branches) {
      const r = (await run(New, 'getTrialBalance', { asOfDate, branchId: String(b) })).body;
      assert.strictEqual(r.branchId, b);
      for (const a of r.accounts) add(a.id, a.totalDebits, a.totalCredits);
      notTagged = r.notBranchTagged;
    }
    assert.strictEqual(notTagged.label, 'Not branch-tagged (POS)');
    for (const a of notTagged.accounts) add(a.id, a.totalDebits, a.totalCredits);
    const off = company.accounts.filter(a => !parts[a.id] || Math.abs(parts[a.id].dr - a.totalDebits) > 0.005 || Math.abs(parts[a.id].cr - a.totalCredits) > 0.005);
    assert.deepStrictEqual(off.map(a => a.accountNumber), [], 'TB: branches + not-tagged = company, per account');
    assert.strictEqual(Object.keys(parts).length, company.accounts.length, 'no account appears only in a branch view');
    const taggedA = (await run(New, 'getTrialBalance', { asOfDate, branchId: String(BRANCH_A) })).body;
    const taggedB = (await run(New, 'getTrialBalance', { asOfDate, branchId: String(BRANCH_B) })).body;
    assert.ok(taggedA.accounts.length > 0 && taggedB.accounts.length > 0, 'both branches have their own lines');
    expectStatus({ status: (await run(New, 'getTrialBalance', { asOfDate, branchId: 'x' })).code, data: {} }, 400, 'malformed branchId');

    // BS loan section: per account number, the branches plus not-tagged equal the company loan lines
    const section = require('../../src/loan/reports/balanceSheetSection');
    const whole = await section.build({ asOfDate, subledger: { cashAndBank: 0, ar: 0 } });
    const sum = {};
    let result = 0;
    const take = (lines) => { for (const x of [...lines.assets, ...lines.liabilities]) sum[x.accountNumber] = (sum[x.accountNumber] || 0) + x.balance; result += lines.loanResult; };
    let nt;
    for (const b of branches) { const s = await section.buildBranch({ asOfDate, branchId: b }); take(s.branch); nt = s.notBranchTagged; }
    take(nt);
    for (const x of [...whole.assets, ...whole.liabilities]) assert.ok(Math.abs((sum[x.accountNumber] || 0) - x.balance) < 0.005, `BS ${x.accountNumber}: ${sum[x.accountNumber]} vs ${x.balance}`);
    assert.ok(Math.abs(result - whole.loanResult) < 0.005, `loan result ${result} vs ${whole.loanResult}`);
    const viaCtl = await run(New, 'getBalanceSheet', { asOfDate, branchId: String(BRANCH_B) });
    assert.strictEqual(viaCtl.body.branchId, BRANCH_B);
    assert.strictEqual(viaCtl.body.notBranchTagged.label, 'Not branch-tagged (POS)');
    assert.ok(Array.isArray(viaCtl.body.notBranchTagged.pos.assets.items), 'POS lines sit under not-tagged');
    await setSpf('BS_INCLUDE_LOAN_BOOK', 'false');
    assert.strictEqual((await run(New, 'getBalanceSheet', { asOfDate, branchId: String(BRANCH_B) })).code, 409, 'a branch BS needs the loan section on');
  });

  await test('cleanup (stage 2): numbering patterns and switches back, test users inactive and their groups without grants', async () => {
    for (const code of ['LOAN_APPLICATION', 'LOAN_TRANSACTION', 'LOAN_ACCOUNT']) await q('UPDATE ln_numbering_sequence SET formatPattern = ? WHERE sequenceCode = ?', [prior[code], code]);
    for (const code of ['LOAN_POSTING_ENABLED', 'BS_INCLUDE_LOAN_BOOK']) await setSpf(code, prior[code]);
    await q("DELETE s FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE g.code IN ('T7_STAFF', 'T7_HO')");
    await q('UPDATE user SET isActive = 0 WHERE cus_id LIKE ?', ['t7\\_%']);
    assert.deepStrictEqual((await q("SELECT DISTINCT g.code c FROM sec_group_grant s JOIN userGroup g ON g.id = s.userGroupId WHERE s.functionCode = 'LN_ALL_BRANCHES' ORDER BY 1")).map(r => r.c), ['LOAN_ACCOUNTANT', 'LOAN_HO_CHECKER', 'SUPER_ADMIN']);
  });
};
