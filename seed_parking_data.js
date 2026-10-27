const db = require('./src/models');
const fs = require('fs');
const path = require('path');

async function seedParkingData() {
  try {
    console.log("=================================================");
    console.log("🚗 Seeding Car Parking Management Module Data...");
    console.log("=================================================");

    // 1. First run SQL migration to guarantee tables exist
    const sqlPath = path.join(__dirname, '20261025_create_parking_tables.sql');
    if (fs.existsSync(sqlPath)) {
      console.log("Executing SQL migration script: 20261025_create_parking_tables.sql");
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      const statements = sqlContent
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const sql of statements) {
        await db.sequelize.query(sql);
      }
      console.log("✅ SQL migration executed successfully.");
    }

    // 2. Seed Parking Zones
    console.log("\n📍 Seeding Parking Zones...");
    const zonesData = [
      {
        code: 'ZONE-A',
        name: 'Zone A - Outdoor Ground (ໂຊນ A)',
        floor: 'Ground',
        description: 'Main outdoor parking zone near main entrance',
        isActive: true
      },
      {
        code: 'ZONE-B',
        name: 'Zone B - Indoor Basement (ໂຊນ B ໃຕ້ດິນ)',
        floor: 'B1',
        description: 'Underground indoor parking zone',
        isActive: true
      },
      {
        code: 'ZONE-MOTO',
        name: 'Motorbike Zone (ໂຊນລົດຈັກ)',
        floor: 'Ground',
        description: 'Dedicated motorbike parking lane',
        isActive: true
      }
    ];

    const seededZones = {};
    for (const z of zonesData) {
      const [record, created] = await db.parkingZone.findOrCreate({
        where: { code: z.code },
        defaults: z
      });
      seededZones[z.code] = record;
      console.log(` - Zone [${z.code}]: ${created ? 'Created' : 'Already exists'} (ID: ${record.id})`);
    }

    // 3. Seed Parking Slots
    console.log("\n🅿️ Seeding Parking Slots...");
    const slotsToSeed = [
      // Zone A (Car slots A-01 to A-15)
      ...Array.from({ length: 15 }, (_, i) => ({
        zoneId: seededZones['ZONE-A'].id,
        slotNumber: `A-${String(i + 1).padStart(2, '0')}`,
        slotType: 'car',
        status: 'available',
        isActive: true
      })),
      // Zone B (Car slots B-01 to B-10, VIP-01, VIP-02)
      ...Array.from({ length: 10 }, (_, i) => ({
        zoneId: seededZones['ZONE-B'].id,
        slotNumber: `B-${String(i + 1).padStart(2, '0')}`,
        slotType: 'car',
        status: 'available',
        isActive: true
      })),
      {
        zoneId: seededZones['ZONE-B'].id,
        slotNumber: 'VIP-01',
        slotType: 'vip',
        status: 'available',
        isActive: true
      },
      {
        zoneId: seededZones['ZONE-B'].id,
        slotNumber: 'VIP-02',
        slotType: 'vip',
        status: 'available',
        isActive: true
      },
      // Motorbike Zone (M-01 to M-15)
      ...Array.from({ length: 15 }, (_, i) => ({
        zoneId: seededZones['ZONE-MOTO'].id,
        slotNumber: `M-${String(i + 1).padStart(2, '0')}`,
        slotType: 'motorbike',
        status: 'available',
        isActive: true
      }))
    ];

    for (const slot of slotsToSeed) {
      await db.parkingSlot.findOrCreate({
        where: { zoneId: slot.zoneId, slotNumber: slot.slotNumber },
        defaults: slot
      });
    }
    console.log(`✅ Seeded ${slotsToSeed.length} parking slots across 3 zones.`);

    // 4. Seed Pricing Rules (Day vs Night, Car vs Motorbike vs Truck)
    console.log("\n💰 Seeding Day/Night Pricing Rules...");
    const pricingRulesData = [
      {
        name: 'Standard Car Pricing (ອັດຕາຄ່າຈອດລົດໃຫຍ່)',
        vehicleType: 'car',
        gracePeriodMinutes: 15,
        dayStartTime: '06:00',
        dayEndTime: '18:00',
        dayHourlyRate: 5000.00,
        nightHourlyRate: 10000.00,
        nightPricingType: 'HOURLY',
        dailyCap: 50000.00,
        lostTicketFee: 100000.00,
        isDefault: true,
        isActive: true
      },
      {
        name: 'Standard Motorbike Pricing (ອັດຕາຄ່າຈອດລົດຈັກ)',
        vehicleType: 'motorbike',
        gracePeriodMinutes: 15,
        dayStartTime: '06:00',
        dayEndTime: '18:00',
        dayHourlyRate: 2000.00,
        nightHourlyRate: 5000.00,
        nightPricingType: 'HOURLY',
        dailyCap: 20000.00,
        lostTicketFee: 50000.00,
        isDefault: true,
        isActive: true
      },
      {
        name: 'Heavy Truck Pricing (ອັດຕາຄ່າຈອດລົດບັນທຸກ)',
        vehicleType: 'truck',
        gracePeriodMinutes: 15,
        dayStartTime: '06:00',
        dayEndTime: '18:00',
        dayHourlyRate: 10000.00,
        nightHourlyRate: 20000.00,
        nightPricingType: 'HOURLY',
        dailyCap: 100000.00,
        lostTicketFee: 150000.00,
        isDefault: true,
        isActive: true
      }
    ];

    for (const rule of pricingRulesData) {
      const [record, created] = await db.parkingPricingRule.findOrCreate({
        where: { vehicleType: rule.vehicleType, isDefault: true },
        defaults: rule
      });
      console.log(` - Pricing for [${rule.vehicleType}]: ${created ? 'Created' : 'Already exists'} (Day: ${rule.dayHourlyRate} LAK, Night: ${rule.nightHourlyRate} LAK)`);
    }

    // 5. Seed Demo Monthly Pass
    console.log("\n🎫 Seeding Demo Monthly Pass...");
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().slice(0, 10);

    const [pass, passCreated] = await db.parkingMonthlyPass.findOrCreate({
      where: { passNumber: 'MP-202610-001' },
      defaults: {
        passNumber: 'MP-202610-001',
        plateNumber: 'ກກ 9999',
        vehicleType: 'car',
        customerName: 'ສົມສັກ ໄຊຍະວົງ (Somsack)',
        customerPhone: '02055599999',
        startDate: startDate,
        endDate: endDate,
        feeAmount: 300000.00,
        paymentStatus: 'paid',
        status: 'active',
        notes: 'VIP Annual member'
      }
    });
    console.log(` - Monthly Pass [${pass.passNumber}]: ${passCreated ? 'Created' : 'Already exists'} (Plate: ${pass.plateNumber})`);

    console.log("\n🎉 Car Parking Data Seeding Completed Successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding parking data:", err);
    process.exit(1);
  }
}

seedParkingData();
