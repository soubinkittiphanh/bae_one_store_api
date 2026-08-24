const db = require('./src/models');
const logger = require('./src/api/logger');

async function seed() {
  logger.info('Starting standard accounts and GL mapping seed...');

  try {
    // 1. Define standard accounts
    const standardAccounts = [
      { accountNumber: 1101, accountName: 'Cash on Hand (ເງິນສົດໃນມື)', accountType: 'Asset' },
      { accountNumber: 1102, accountName: 'Bank Accounts (ເງິນຝາກທະນາຄານ)', accountType: 'Asset' },
      { accountNumber: 1201, accountName: 'Accounts Receivable (ໜີ້ຕ້ອງຮັບ AR)', accountType: 'Asset' },
      { accountNumber: 1301, accountName: 'Merchandise Inventory (ສິນຄ້າໃນສາງ)', accountType: 'Asset' },
      { accountNumber: 2101, accountName: 'Accounts Payable (ໜີ້ຕ້ອງສົ່ງ AP)', accountType: 'Liability' },
      { accountNumber: 4101, accountName: 'Sales Revenue (ລາຍຮັບຈາກການຂາຍ)', accountType: 'Revenue' },
      { accountNumber: 5101, accountName: 'Cost of Goods Sold (ຕົ້ນທຶນສິນຄ້າຂາຍ COGS)', accountType: 'Expense' }
    ];

    const accountMap = {};

    // 2. Insert or update accounts
    for (const acc of standardAccounts) {
      let account = await db.chartAccount.findOne({ where: { accountNumber: acc.accountNumber } });
      if (!account) {
        account = await db.chartAccount.create(acc);
        logger.info(`Seeded account: ${acc.accountNumber} - ${acc.accountName}`);
      } else {
        await account.update({ accountName: acc.accountName, accountType: acc.accountType });
        logger.info(`Updated existing account: ${acc.accountNumber}`);
      }
      accountMap[acc.accountNumber] = account.id;
    }

    // 3. Define GL mapping parameters
    const glMappings = [
      { code: 'GL_MAP_CASH_ACC', value: '1101', remark: 'GL account code for Cash on Hand payments' },
      { code: 'GL_MAP_BANK_ACC', value: '1102', remark: 'GL account code for Bank/QR code payments' },
      { code: 'GL_MAP_AR_ACC', value: '1201', remark: 'GL account code for Accounts Receivable (Credit sales)' },
      { code: 'GL_MAP_INV_ACC', value: '1301', remark: 'GL account code for Merchandise Inventory' },
      { code: 'GL_MAP_AP_ACC', value: '2101', remark: 'GL account code for Accounts Payable' },
      { code: 'GL_MAP_REV_ACC', value: '4101', remark: 'GL account code for POS Sales Revenue' },
      { code: 'GL_MAP_COGS_ACC', value: '5101', remark: 'GL account code for Cost of Goods Sold (COGS)' }
    ];

    // 4. Insert or update SPF mappings
    for (const map of glMappings) {
      let param = await db.spf.findOne({ where: { code: map.code } });
      if (!param) {
        await db.spf.create(map);
        logger.info(`Seeded parameter mapping: ${map.code} -> ${map.value}`);
      } else {
        await param.update({ value: map.value, remark: map.remark });
        logger.info(`Updated parameter mapping: ${map.code} -> ${map.value}`);
      }
    }

    logger.info('GL Seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to run GL seeding:', error);
    process.exit(1);
  }
}

seed();
