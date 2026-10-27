const db = require('./src/models');

async function seedParkingMenus() {
  try {
    console.log("=================================================");
    console.log("📋 Seeding Car Parking Admin Navigation Menus...");
    console.log("=================================================");

    // 1. Create Menu Header
    const [header, headerCreated] = await db.menuHeader.findOrCreate({
      where: { code: 'PARKING' },
      defaults: {
        code: 'PARKING',
        icon: 'mdi-car-parking',
        name: 'Car Parking',
        llname: 'ລະບົບຄຸ້ມຄອງບ່ອນຈອດລົດ',
        remark: 'Car Parking Management System for Vehicle Entry, Exit, Slots and Billing',
        expand: true,
        isActive: true
      }
    });

    console.log(headerCreated ? "✅ Created Menu Header: PARKING (ລະບົບຄຸ້ມຄອງບ່ອນຈອດລົດ)" : "ℹ️ Menu Header already exists: PARKING");

    // 2. Define Menu Lines with Lao titles
    const menuLines = [
      {
        name: 'Parking Dashboard',
        llname: 'ໜ້າຫຼັກ & ແດດບອດ',
        icon: 'mdi-view-dashboard-outline',
        path: '/admin/parking',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Zones & Slots',
        llname: 'ຈັດການໂຊນ ແລະ ຊ່ອງຈອດ',
        icon: 'mdi-map-marker-radius',
        path: '/admin/parking/zones',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Pricing Rules',
        llname: 'ຕັ້ງຄ່າລາຄາຕາມຊ່ວງເວລາ',
        icon: 'mdi-cash-clock',
        path: '/admin/parking/pricing',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Monthly Passes',
        llname: 'ປີ້ລາຍເດືອນ (Pass)',
        icon: 'mdi-card-account-details-outline',
        path: '/admin/parking/passes',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Tickets & History',
        llname: 'ປະຫວັດປີ້ ແລະ ທຸລະກຳ',
        icon: 'mdi-ticket-confirmation-outline',
        path: '/admin/parking/tickets',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Parking Reports',
        llname: 'ລາຍງານລາຍຮັບ & ສະຖິຕິ',
        icon: 'mdi-chart-line',
        path: '/admin/parking/reports',
        target_systems: 'ALL',
        isActive: true
      }
    ];

    // 3. Create or Update Menu Lines and Associate with Header
    for (let i = 0; i < menuLines.length; i++) {
      const line = menuLines[i];
      const [record, created] = await db.menuLine.findOrCreate({
        where: { path: line.path },
        defaults: {
          name: line.name,
          llname: line.llname,
          icon: line.icon,
          path: line.path,
          target_systems: line.target_systems,
          isActive: line.isActive
        }
      });

      if (!created) {
        await record.update({
          name: line.name,
          llname: line.llname,
          icon: line.icon,
          target_systems: line.target_systems,
          isActive: line.isActive
        });
        console.log(` - Updated Menu Line: ${line.llname} (${line.path})`);
      } else {
        console.log(` - Created Menu Line: ${line.llname} (${line.path})`);
      }

      // Associate in MenuHeaderLines join table
      await db.MenuHeaderLines.findOrCreate({
        where: {
          menuHeaderId: header.id,
          menuLineId: record.id
        },
        defaults: {
          menuHeaderId: header.id,
          menuLineId: record.id,
          order: i + 1
        }
      });
    }

    // 4. Attach Header to all User Groups
    const groups = await db.group.findAll();
    console.log(`\n🔗 Attaching menu header to ${groups.length} user groups...`);

    for (const grp of groups) {
      await db.GroupMenuHeader.findOrCreate({
        where: {
          userGroupId: grp.id,
          menuHeaderId: header.id
        },
        defaults: {
          userGroupId: grp.id,
          menuHeaderId: header.id,
          order: 85
        }
      });
    }

    console.log("🎉 Parking navigation menus seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding parking menus:", err);
    process.exit(1);
  }
}

seedParkingMenus();
