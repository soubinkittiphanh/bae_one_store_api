// ===============================================================
// SIMULATION SCRIPT: MONEY SETTLEMENT DUPLICATE CHECK & OVERRIDE LOG
// ===============================================================
process.env.NO_SYNC = 'true'; // Prevent redundant full schema sync
const db = require('../src/models');
const SettlementController = require('../src/PWT/moneySettlement/controller/SettlementController');

async function runSimulation() {
  console.log('\n======================================================');
  console.log('🚀 STARTING MONEY SETTLEMENT DUPLICATE VALIDATION SIMULATION');
  console.log('======================================================\n');

  let testSettlementA = null;
  let testSettlementB = null;
  let testOverrideLog = null;

  try {
    // -----------------------------------------------------------
    // TEST 1: Date Range Logic Verification
    // -----------------------------------------------------------
    console.log('📋 [TEST 1] Verifying Current & Last Month Date Range Calculation...');
    const rangeOct = SettlementController.getCurrentAndLastMonthRange('2026-10-08');
    console.log(`  Reference Date: 2026-10-08 -> Start: ${rangeOct.startDate}, End: ${rangeOct.endDate}`);
    if (rangeOct.startDate === '2026-09-01' && rangeOct.endDate === '2026-10-31') {
      console.log('  ✅ TEST 1.1 PASSED: October range is correctly 2026-09-01 to 2026-10-31');
    } else {
      throw new Error(`TEST 1.1 FAILED: Expected 2026-09-01 to 2026-10-31, got ${rangeOct.startDate} to ${rangeOct.endDate}`);
    }

    const rangeJan = SettlementController.getCurrentAndLastMonthRange('2026-01-15');
    console.log(`  Reference Date (Year boundary): 2026-01-15 -> Start: ${rangeJan.startDate}, End: ${rangeJan.endDate}`);
    if (rangeJan.startDate === '2025-12-01' && rangeJan.endDate === '2026-01-31') {
      console.log('  ✅ TEST 1.2 PASSED: January year-boundary range is correctly 2025-12-01 to 2026-01-31');
    } else {
      throw new Error(`TEST 1.2 FAILED: Expected 2025-12-01 to 2026-01-31, got ${rangeJan.startDate} to ${rangeJan.endDate}`);
    }

    // -----------------------------------------------------------
    // TEST 2: Prepare Fixtures (Currency, Ministry, User)
    // -----------------------------------------------------------
    console.log('\n📋 [TEST 2] Preparing Test Fixtures...');
    let currency = await db.currency.findOne();
    if (!currency) {
      currency = await db.currency.create({ code: 'LAK', rate: 1, name: 'Lao Kip' });
    }
    console.log(`  Using Currency: ID=${currency.id}, Code=${currency.code}`);

    let ministry = await db.ministry.findOne();
    if (!ministry) {
      ministry = await db.ministry.create({ ministryCode: 'SETTLE-MIN', ministryName: 'Settlement Test Ministry' });
    }
    console.log(`  Using Ministry: ID=${ministry.id}, Name=${ministry.ministryName}`);

    let user = await db.user.findOne();
    const userId = user ? user.id : 1;
    console.log(`  Using User ID: ${userId}`);

    const uniqueAmount = 888321.65;
    const today = new Date().toISOString().split('T')[0];

    // Pre-cleanup in case of previous aborted runs
    await db.moneySettlement.destroy({ where: { amount: uniqueAmount } });
    if (db.moneySettlementOverrideLog) {
      await db.moneySettlementOverrideLog.destroy({ where: { amount: uniqueAmount } });
    }

    // Create Initial Money Settlement (Transaction A)
    console.log('\n📋 [TEST 3] Creating Initial Base Settlement (Transaction A)...');
    testSettlementA = await db.moneySettlement.create({
      bookingDate: today,
      method: 'cash',
      amount: uniqueAmount,
      currencyId: currency.id,
      ministryId: ministry.id,
      userId: userId,
      notes: 'Simulation Base Settlement Record',
      isActive: true
    });
    console.log(`  ✅ Transaction A created: ID #${testSettlementA.id}, Amount=${testSettlementA.amount}, Date=${testSettlementA.bookingDate}`);

    // -----------------------------------------------------------
    // TEST 4: Duplicate Query Scenarios
    // -----------------------------------------------------------
    console.log('\n📋 [TEST 4] Testing Duplicate Query Controller Logic...');

    // Scenario 4.1: Same amount, same currency, same ministry (within current month)
    console.log('  Scenario 4.1: Querying with matching Amount, Currency, and Ministry...');
    const reqDuplicate = {
      query: {
        amount: uniqueAmount,
        currencyId: currency.id,
        ministryId: ministry.id,
        bookingDate: today
      }
    };
    let resDuplicateData = null;
    const resDuplicate = {
      json: (data) => { resDuplicateData = data; return data; },
      status: (code) => ({ json: (data) => { resDuplicateData = { ...data, statusCode: code }; return data; } })
    };
    await SettlementController.checkDuplicate(reqDuplicate, resDuplicate);

    if (resDuplicateData && resDuplicateData.isDuplicate === true && resDuplicateData.count >= 1) {
      console.log(`  ✅ SCENARIO 4.1 PASSED: Correctly detected duplicate! Matches found: ${resDuplicateData.count}`);
      console.log(`     Matched Settlement: #${resDuplicateData.duplicates[0].id} (Amount: ${resDuplicateData.duplicates[0].amount} ${resDuplicateData.duplicates[0].currencyCode})`);
    } else {
      throw new Error(`SCENARIO 4.1 FAILED: Expected duplicate detected, got ${JSON.stringify(resDuplicateData)}`);
    }

    // Scenario 4.2: Different Amount -> Should NOT be a duplicate
    console.log('  Scenario 4.2: Querying with Different Amount...');
    const reqDiffAmount = {
      query: {
        amount: 999999.99,
        currencyId: currency.id,
        ministryId: ministry.id,
        bookingDate: today
      }
    };
    let resDiffAmountData = null;
    const resDiffAmount = {
      json: (data) => { resDiffAmountData = data; return data; },
      status: (code) => ({ json: (data) => { resDiffAmountData = { ...data, statusCode: code }; return data; } })
    };
    await SettlementController.checkDuplicate(reqDiffAmount, resDiffAmount);

    if (resDiffAmountData && resDiffAmountData.isDuplicate === false && resDiffAmountData.count === 0) {
      console.log('  ✅ SCENARIO 4.2 PASSED: Different amount correctly returns isDuplicate = false');
    } else {
      throw new Error(`SCENARIO 4.2 FAILED: Expected false, got ${JSON.stringify(resDiffAmountData)}`);
    }

    // Scenario 4.3: Edit Mode (excludeId = testSettlementA.id) -> Should NOT flag itself
    console.log('  Scenario 4.3: Querying with excludeId (Edit Mode)...');
    const reqEditMode = {
      query: {
        amount: uniqueAmount,
        currencyId: currency.id,
        ministryId: ministry.id,
        bookingDate: today,
        excludeId: testSettlementA.id
      }
    };
    let resEditData = null;
    const resEdit = {
      json: (data) => { resEditData = data; return data; },
      status: (code) => ({ json: (data) => { resEditData = { ...data, statusCode: code }; return data; } })
    };
    await SettlementController.checkDuplicate(reqEditMode, resEdit);

    if (resEditData && resEditData.isDuplicate === false) {
      console.log('  ✅ SCENARIO 4.3 PASSED: Edit mode correctly excludes the active record itself');
    } else {
      throw new Error(`SCENARIO 4.3 FAILED: Expected false, got ${JSON.stringify(resEditData)}`);
    }

    // -----------------------------------------------------------
    // TEST 5: Creating Duplicate Settlement with User Override Log
    // -----------------------------------------------------------
    console.log('\n📋 [TEST 5] Creating Duplicate Settlement with Override Confirmation Flag...');
    const reqCreateOverride = {
      body: {
        bookingDate: today,
        method: 'cash',
        amount: uniqueAmount,
        currencyId: currency.id,
        ministryId: ministry.id,
        userId: userId,
        notes: 'Duplicate Settlement Created with User Override Confirmation',
        isDuplicateOverride: true,
        matchedSettlementIds: [testSettlementA.id],
        overrideReason: 'Simulation test intentional duplicate override',
        overrideMessage: `User confirmed duplicate creation matching existing settlement #${testSettlementA.id}`
      },
      user: { id: userId },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Simulation-Test-Runner/1.0' }
    };

    let resCreateData = null;
    const resCreate = {
      status: (code) => ({
        json: (data) => { resCreateData = { ...data, statusCode: code }; return data; }
      }),
      json: (data) => { resCreateData = data; return data; }
    };

    await SettlementController.create(reqCreateOverride, resCreate);

    if (resCreateData && resCreateData.success && resCreateData.data) {
      testSettlementB = resCreateData.data;
      console.log(`  ✅ Transaction B created successfully: ID #${testSettlementB.id}`);
    } else {
      throw new Error(`TEST 5 FAILED: Failed to create settlement B: ${JSON.stringify(resCreateData)}`);
    }

    // Verify Override Log in Database
    console.log('\n📋 [TEST 6] Verifying MoneySettlementOverrideLog Table Entry...');
    const MoneySettlementOverrideLog = db.moneySettlementOverrideLog;
    if (!MoneySettlementOverrideLog) {
      throw new Error('TEST 6 FAILED: moneySettlementOverrideLog model is not registered on db object');
    }

    const createdLogs = await MoneySettlementOverrideLog.findAll({
      where: { settlementId: testSettlementB.id }
    });

    if (createdLogs.length > 0) {
      testOverrideLog = createdLogs[0];
      console.log(`  ✅ TEST 6 PASSED: Override log record found! ID #${testOverrideLog.id}`);
      console.log(`     Settlement ID: ${testOverrideLog.settlementId}`);
      console.log(`     Matched IDs: ${JSON.stringify(testOverrideLog.matchedSettlementIds)}`);
      console.log(`     Amount: ${testOverrideLog.amount}`);
      console.log(`     Reason: ${testOverrideLog.overrideReason}`);
      console.log(`     Message: ${testOverrideLog.overrideMessage}`);
      console.log(`     IP: ${testOverrideLog.ipAddress}`);
      console.log(`     User-Agent: ${testOverrideLog.userAgent}`);
    } else {
      throw new Error(`TEST 6 FAILED: No override log found for settlementId ${testSettlementB.id}`);
    }

    // -----------------------------------------------------------
    // TEST 7: Querying Override Logs through Controller
    // -----------------------------------------------------------
    console.log('\n📋 [TEST 7] Testing Override Logs Controller Endpoints...');
    let resLogsData = null;
    const resLogs = {
      json: (data) => { resLogsData = data; return data; },
      status: (code) => ({ json: (data) => { resLogsData = { ...data, statusCode: code }; return data; } })
    };

    await SettlementController.getOverrideLogsBySettlementId(
      { params: { id: testSettlementB.id } },
      resLogs
    );

    if (resLogsData && resLogsData.success && resLogsData.data && resLogsData.data.length > 0) {
      console.log(`  ✅ TEST 7 PASSED: getOverrideLogsBySettlementId returned ${resLogsData.data.length} logs for Settlement #${testSettlementB.id}`);
    } else {
      throw new Error(`TEST 7 FAILED: getOverrideLogsBySettlementId returned invalid data: ${JSON.stringify(resLogsData)}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL SETTLEMENT DUPLICATE VALIDATION TESTS PASSED (7/7)');
    console.log('======================================================\n');

  } catch (error) {
    console.error('\n❌ SIMULATION FAILED:', error);
    process.exitCode = 1;
  } finally {
    // Cleanup fixtures
    console.log('🧹 Cleaning up test fixtures...');
    try {
      if (testOverrideLog) {
        await db.moneySettlementOverrideLog.destroy({ where: { id: testOverrideLog.id } });
      }
      if (testSettlementA) {
        await db.moneySettlement.destroy({ where: { id: testSettlementA.id } });
      }
      if (testSettlementB) {
        await db.moneySettlement.destroy({ where: { id: testSettlementB.id } });
      }
      console.log('  ✅ Cleanup complete.');
    } catch (cleanupErr) {
      console.warn('  ⚠️ Cleanup warning:', cleanupErr.message);
    }
    process.exit(process.exitCode || 0);
  }
}

runSimulation();
