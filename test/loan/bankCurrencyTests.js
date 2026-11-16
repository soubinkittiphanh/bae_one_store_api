/**
 * Repayment currency rule (customer policy 2026-11-15; src/loan/services/branchBank.js assertBankCurrency):
 * every kind that moves money refuses, with 400 and nothing written, a bank/cash account whose currency is empty
 * or differs from the loan's; the list offered to the screens holds only accounts in the loan's currency.
 * Two accounts of its own (never the fixtures): T10 NOCCY with an empty currency (the ENUM error value '',
 * written with a non-strict sql_mode for that one statement) and T10 USD; both mapped to branch A.
 */
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

// Kinds whose journal moves cash through CASH_BANK (REVERSAL reverses the original movement on its own account)
const MONEY_KINDS = ['FEE_COLLECT', 'REPAYMENT', 'PREPAY', 'RECOVERY', 'DISB', 'FEE_REFUND', 'INS_REMIT', 'ADV_REFUND', 'VEH_DISPOSE'];

module.exports = async ({ test, call, q, users, L, expectStatus, branch: BRANCH_A }) => {
  const { SUPER, SUPER2, ADMIN } = users;
  const num = async (sql, params) => Number((await q(sql, params))[0].n);
  const one = async (sql, params) => (await q(sql, params))[0];
  const tx = (user, accountId, body) => call(user, 'post', `${L}/accounts/${accountId}/transactions`, body, { 'Idempotency-Key': `t10-${uuidv4()}` });
  const preview = (user, accountId, body) => call(user, 'post', `${L}/accounts/${accountId}/preview/${body.kind}`, body);
  const bodyFor = (kind, bankAccountId) => ({ kind, bankAccountId, amount: '1000', remarks: 'T10 bank currency', saleProceeds: '1000' });
  const footprint = async () => JSON.stringify({
    txn: await num('SELECT COUNT(*) n FROM ln_transaction'), legs: await num('SELECT COUNT(*) n FROM ln_journal_posting'),
    gl: await num('SELECT COUNT(*) n FROM general_ledger'), bankTx: await num('SELECT COUNT(*) n FROM transactionEntry'),
    idem: await num('SELECT COUNT(*) n FROM ln_idempotency'), audit: await num('SELECT COUNT(*) n FROM ln_audit_log'),
    balances: await q('SELECT id, CAST(balance AS CHAR) b FROM bankAccount ORDER BY id'),
    accounts: await q('SELECT id, status, accountStage, CAST(advanceBalance AS CHAR) adv FROM ln_account ORDER BY id')
  });
  let prior;
  let LAK;
  let USD;
  const bank = {};
  const maps = [];

  const mapBank = async (bankAccountId) => {
    const made = await call(SUPER, 'post', `${L}/params/branch-bank-account`, { locationId: BRANCH_A, bankAccountId, purpose: 'CASH' });
    expectStatus(made, 201, `map bank ${bankAccountId}`);
    expectStatus(await call(SUPER2, 'post', `${L}/params/branch-bank-account/${made.data.data.id}/authorize`), 200, 'authorize the mapping');
    maps.push(made.data.data.id);
  };

  await test('setup (bank currency): T10 NOCCY (empty currency) and T10 USD mapped to branch A; a LAK and a USD account at branch A; no fixture bank account has an empty currency', async () => {
    prior = (await one("SELECT value v FROM SPF WHERE code = 'LOAN_POSTING_ENABLED'")).v;
    await q("UPDATE SPF SET value = 'true' WHERE code = 'LOAN_POSTING_ENABLED'");
    assert.strictEqual(await num("SELECT COUNT(*) n FROM bankAccount WHERE currency IS NULL OR currency = ''"), 0, 'the fixtures all have a currency');
    // '' is the ENUM error value: only a non-strict sql_mode stores it (as an old or careless POS insert could)
    await q("SET STATEMENT sql_mode = '' FOR INSERT INTO bankAccount (accountNumber, accountName, accountType, currency, isActive, createdAt, updateTimestamp, balance) VALUES ('T10-NOCCY', 'T10 NOCCY', 'Current', 'XXX', 1, NOW(), NOW(), 0)");
    await q("INSERT INTO bankAccount (accountNumber, accountName, accountType, currency, isActive, createdAt, updateTimestamp, balance) VALUES ('T10-USD', 'T10 USD', 'Current', 'USD', 1, NOW(), NOW(), 0)");
    for (const [k, no] of [['none', 'T10-NOCCY'], ['usd', 'T10-USD']]) bank[k] = Number((await one('SELECT id FROM bankAccount WHERE accountNumber = ?', [no])).id);
    assert.strictEqual((await one('SELECT currency c FROM bankAccount WHERE id = ?', [bank.none])).c, '', 'stored with an empty currency');
    await mapBank(bank.none);
    await mapBank(bank.usd);
    const pick = async ccy => (await one(`SELECT a.id FROM ln_account a JOIN currency c ON c.id = a.currencyId WHERE c.code = ? AND a.branchId = ? AND a.accountStage = 'DISBURSED' AND a.status NOT IN ('WRITTEN_OFF', 'REPOSSESSED', 'CLOSED')
      AND NOT EXISTS (SELECT 1 FROM ln_transaction t WHERE t.loanAccountId = a.id AND t.postingStatus = 'PENDING_AUTH') ORDER BY a.id LIMIT 1`, [ccy, BRANCH_A]));
    LAK = Number((await pick('LAK')).id);
    USD = Number((await pick('USD')).id);
    // The fixture the posting tests post with (it has a chart account of the same number; not every mapped one does)
    const lakBank = await one("SELECT b.id FROM bankAccount b JOIN ln_branch_bank_account m ON m.bankAccountId = b.id WHERE b.accountNumber = '1105' AND m.locationId = ? AND m.authStatus = 'AUTHORIZED' AND m.isActive = 1 AND b.isActive = 1 AND b.currency = 'LAK'", [BRANCH_A]);
    assert.ok(lakBank, 'fixture bank 1105 (LAK) is mapped to branch A');
    bank.lak = Number(lakBank.id);
    console.log(`        T10 banks ${JSON.stringify(bank)}; LAK account ${LAK}, USD account ${USD}`);
  });

  await test(`empty currency: each of the ${MONEY_KINDS.length} money kinds (${MONEY_KINDS.join(', ')}) refuses an account with no currency with 400, on submit and on preview, and writes nothing`, async () => {
    const before = await footprint();
    for (const kind of MONEY_KINDS) {
      const r = await tx(ADMIN, LAK, bodyFor(kind, bank.none));
      expectStatus(r, 400, `${kind} submit`);
      assert.match(r.data.message, /Bank account T10 NOCCY has no currency; the loan is LAK and payments must be in the loan's currency/, kind);
      assert.match(r.data.message, /nothing was posted/);
      const p = await preview(ADMIN, LAK, bodyFor(kind, bank.none));
      expectStatus(p, 400, `${kind} preview`);
      assert.match(p.data.message, /has no currency/, `${kind} preview`);
    }
    assert.strictEqual(await footprint(), before, 'nothing written: transactions, legs, GL, bank entries, idempotency, audit, balances, accounts');
  });

  await test(`wrong currency: each money kind refuses a USD account on a LAK loan and a LAK account on a USD loan with 400, and writes nothing`, async () => {
    const before = await footprint();
    for (const kind of MONEY_KINDS) {
      const usdOnLak = await tx(ADMIN, LAK, bodyFor(kind, bank.usd));
      expectStatus(usdOnLak, 400, `${kind} USD account on a LAK loan`);
      assert.match(usdOnLak.data.message, /Bank account T10 USD is USD; the loan is LAK and payments must be in the loan's currency; nothing was posted/, kind);
      const lakOnUsd = await tx(ADMIN, USD, bodyFor(kind, bank.lak));
      expectStatus(lakOnUsd, 400, `${kind} LAK account on a USD loan`);
      assert.match(lakOnUsd.data.message, /is LAK; the loan is USD/, kind);
    }
    assert.strictEqual(await footprint(), before, 'nothing written');
  });

  await test('the screens\' list (GET /accounts/:id/bank-accounts) holds only accounts in the loan\'s currency: never the empty one, the USD one only for the USD loan', async () => {
    const list = async id => (await call(ADMIN, 'get', `${L}/accounts/${id}/bank-accounts`)).data.data;
    const lak = await list(LAK);
    assert.ok(lak.length > 0, 'the LAK fixtures are listed');
    assert.ok(lak.every(b => b.currency === 'LAK'), JSON.stringify(lak.map(b => [b.id, b.currency])));
    assert.ok(!lak.some(b => b.id === bank.none || b.id === bank.usd));
    const usd = await list(USD);
    assert.ok(usd.some(b => b.id === bank.usd), 'T10 USD for the USD loan');
    assert.ok(usd.every(b => b.currency === 'USD'));
    assert.ok(!usd.some(b => b.id === bank.none));
  });

  await test('the fixture bank accounts keep working: a REPAYMENT preview with a mapped LAK fixture account on the LAK loan is 200, and with T10 USD on the USD loan passes the currency check', async () => {
    const ok = await preview(ADMIN, LAK, { kind: 'REPAYMENT', amount: '1000', bankAccountId: bank.lak });
    expectStatus(ok, 200, 'LAK fixture account');
    const usd = await preview(ADMIN, USD, { kind: 'REPAYMENT', amount: '10', bankAccountId: bank.usd });
    assert.ok(!/currency/.test(String(usd.data.message || '')), `no currency refusal: ${usd.status} ${usd.data.message || ''}`);
  });

  await test('cleanup (bank currency): T10 mappings inactive, T10 accounts inactive, posting switch back', async () => {
    await q('UPDATE ln_branch_bank_account SET isActive = 0 WHERE id IN (?)', [maps]);
    await q('UPDATE bankAccount SET isActive = 0 WHERE id IN (?)', [[bank.none, bank.usd]]);
    await q("UPDATE SPF SET value = ? WHERE code = 'LOAN_POSTING_ENABLED'", [prior]);
    assert.strictEqual(await num("SELECT COUNT(*) n FROM ln_branch_bank_account m JOIN bankAccount b ON b.id = m.bankAccountId WHERE m.authStatus = 'AUTHORIZED' AND m.isActive = 1 AND (b.currency IS NULL OR b.currency = '')"), 0, 'no active mapping to an empty-currency account left');
  });
};
