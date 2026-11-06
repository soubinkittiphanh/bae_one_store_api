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

    // Cleanup test rows so repeated runs don't pollute the demo DB
    await db.parkingPayment.destroy({ where: { ticketId: entryResult.id } });
    await db.parkingTicket.destroy({ where: { id: entryResult.id } });
  });

  // -------------------------------------------------------------------------
  // 10. CUSTOMER-MAINTAINED VEHICLE TYPES
  // -------------------------------------------------------------------------
  console.log("\n--- 10. Vehicle Type Master Tests ---");

  const vehicleTypeService = require('./src/parking/vehicleTypeService');
  const parkingServiceVT = require('./src/parking/service');
  const TEST_CODE = 'test_van';
  const TEST_PLATE = 'TV 0001';
  const originalDefaultCode = await vehicleTypeService.getDefaultCode();
  let testSlot = null;
  let testTicketIds = [];

  async function cleanupVehicleTypeTest() {
    if (testTicketIds.length) {
      await db.parkingPayment.destroy({ where: { ticketId: testTicketIds } });
      await db.parkingTicket.destroy({ where: { id: testTicketIds } });
    }
    await db.parkingTicket.destroy({ where: { plateNumber: TEST_PLATE } });
    if (testSlot) await db.parkingSlot.destroy({ where: { id: testSlot.id } });
    await db.parkingSlot.destroy({ where: { slotNumber: 'TEST-VAN-01' } });
    await db.parkingVehicle.destroy({ where: { plateNumber: TEST_PLATE } });
    // restore original default before removing the test type
    const orig = await db.parkingVehicleType.findOne({ where: { code: originalDefaultCode } });
    if (orig && !orig.isDefault) {
      await db.parkingVehicleType.update({ isDefault: false }, { where: {} });
      await orig.update({ isDefault: true });
    }
    await db.parkingVehicleType.destroy({ where: { code: TEST_CODE } });
  }

  await cleanupVehicleTypeTest(); // leftovers from an aborted earlier run

  await testAsync("Seeded default vehicle types exist", async () => {
    const types = await vehicleTypeService.list();
    const codes = types.map(t => t.code);
    ['car', 'motorbike', 'truck'].forEach(c => assert.ok(codes.includes(c), `Missing seeded type ${c}`));
    const defaults = types.filter(t => t.isDefault);
    assert.strictEqual(defaults.length, 1, "Exactly one default type expected");
  });

  await testAsync("Create custom vehicle type (code normalized to lowercase)", async () => {
    const created = await vehicleTypeService.create({ code: ' TEST_VAN ', nameLa: 'ລົດຕູ້ທົດສອບ', nameEn: 'Test Van', icon: 'mdi-van-utility', sortOrder: 50 }, 1);
    assert.strictEqual(created.code, TEST_CODE);
    assert.strictEqual(created.isActive, true);
  });

  await testAsync("Duplicate vehicle type code is rejected", async () => {
    await assert.rejects(
      () => vehicleTypeService.create({ code: TEST_CODE, nameLa: 'ຊ້ຳ' }),
      /already exists/
    );
  });

  await testAsync("Vehicle type code cannot be changed on update", async () => {
    const t = await vehicleTypeService.findByCode(TEST_CODE);
    await assert.rejects(() => vehicleTypeService.update(t.id, { code: 'other_code' }), /cannot be changed/);
    const updated = await vehicleTypeService.update(t.id, { nameEn: 'Test Van Updated' });
    assert.strictEqual(updated.nameEn, 'Test Van Updated');
  });

  await testAsync("Entry with unknown vehicle type is rejected", async () => {
    await assert.rejects(
      () => parkingServiceVT.processEntry({ plateNumber: TEST_PLATE, vehicleType: 'no_such_type' }),
      /Unknown vehicle type/
    );
  });

  await testAsync("Vehicle entry & checkout with custom type uses matching slot", async () => {
    const zone = await db.parkingZone.findOne({ where: { isActive: true }, order: [['id', 'ASC']] });
    assert.ok(zone, "Need at least one active zone");
    testSlot = await db.parkingSlot.create({ zoneId: zone.id, slotNumber: 'TEST-VAN-01', slotType: TEST_CODE, status: 'available', isActive: true });

    const ticket = await parkingServiceVT.processEntry({ plateNumber: TEST_PLATE, vehicleType: 'TEST_VAN' });
    testTicketIds.push(ticket.id);
    assert.strictEqual(ticket.vehicleType, TEST_CODE);
    assert.strictEqual(ticket.slotId, testSlot.id, "Should be assigned to the custom-type slot");

    // Cannot deactivate while a vehicle of this type is parked
    const t = await vehicleTypeService.findByCode(TEST_CODE);
    await assert.rejects(() => vehicleTypeService.setActive(t.id, false), /currently parked/);

    await parkingServiceVT.processPaymentAndExit({ ticketId: ticket.id, paymentMethod: 'CASH', amount: 0 });
  });

  await testAsync("Cannot deactivate a type still used by an active slot", async () => {
    const t = await vehicleTypeService.findByCode(TEST_CODE);
    await assert.rejects(() => vehicleTypeService.setActive(t.id, false), /active slot/);
  });

  await testAsync("Switching default keeps exactly one default", async () => {
    const t = await vehicleTypeService.findByCode(TEST_CODE);
    await vehicleTypeService.update(t.id, { isDefault: true });
    const defaults = await db.parkingVehicleType.findAll({ where: { isDefault: true } });
    assert.strictEqual(defaults.length, 1);
    assert.strictEqual(defaults[0].code, TEST_CODE);
    assert.strictEqual(await vehicleTypeService.getDefaultCode(), TEST_CODE);
    await assert.rejects(() => vehicleTypeService.setActive(t.id, false), /default/);
    // restore
    const orig = await vehicleTypeService.findByCode(originalDefaultCode);
    await vehicleTypeService.update(orig.id, { isDefault: true });
    assert.strictEqual(await vehicleTypeService.getDefaultCode(), originalDefaultCode);
  });

  await testAsync("Deactivated type is hidden from list and rejected on entry", async () => {
    await db.parkingSlot.update({ isActive: false }, { where: { id: testSlot.id } });
    const t = await vehicleTypeService.findByCode(TEST_CODE);
    await vehicleTypeService.setActive(t.id, false);
    const codes = (await vehicleTypeService.list()).map(x => x.code);
    assert.ok(!codes.includes(TEST_CODE));
    const allCodes = (await vehicleTypeService.list({ includeInactive: 'true' })).map(x => x.code);
    assert.ok(allCodes.includes(TEST_CODE));
    await assert.rejects(
      () => parkingServiceVT.processEntry({ plateNumber: TEST_PLATE, vehicleType: TEST_CODE }),
      /inactive/
    );
  });

  await cleanupVehicleTypeTest();

  // -------------------------------------------------------------------------
  // 11. PRICING RULE DEFAULTS & MISSING-RULE WARNINGS
  // -------------------------------------------------------------------------
  console.log("\n--- 11. Pricing Rule Default & Fallback Tests ---");

  const RT_A = 'test_rule_a';
  const RT_B = 'test_rule_b';
  const RT_PLATE = 'TR 0001';
  const ruleBase = { gracePeriodMinutes: 15, dayStartTime: '06:00', dayEndTime: '18:00', dayHourlyRate: 1000, nightHourlyRate: 2000, nightPricingType: 'HOURLY', dailyCap: 10000, lostTicketFee: 20000, isActive: true };
  const defaultsOf = async code => (await db.parkingPricingRule.findAll({ where: { vehicleType: code, isDefault: true, isActive: true } })).map(r => r.id);

  async function cleanupRuleTest() {
    const tickets = await db.parkingTicket.findAll({ where: { plateNumber: RT_PLATE }, attributes: ['id'] });
    if (tickets.length) {
      await db.parkingPayment.destroy({ where: { ticketId: tickets.map(t => t.id) } });
      await db.parkingTicket.destroy({ where: { id: tickets.map(t => t.id) } });
    }
    await db.parkingSlot.destroy({ where: { slotNumber: 'TEST-RULE-01' } });
    await db.parkingVehicle.destroy({ where: { plateNumber: RT_PLATE } });
    await db.parkingPricingRule.destroy({ where: { vehicleType: [RT_A, RT_B] } });
    await db.parkingVehicleType.destroy({ where: { code: [RT_A, RT_B] } });
  }
  await cleanupRuleTest();

  test("Fee breakdown flags the built-in fallback rate", () => {
    const entry = new Date("2026-10-25T03:00:00Z"); // 10:00 Vientiane
    const exit = new Date("2026-10-25T05:00:00Z");
    assert.strictEqual(feeService.calculateParkingFee({ entryTime: entry, exitTime: exit, pricingRule: null }).usedFallbackRule, true);
    assert.strictEqual(feeService.calculateParkingFee({ entryTime: entry, exitTime: exit, pricingRule: carPricing }).usedFallbackRule, false);
  });

  try {
    await vehicleTypeService.create({ code: RT_A, nameLa: 'ທົດສອບ A' });
    await vehicleTypeService.create({ code: RT_B, nameLa: 'ທົດສອບ B' });

    await testAsync("Type without a rule: flagged in list, entry allowed without rule, fee marked as fallback", async () => {
      const t = (await vehicleTypeService.list()).find(x => x.code === RT_A);
      assert.strictEqual(t.get('hasPricingRule'), false);

      const zone = await db.parkingZone.findOne({ where: { isActive: true }, order: [['id', 'ASC']] });
      await db.parkingSlot.create({ zoneId: zone.id, slotNumber: 'TEST-RULE-01', slotType: RT_A, status: 'available', isActive: true });
      const ticket = await parkingServiceVT.processEntry({ plateNumber: RT_PLATE, vehicleType: RT_A });
      assert.strictEqual(ticket.pricingRuleId, null, "No rule should be linked");
      const fee = await parkingServiceVT.calculateExitFee({ ticketId: ticket.id });
      assert.strictEqual(fee.feeBreakdown.usedFallbackRule, true);
      await parkingServiceVT.processPaymentAndExit({ ticketId: ticket.id, paymentMethod: 'CASH', amount: 0 });
    });

    let rule1, rule2;
    await testAsync("First rule of a type becomes default even if isDefault=false", async () => {
      rule1 = await parkingServiceVT.savePricingRule({ ...ruleBase, name: 'R1', vehicleType: RT_A, isDefault: false }, 1);
      assert.strictEqual(rule1.isDefault, true);
      const t = (await vehicleTypeService.list()).find(x => x.code === RT_A);
      assert.strictEqual(t.get('hasPricingRule'), true);
    });

    await testAsync("Saving a new default rule un-defaults the old one", async () => {
      rule2 = await parkingServiceVT.savePricingRule({ ...ruleBase, name: 'R2', vehicleType: RT_A, isDefault: true }, 1);
      assert.deepStrictEqual(await defaultsOf(RT_A), [rule2.id]);
    });

    await testAsync("Non-default second rule leaves the current default alone", async () => {
      const r3 = await parkingServiceVT.savePricingRule({ ...ruleBase, name: 'R3', vehicleType: RT_A, isDefault: false }, 1);
      assert.strictEqual(r3.isDefault, false);
      assert.deepStrictEqual(await defaultsOf(RT_A), [rule2.id]);
    });

    await testAsync("The only default can't be un-set", async () => {
      const saved = await parkingServiceVT.savePricingRule({ id: rule2.id, isDefault: false }, 1);
      assert.strictEqual(saved.isDefault, true);
      assert.deepStrictEqual(await defaultsOf(RT_A), [rule2.id]);
    });

    await testAsync("Entry links the default rule (no fallback)", async () => {
      const ticket = await parkingServiceVT.processEntry({ plateNumber: RT_PLATE, vehicleType: RT_A });
      assert.strictEqual(ticket.pricingRuleId, rule2.id);
      const fee = await parkingServiceVT.calculateExitFee({ ticketId: ticket.id });
      assert.strictEqual(fee.feeBreakdown.usedFallbackRule, false);
      await parkingServiceVT.processPaymentAndExit({ ticketId: ticket.id, paymentMethod: 'CASH', amount: 0 });
    });

    await testAsync("Moving the default rule to another type promotes a new default for the old type", async () => {
      await parkingServiceVT.savePricingRule({ id: rule2.id, vehicleType: RT_B }, 1);
      assert.deepStrictEqual(await defaultsOf(RT_B), [rule2.id], "Moved rule is the first rule of B, so it is B's default");
      const aDefaults = await defaultsOf(RT_A);
      assert.strictEqual(aDefaults.length, 1, "Type A must still have exactly one default");
      assert.notStrictEqual(aDefaults[0], rule2.id);
    });

    await testAsync("PUT /pricing-rules/:id updates (no body id) instead of creating a new rule", async () => {
      const controller = require('./src/parking/controller');
      const before = await db.parkingPricingRule.count({ where: { vehicleType: [RT_A, RT_B] } });
      let statusCode = 0;
      let payload = null;
      const res = { status(c) { statusCode = c; return this; }, json(p) { payload = p; return this; } };
      await controller.savePricingRule({ params: { id: String(rule1.id) }, body: { ...ruleBase, name: 'R1 renamed', vehicleType: RT_A }, user: { id: 1 } }, res);
      assert.strictEqual(statusCode, 200, payload && payload.message);
      const after = await db.parkingPricingRule.count({ where: { vehicleType: [RT_A, RT_B] } });
      assert.strictEqual(after, before, "No new rule should be created");
      assert.strictEqual((await db.parkingPricingRule.findByPk(rule1.id)).name, 'R1 renamed');
    });
  } finally {
    await cleanupRuleTest();
  }

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
