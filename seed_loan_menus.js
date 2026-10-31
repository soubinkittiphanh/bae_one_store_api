process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_menus');
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
      },
      {
        name: 'Loan Master Data',
        llname: 'ຂໍ້ມູນພື້ນຖານສິນເຊື່ອ',
        icon: 'mdi-database-cog-outline',
        path: '/admin/loan/studio?tab=master',
        target_systems: 'ALL',
        isActive: true,
        order: 5
      },
      {
        name: 'Pending Approvals',
        llname: 'ລາຍການລໍຖ້າອະນຸມັດ',
        icon: 'mdi-account-check-outline',
        path: '/admin/loan/studio?tab=changes',
        target_systems: 'ALL',
        isActive: true,
        order: 6
      },
      {
        name: 'User Group Access Rights',
        llname: 'ສິດການເຂົ້າເຖິງຂອງກຸ່ມຜູ້ໃຊ້',
        icon: 'mdi-shield-key-outline',
        path: '/admin/security/grants',
        target_systems: 'ALL',
        isActive: true,
        order: 7
      },
      // Phase 5 Part B: operational screens (each page checks its own permission; the API enforces it)
      { name: 'Loan Applications', llname: 'ຄຳຮ້ອງສິນເຊື່ອ', icon: 'mdi-file-document-edit-outline', path: '/admin/loan/applications', target_systems: 'ALL', isActive: true, order: 8 },
      { name: 'Loan Accounts', llname: 'ບັນຊີສິນເຊື່ອ', icon: 'mdi-folder-account-outline', path: '/admin/loan/accounts', target_systems: 'ALL', isActive: true, order: 9 },
      { name: 'Loan Transactions to Authorize', llname: 'ລາຍການສິນເຊື່ອລໍຖ້າອະນຸມັດ', icon: 'mdi-account-check', path: '/admin/loan/pending', target_systems: 'ALL', isActive: true, order: 10 },
      { name: 'Loan End of Day', llname: 'ປິດທ້າຍວັນສິນເຊື່ອ', icon: 'mdi-calendar-clock', path: '/admin/loan/eod', target_systems: 'ALL', isActive: true, order: 11 },
      { name: 'Collection List', llname: 'ລາຍການຕິດຕາມໜີ້', icon: 'mdi-phone-alert-outline', path: '/admin/loan/collection', target_systems: 'ALL', isActive: true, order: 12 },
      { name: 'Loan Reports', llname: 'ລາຍງານສິນເຊື່ອ', icon: 'mdi-chart-box-outline', path: '/admin/loan/reports', target_systems: 'ALL', isActive: true, order: 13 },
      { name: 'Loan Exchange Rates', llname: 'ອັດຕາແລກປ່ຽນສິນເຊື່ອ', icon: 'mdi-swap-horizontal', path: '/admin/loan/exchange-rates', target_systems: 'ALL', isActive: true, order: 14 }
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
