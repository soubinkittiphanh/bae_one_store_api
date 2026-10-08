// ===============================================================
// SIMULATION SCRIPT: MONEY ADVANCE DUPLICATE CHECK & OVERRIDE LOG
// ===============================================================
process.env.NO_SYNC = 'true'; // Prevent redundant full schema sync
const db = require('../src/models');
const MoneyAdvanceController = require('../src/PWT/moneyAdvance/controller');

async function runSimulation() {
  console.log('\n======================================================');
  console.log('🚀 STARTING MONEY ADVANCE DUPLICATE VALIDATION SIMULATION');
  console.log('======================================================\n');

  let testAdvanceA = null;
  let testAdvanceB = null;
  let testOverrideLog = null;

  try {
    // -----------------------------------------------------------
    // TEST 1: Date Range Logic Verification
    // -----------------------------------------------------------
    console.log('📋 [TEST 1] Verifying Current & Last Month Date Range Calculation...');
    const rangeOct = MoneyAdvanceController.getCurrentAndLastMonthRange('2026-10-08');
    console.log(`  Reference Date: 2026-10-08 -> Start: ${rangeOct.startDate}, End: ${rangeOct.endDate}`);
    if (rangeOct.startDate === '2026-09-01' && rangeOct.endDate === '2026-10-31') {
      console.log('  ✅ TEST 1.1 PASSED: October range is correctly 2026-09-01 to 2026-10-31');
    } else {
      throw new Error(`TEST 1.1 FAILED: Expected 2026-09-01 to 2026-10-31, got ${rangeOct.startDate} to ${rangeOct.endDate}`);
    }

    const rangeJan = MoneyAdvanceController.getCurrentAndLastMonthRange('2026-01-15');
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
      ministry = await db.ministry.create({ ministryCode: 'TEST-MIN', ministryName: 'Test Ministry' });
    }
    console.log(`  Using Ministry: ID=${ministry.id}, Name=${ministry.ministryName}`);

    let user = await db.user.findOne();
    const userId = user ? user.id : 1;
    console.log(`  Using User ID: ${userId}`);

    const uniqueAmount = 777123.45;
    const today = new Date().toISOString().split('T')[0];

    // Pre-cleanup in case of previous aborted runs
    await db.moneyAdvance.destroy({ where: { amount: uniqueAmount } });
    await db.moneyAdvanceOverrideLog.destroy({ where: { amount: uniqueAmount } });

    // Create Initial Money Advance (Transaction A)
    console.log('\n📋 [TEST 3] Creating Initial Base Money Advance (Transaction A)...');
    testAdvanceA = await db.moneyAdvance.create({
      bookingDate: today,
      method: 'cash',
      amount: uniqueAmount,
      currencyId: currency.id,
      ministryId: ministry.id,
      makerId: userId,
      purpose: 'Simulation Original Payment Voucher',
      status: 'approved'
    });
    console.log(`  ✅ Transaction A created: ID #${testAdvanceA.id}, Amount=${testAdvanceA.amount}, Date=${testAdvanceA.bookingDate}`);

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
    await MoneyAdvanceController.checkDuplicate(reqDuplicate, resDuplicate);

    if (resDuplicateData && resDuplicateData.isDuplicate === true && resDuplicateData.count >= 1) {
      console.log(`  ✅ SCENARIO 4.1 PASSED: Correctly detected duplicate! Matches found: ${resDuplicateData.count}`);
      console.log(`     Matched Voucher: #${resDuplicateData.duplicates[0].id} (Amount: ${resDuplicateData.duplicates[0].amount} ${resDuplicateData.duplicates[0].currencyCode})`);
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
    await MoneyAdvanceController.checkDuplicate(reqDiffAmount, resDiffAmount);

    if (resDiffAmountData && resDiffAmountData.isDuplicate === false && resDiffAmountData.count === 0) {
      console.log('  ✅ SCENARIO 4.2 PASSED: Different amount correctly returns isDuplicate = false');
    } else {
      throw new Error(`SCENARIO 4.2 FAILED: Expected false, got ${JSON.stringify(resDiffAmountData)}`);
    }

    // Scenario 4.3: Edit Mode (excludeId = testAdvanceA.id) -> Should NOT flag itself
    console.log('  Scenario 4.3: Querying with excludeId (Edit Mode)...');
    const reqEditMode = {
      query: {
        amount: uniqueAmount,
        currencyId: currency.id,
        ministryId: ministry.id,
        bookingDate: today,
        excludeId: testAdvanceA.id
      }
    };
    let resEditData = null;
    const resEdit = {
      json: (data) => { resEditData = data; return data; },
      status: (code) => ({ json: (data) => { resEditData = { ...data, statusCode: code }; return data; } })
    };
    await MoneyAdvanceController.checkDuplicate(reqEditMode, resEdit);

    if (resEditData && resEditData.isDuplicate === false) {
      console.log('  ✅ SCENARIO 4.3 PASSED: Edit mode correctly excludes the active record itself');
    } else {
      throw new Error(`SCENARIO 4.3 FAILED: Expected false, got ${JSON.stringify(resEditData)}`);
    }

    // -----------------------------------------------------------
    // TEST 5: Duplicate Override & Log Creation
    // -----------------------------------------------------------
    console.log('\n📋 [TEST 5] Simulating User Override & MoneyAdvanceOverrideLog Generation...');
    const reqCreateWithOverride = {
      body: {
        bookingDate: today,
        method: 'cash',
        amount: uniqueAmount,
        currencyId: currency.id,
        ministryId: ministry.id,
        makerId: userId,
        purpose: 'Simulation Duplicate Payment With Confirmed Override',
        isDuplicateOverride: true,
        matchedAdvanceIds: [testAdvanceA.id],
        overrideReason: 'User confirmed duplicate advance creation after warning dialog',
        overrideMessage: `User confirmed duplicate payment matching advance #${testAdvanceA.id}`
      },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Simulation-Test-Agent/1.0' },
      get: (header) => (header.toLowerCase() === 'user-agent' ? 'Simulation-Test-Agent/1.0' : ''),
      user: { id: userId }
    };

    let resCreateData = null;
    const resCreate = {
      status: (code) => ({
        json: (data) => {
          resCreateData = { ...data, statusCode: code };
          return resCreateData;
        }
      })
    };

    await MoneyAdvanceController.create(reqCreateWithOverride, resCreate);
    if (!resCreateData || !resCreateData.success || !resCreateData.data) {
      throw new Error(`Create with override failed: ${JSON.stringify(resCreateData)}`);
    }

    testAdvanceB = resCreateData.data;
    console.log(`  ✅ Transaction B created with override flag: ID #${testAdvanceB.id}`);

    // Verify MoneyAdvanceOverrideLog table entry
    const MoneyAdvanceOverrideLog = db.moneyAdvanceOverrideLog;
    const overrideLog = await MoneyAdvanceOverrideLog.findOne({
      where: { moneyAdvanceId: testAdvanceB.id }
    });

    if (overrideLog) {
      testOverrideLog = overrideLog;
      console.log('  ✅ TEST 5 PASSED: Override log successfully created in database!');
      console.log(`     Log ID: #${overrideLog.id}`);
      console.log(`     MoneyAdvance ID: #${overrideLog.moneyAdvanceId}`);
      console.log(`     Matched Advance IDs: ${JSON.stringify(overrideLog.matchedAdvanceIds)}`);
      console.log(`     Amount: ${overrideLog.amount}`);
      console.log(`     Override Reason: "${overrideLog.overrideReason}"`);
      console.log(`     Override Message: "${overrideLog.overrideMessage}"`);
      console.log(`     IP: ${overrideLog.ipAddress}`);
    } else {
      throw new Error('TEST 5 FAILED: MoneyAdvanceOverrideLog entry was not found in database!');
    }

    // -----------------------------------------------------------
    // TEST 6: Override Log Query Endpoint
    // -----------------------------------------------------------
    console.log('\n📋 [TEST 6] Testing Override Log Query Endpoints...');
    let resLogsData = null;
    const resLogs = {
      json: (data) => { resLogsData = data; return data; },
      status: (code) => ({ json: (data) => { resLogsData = { ...data, statusCode: code }; return data; } })
    };

    await MoneyAdvanceController.getOverrideLogsByAdvanceId({ params: { id: testAdvanceB.id } }, resLogs);
    if (resLogsData && resLogsData.success && resLogsData.data.length > 0) {
      console.log(`  ✅ TEST 6 PASSED: Retrieved ${resLogsData.data.length} override log(s) for Advance #${testAdvanceB.id}`);
    } else {
      throw new Error(`TEST 6 FAILED: Failed to retrieve logs via endpoint: ${JSON.stringify(resLogsData)}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL 6 SIMULATION SUITES PASSED SUCCESSFULLY!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n❌ SIMULATION FAILED WITH ERROR:', err);
  } finally {
    // -----------------------------------------------------------
    // CLEANUP
    // -----------------------------------------------------------
    console.log('🧹 Cleaning up test records...');
    try {
      if (testOverrideLog) {
        await db.moneyAdvanceOverrideLog.destroy({ where: { id: testOverrideLog.id } });
      }
      if (testAdvanceB) {
        await db.moneyAdvance.destroy({ where: { id: testAdvanceB.id } });
      }
      if (testAdvanceA) {
        await db.moneyAdvance.destroy({ where: { id: testAdvanceA.id } });
      }
      console.log('✅ Cleanup completed.\n');
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }
    process.exit(0);
  }
}

runSimulation();
