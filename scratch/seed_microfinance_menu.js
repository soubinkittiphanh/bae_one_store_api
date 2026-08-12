const db = require('../src/models');

async function seed() {
  try {
    console.log("Seeding Microfinance Core Module menu...");

    // 1. Create Menu Header
    const [header, headerCreated] = await db.menuHeader.findOrCreate({
      where: { code: 'MF_CORE' },
      defaults: {
        code: 'MF_CORE',
        icon: 'mdi-bank-transfer',
        name: 'Microfinance Module',
        llname: 'ລະບົບສິນເຊື່ອຈຸລະພາກ',
        remark: 'Microfinance Core banking and JLG management',
        expand: true,
        isActive: true
      }
    });

    console.log(headerCreated ? "Created Menu Header: MF_CORE" : "Menu Header already exists: MF_CORE");

    // 2. Define Menu Lines
    const menuLines = [
      {
        name: 'Microfinance Dashboard',
        llname: 'ໜ້າຫຼັກສິນເຊື່ອຈຸລະພາກ',
        icon: 'mdi-view-dashboard-outline',
        path: '/microfinance',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'CIF Customer Registry',
        llname: 'ທະບຽນລູກຄ້າ (CIF)',
        icon: 'mdi-card-account-details-outline',
        path: '/microfinance/cif',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Groups & Centers',
        llname: 'ຈັດການກຸ່ມ JLG ແລະ ສູນ',
        icon: 'mdi-account-group-outline',
        path: '/microfinance/groups',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Collaterals ELCM',
        llname: 'ຈັດການຫຼັກຊັບຄ້ຳປະກັນ',
        icon: 'mdi-shield-check-outline',
        path: '/microfinance/collateral',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Loan Product Setup',
        llname: 'ກຳນົດຜະລິດຕະພັນສິນເຊື່ອ',
        icon: 'mdi-book-cog-outline',
        path: '/microfinance/products',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Loan Accounts Registry',
        llname: 'ບັນຊີສິນເຊື່ອ',
        icon: 'mdi-currency-usd',
        path: '/microfinance/accounts',
        target_systems: 'ALL',
        isActive: true
      },
      {
        name: 'Center Meeting collections',
        llname: 'ເກັບກູ້ໜີ້ສິນລາຍອາທິດ',
        icon: 'mdi-table-large',
        path: '/microfinance/collections',
        target_systems: 'ALL',
        isActive: true
      }
    ];

    // 3. Create Menu Lines and associate them via MenuHeaderLines junction table
    for (let i = 0; i < menuLines.length; i++) {
      const lineData = menuLines[i];
      const [lineRecord, lineCreated] = await db.menuLine.findOrCreate({
        where: { path: lineData.path },
        defaults: lineData
      });

      if (!lineCreated) {
        await lineRecord.update(lineData);
        console.log(`Updated Menu Line: ${lineData.name}`);
      } else {
        console.log(`Created Menu Line: ${lineData.name}`);
      }

      // Explicitly write the association in the junction table MenuHeaderLines
      await db.MenuHeaderLines.findOrCreate({
        where: {
          menuHeaderId: header.id,
          menuLineId: lineRecord.id
        },
        defaults: {
          menuHeaderId: header.id,
          menuLineId: lineRecord.id,
          order: i + 1
        }
      });
    }

    // 4. Attach to all User Groups so user 1000 and others can see it
    const groups = await db.group.findAll();
    console.log(`Attaching menu to ${groups.length} user groups...`);

    for (const grp of groups) {
      await db.GroupMenuHeader.findOrCreate({
        where: {
          userGroupId: grp.id,
          menuHeaderId: header.id
        },
        defaults: {
          userGroupId: grp.id,
          menuHeaderId: header.id,
          order: 10 // Order inside the sidebar layout
        }
      });
    }

    console.log("Microfinance menu seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding microfinance menus:", error);
    process.exit(1);
  }
}

seed();
