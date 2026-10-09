const defaultDb = require('./src/models');
const logger = require('./src/api/logger');

async function seedAccounts(database) {
  const db = database || defaultDb;
  logger.info('Checking standard accounts and GL mapping seeds...');

  try {
    if (!db.chartAccount || !db.spf) {
      logger.warn('chartAccount or spf model not ready, skipping seedAccounts');
      return false;
    }

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

    // 2. Insert missing accounts
    for (const acc of standardAccounts) {
      const [account, created] = await db.chartAccount.findOrCreate({
        where: { accountNumber: acc.accountNumber },
        defaults: {
          accountNumber: acc.accountNumber,
          accountName: acc.accountName,
          accountType: acc.accountType,
          isActive: true
        }
      });
      if (created) {
        logger.info(`Seeded missing chart account: ${acc.accountNumber} - ${acc.accountName}`);
      }
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

    // 4. Insert missing SPF mappings
    for (const map of glMappings) {
      const [param, created] = await db.spf.findOrCreate({
        where: { code: map.code },
        defaults: {
          code: map.code,
          value: map.value,
          remark: map.remark,
          isActive: true
        }
      });
      if (created) {
        logger.info(`Seeded missing GL parameter mapping: ${map.code} -> ${map.value}`);
      }
    }

    logger.info('Standard accounts and GL mapping check completed.');
    return true;
  } catch (error) {
    logger.error('Failed to run standard accounts/GL seeding:', error);
    return false;
  }
}

if (require.main === module) {
  seedAccounts().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  seedAccounts,
  seed: seedAccounts
};
