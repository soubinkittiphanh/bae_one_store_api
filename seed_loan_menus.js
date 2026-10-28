process.env.NO_SYNC = 'true';
const db = require('./src/models');

async function seedLoanMenus() {
  console.log('--- Seeding Loan Module Menus ---');
  try {
    // 1. Menu Header
    let [header] = await db.menuHeader.findOrCreate({
      where: { code: 'LOAN' },
      defaults: {
        code: 'LOAN',
        icon: 'mdi-car-key',
        name: 'Vehicle Financing',
        llname: 'ສິນເຊື່ອເຊົ່າຊື້ລົດ',
        expand: false,
        isActive: true
      }
    });

    console.log(`MenuHeader LOAN found/created with id: ${header.id}`);

    // 2. Menu Lines
    const linesData = [
      {
        name: 'Loan Parameter Studio',
        llname: 'ສູນຕັ້ງຄ່າພາຣາມິເຕີສິນເຊື່ອ',
        icon: 'mdi-tune-vertical',
        path: '/admin/loan/studio',
        target_systems: 'ALL',
        isActive: true,
        order: 1
      },
      {
        name: 'Go-Live Checklist',
        llname: 'ລາຍການກວດສອບ Go-Live',
        icon: 'mdi-clipboard-check-outline',
        path: '/admin/loan/studio?tab=checklist',
        target_systems: 'ALL',
        isActive: true,
        order: 2
      },
      {
        name: 'Tax Profile & VAT',
        llname: 'ອາກອນມູນຄ່າເພີ່ມ VAT',
        icon: 'mdi-receipt-text-check-outline',
        path: '/admin/loan/studio?tab=tax',
        target_systems: 'ALL',
        isActive: true,
        order: 3
      },
      {
        name: 'Product Factory',
        llname: 'ສາງຜະລິດຕະພັນສິນເຊື່ອ',
        icon: 'mdi-car-multiple',
        path: '/admin/loan/studio?tab=products',
        target_systems: 'ALL',
        isActive: true,
        order: 4
      }
    ];

    for (const item of linesData) {
      let [line] = await db.menuLine.findOrCreate({
        where: { path: item.path },
        defaults: {
          name: item.name,
          llname: item.llname,
          icon: item.icon,
          path: item.path,
          target_systems: item.target_systems,
          isActive: item.isActive
        }
      });

      // Link in MenuHeaderLines
      await db.MenuHeaderLines.findOrCreate({
        where: { menuHeaderId: header.id, menuLineId: line.id },
        defaults: {
          menuHeaderId: header.id,
          menuLineId: line.id,
          order: item.order
        }
      });
      console.log(`MenuLine ${item.name} linked to header`);
    }

    console.log('--- Loan Menus Seeded Successfully! ---');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding loan menus:', err);
    process.exit(1);
  }
}

seedLoanMenus();
