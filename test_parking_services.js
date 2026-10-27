const assert = require('assert');
const feeService = require('./src/parking/feeService');
const slotService = require('./src/parking/slotService');
const db = require('./src/models');

async function runParkingUnitTests() {
  console.log("=================================================================");
  console.log("🧪 RUNNING CAR PARKING UNIT & INTEGRATION TESTS");
  console.log("=================================================================\n");

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(` ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(` ❌ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(` ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(` ❌ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // Sample Car Pricing Rule
  const carPricing = {
    vehicleType: 'car',
    gracePeriodMinutes: 15,
    dayStartTime: '06:00',
    dayEndTime: '18:00',
    dayHourlyRate: 5000,
    nightHourlyRate: 10000,
    nightPricingType: 'HOURLY',
    dailyCap: 50000,
    lostTicketFee: 100000
  };

  // Sample Motorbike Pricing Rule
  const motoPricing = {
    vehicleType: 'motorbike',
    gracePeriodMinutes: 15,
    dayStartTime: '06:00',
    dayEndTime: '18:00',
    dayHourlyRate: 2000,
    nightHourlyRate: 5000,
    nightPricingType: 'HOURLY',
    dailyCap: 20000,
    lostTicketFee: 50000
  };

  // -------------------------------------------------------------------------
  // 1. PLATE NORMALIZATION TESTS
  // -------------------------------------------------------------------------
  console.log("--- 1. Plate Normalization Tests ---");

  test("Trims and converts lowercase English plate to uppercase", () => {
    const res = slotService.normalizePlateNumber("  abc 1234  ");
    assert.strictEqual(res, "ABC 1234");
  });

  test("Collapses redundant consecutive spaces into a single space", () => {
    const res = slotService.normalizePlateNumber("ກກ    9999");
    assert.strictEqual(res, "ກກ 9999");
  });

  test("Handles empty or null plate values gracefully", () => {
    assert.strictEqual(slotService.normalizePlateNumber(null), "");
    assert.strictEqual(slotService.normalizePlateNumber(""), "");
  });

  // -------------------------------------------------------------------------
  // 2. FEE CALCULATION: GRACE PERIOD
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Fee Calculation: Grace Period Tests ---");

  test("10 minutes stay is within 15-minute grace period -> 0 LAK fee", () => {
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T08:10:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing
    });

    assert.strictEqual(res.durationMinutes, 10);
    assert.strictEqual(res.isGracePeriod, true);
    assert.strictEqual(res.totalFee, 0);
  });

  test("Exactly 15 minutes stay is within grace period -> 0 LAK fee", () => {
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T08:15:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing
    });

    assert.strictEqual(res.durationMinutes, 15);
    assert.strictEqual(res.isGracePeriod, true);
    assert.strictEqual(res.totalFee, 0);
  });

  test("16 minutes stay exceeds grace period -> charges 1 full hour", () => {
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T08:16:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing
    });

    assert.strictEqual(res.durationMinutes, 16);
    assert.strictEqual(res.isGracePeriod, false);
    assert.strictEqual(res.totalHours, 1);
    assert.strictEqual(res.totalFee, 5000);
  });

  // -------------------------------------------------------------------------
  // 3. FEE CALCULATION: ROUNDING UP PER HOUR
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Fee Calculation: Rounding Up Tests ---");

  test("1 hour and 5 minutes rounds UP to 2 hours", () => {
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T09:05:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing
    });

    assert.strictEqual(res.durationMinutes, 65);
    assert.strictEqual(res.totalHours, 2);
    assert.strictEqual(res.totalFee, 10000); // 2 * 5000
  });

  test("2 hours and 59 minutes rounds UP to 3 hours", () => {
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T10:59:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: motoPricing
    });

    assert.strictEqual(res.totalHours, 3);
    assert.strictEqual(res.totalFee, 6000); // 3 * 2000
  });

  // -------------------------------------------------------------------------
  // 4. DAY TIME VS. NIGHT TIME PERIODS
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Day Time vs. Night Time Rates ---");

  test("Car parked 3 hours at night (20:00 to 23:00) incurs night hourly rate", () => {
    // 20:00 Vientiane time is 13:00 UTC
    const entry = new Date("2026-10-25T13:00:00Z");
    const exit = new Date("2026-10-25T16:00:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing
    });

    assert.strictEqual(res.totalHours, 3);
    assert.strictEqual(res.nightHours, 3);
    assert.strictEqual(res.dayHours, 0);
    assert.strictEqual(res.totalFee, 30000); // 3 * 10000
  });

  test("Car parked across day and night boundary (16:00 to 20:00: 2 day + 2 night)", () => {
    // 16:00 Vientiane is 09:00 UTC. 20:00 Vientiane is 13:00 UTC.
    const entry = new Date("2026-10-25T09:00:00Z");
    const exit = new Date("2026-10-25T13:00:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing
    });

    assert.strictEqual(res.totalHours, 4);
    assert.strictEqual(res.dayHours, 2);
    assert.strictEqual(res.nightHours, 2);
    assert.strictEqual(res.baseDayFee, 10000);  // 2 * 5000
    assert.strictEqual(res.baseNightFee, 20000); // 2 * 10000
    assert.strictEqual(res.totalFee, 30000);
  });

  // -------------------------------------------------------------------------
  // 5. DAILY CAP & MULTI-DAY PARKING
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Daily Cap Tests ---");

  test("Car parked 14 day hours without cap would be 70,000 -> capped at 50,000", () => {
    // 14 hours
    const entry = new Date("2026-10-25T00:00:00Z");
    const exit = new Date("2026-10-25T14:00:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing
    });

    assert.strictEqual(res.dailyCapApplied, true);
    assert.strictEqual(res.totalFee, 50000);
  });

  test("Motorbike 12 hours capped at 20,000 LAK", () => {
    const entry = new Date("2026-10-25T00:00:00Z");
    const exit = new Date("2026-10-25T12:00:00Z");
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: motoPricing
    });

    assert.strictEqual(res.dailyCapApplied, true);
    assert.strictEqual(res.totalFee, 20000);
  });

  // -------------------------------------------------------------------------
  // 6. MONTHLY PASS EXEMPTION
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Monthly Pass Tests ---");

  test("Active monthly pass holder incurs 0 LAK parking fee", () => {
    const pass = {
      status: 'active',
      startDate: '2026-10-01',
      endDate: '2026-10-31'
    };
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T18:00:00Z"); // 10 hours
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing,
      monthlyPass: pass
    });

    assert.strictEqual(res.isMonthlyPass, true);
    assert.strictEqual(res.totalFee, 0);
  });

  test("Expired monthly pass falls back to regular hourly rates", () => {
    const expiredPass = {
      status: 'active',
      startDate: '2026-08-01',
      endDate: '2026-08-31' // Already expired in October
    };
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T10:00:00Z"); // 2 hours
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing,
      monthlyPass: expiredPass
    });

    assert.strictEqual(res.isMonthlyPass, false);
    assert.strictEqual(res.totalFee, 10000);
  });

  // -------------------------------------------------------------------------
  // 7. LOST TICKET FEE
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Lost Ticket Penalty Tests ---");

  test("Lost ticket adds lost ticket fee penalty", () => {
    const entry = new Date("2026-10-25T08:00:00Z");
    const exit = new Date("2026-10-25T10:00:00Z"); // 2 hrs = 10000
    const res = feeService.calculateParkingFee({
      entryTime: entry,
      exitTime: exit,
      pricingRule: carPricing,
      isLostTicket: true
    });

    assert.strictEqual(res.isLostTicket, true);
    assert.strictEqual(res.penaltyFee, 100000);
    assert.strictEqual(res.totalFee, 110000); // 10000 + 100000
  });

  // -------------------------------------------------------------------------
  // 8. ERROR HANDLING & EDGE CASES
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Edge Cases & Validation Tests ---");

  test("Throws error when exit time is earlier than entry time", () => {
    const entry = new Date("2026-10-25T10:00:00Z");
    const exit = new Date("2026-10-25T08:00:00Z");

    assert.throws(() => {
      feeService.calculateParkingFee({
        entryTime: entry,
        exitTime: exit,
        pricingRule: carPricing
      });
    }, /Exit time cannot be earlier than entry time/);
  });

  // -------------------------------------------------------------------------
  // 9. DATABASE INTEGRATION & CONCURRENCY
  // -------------------------------------------------------------------------
  console.log("\n--- 9. Database Integration & Concurrency Tests ---");

  await testAsync("Slot assignment locks and updates slot status", async () => {
    const parkingService = require('./src/parking/service');
    
    // Test vehicle entry
    const entryResult = await parkingService.processEntry({
      plateNumber: 'VT 8888',
      vehicleType: 'car',
      driverName: 'Mr. Test Driver',
      driverPhone: '02012345678',
      notes: 'Test Entry Ticket'
    });

    assert.ok(entryResult.id, "Ticket ID should be present");
    assert.strictEqual(entryResult.plateNumber, "VT 8888");
    assert.strictEqual(entryResult.status, "active");
    assert.ok(entryResult.slot, "Slot should be linked");
    assert.strictEqual(entryResult.slot.status, "occupied");

    // Attempting duplicate entry for already parked vehicle must fail
    let duplicateFailed = false;
    try {
      await parkingService.processEntry({
        plateNumber: 'VT 8888',
        vehicleType: 'car'
      });
    } catch (err) {
      duplicateFailed = true;
      assert.ok(err.message.includes('already parked inside'), "Error should mention already parked");
    }
    assert.strictEqual(duplicateFailed, true, "Duplicate entry should have thrown an error");

    // Checkout payment
    const checkoutResult = await parkingService.processPaymentAndExit({
      ticketId: entryResult.id,
      paymentMethod: 'CASH',
      amount: 5000,
      notes: 'Test checkout'
    });

    assert.strictEqual(checkoutResult.ticket.status, "completed");
    assert.strictEqual(checkoutResult.payment.amount, 5000);

    // Slot must be free again
    const freedSlot = await db.parkingSlot.findByPk(entryResult.slotId);
    assert.strictEqual(freedSlot.status, "available", "Slot should be available after checkout");
    assert.strictEqual(freedSlot.currentTicketId, null);
  });

  // Summary
  console.log("\n=================================================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runParkingUnitTests();
