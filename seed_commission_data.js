const db = require('./src/models');
const { QueryTypes } = require('sequelize');

/**
 * Seed file for Product Sales Commission feature:
 * 1. Ensures DB schema columns exist on product and saleLine.
 * 2. Seeds menu entries (sidebar menuLine and dashboard shortcut).
 * 3. Seeds sample commission-enabled products.
 * 4. Seeds sample sales transactions with snapshotted line commissions.
 */
async function seedCommissionData() {
  console.log('====================================================');
  console.log('🚀 Seeding Product Sales Commission & Report Data...');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------
    // 1. Ensure Table Schema Columns
    // -------------------------------------------------------------
    console.log('1. Checking and ensuring database schema columns...');
    await db.sequelize.query('ALTER TABLE `product` ADD COLUMN IF NOT EXISTS `hasCommission` TINYINT(1) NOT NULL DEFAULT 0', { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query("ALTER TABLE `product` ADD COLUMN IF NOT EXISTS `commissionType` ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage'", { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query('ALTER TABLE `product` ADD COLUMN IF NOT EXISTS `commissionValue` DOUBLE NOT NULL DEFAULT 0', { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query('ALTER TABLE `product` ADD COLUMN IF NOT EXISTS `commissionCurrencyId` INT(11) DEFAULT NULL', { type: QueryTypes.BULKUPDATE }).catch(() => {});

    await db.sequelize.query('ALTER TABLE `saleLine` ADD COLUMN IF NOT EXISTS `hasCommission` TINYINT(1) NOT NULL DEFAULT 0', { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query("ALTER TABLE `saleLine` ADD COLUMN IF NOT EXISTS `commissionType` ENUM('percentage', 'fixed') DEFAULT NULL", { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query('ALTER TABLE `saleLine` ADD COLUMN IF NOT EXISTS `commissionRate` DOUBLE NOT NULL DEFAULT 0', { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query('ALTER TABLE `saleLine` ADD COLUMN IF NOT EXISTS `commissionAmount` DOUBLE NOT NULL DEFAULT 0', { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query('ALTER TABLE `saleLine` ADD COLUMN IF NOT EXISTS `commissionCurrencyId` INT(11) DEFAULT NULL', { type: QueryTypes.BULKUPDATE }).catch(() => {});
    await db.sequelize.query('ALTER TABLE `saleLine` ADD COLUMN IF NOT EXISTS `commissionBaseAmount` DOUBLE NOT NULL DEFAULT 0', { type: QueryTypes.BULKUPDATE }).catch(() => {});
    console.log('✅ Product and SaleLine columns verified.\n');

    // -------------------------------------------------------------
    // 2. Seed Navigation Menu & Dashboard Shortcut
    // -------------------------------------------------------------
    console.log('2. Registering Navigation Menu & Dashboard Shortcut...');
    const [menuLine, lineCreated] = await db.menuLine.findOrCreate({
      where: { path: '/admin/saleReportCommission' },
      defaults: {
        name: 'Sales Commission Report',
        llname: 'ລາຍງານຄ່ານາຍໜ້າສິນຄ້າ',
        icon: 'mdi-cash-multiple',
        path: '/admin/saleReportCommission',
        remark: 'Product sales commission performance & settlement report',
        target_systems: 'ALL',
        isActive: true,
      },
    });
    console.log(` - MenuLine /admin/saleReportCommission: ${lineCreated ? 'Created' : 'Already exists'} (ID: ${menuLine.id})`);

    // Attach to REPORTS (id 8) and SALES (id 2) headers
    const targetHeaders = await db.menuHeader.findAll({
      where: { code: ['REPORTS', 'SALES'] },
    });
    for (const hdr of targetHeaders) {
      await db.MenuHeaderLines.findOrCreate({
        where: { menuHeaderId: hdr.id, menuLineId: menuLine.id },
        defaults: { menuHeaderId: hdr.id, menuLineId: menuLine.id, order: 25 },
      });
      console.log(` - Attached to Menu Header: ${hdr.code} (${hdr.name})`);
    }

    // Register dashboard shortcut
    if (db.dashboardMenu) {
      const [dashShortcut, shortcutCreated] = await db.dashboardMenu.findOrCreate({
        where: { path: '/admin/saleReportCommission' },
        defaults: {
          name: 'Commission Report',
          llname: 'ລາຍງານຄ່ານາຍໜ້າ',
          path: '/admin/saleReportCommission',
          icon: 'invoice.svg',
          iconType: 'svg',
          color: '#673ab7',
          order: 12,
          target_systems: 'ALL',
          isActive: true,
        },
      });
      console.log(` - Dashboard Shortcut: ${shortcutCreated ? 'Created' : 'Already exists'} (ID: ${dashShortcut.id})`);
    }
    console.log('✅ Menus registered successfully.\n');

    // -------------------------------------------------------------
    // 3. Seed Sample Commission Products
    // -------------------------------------------------------------
    console.log('3. Seeding Sample Products with Commission...');
    const currencies = await db.currency.findAll();
    const ccyLAK = currencies.find((c) => c.code === 'LAK') || { id: 1, rate: 1, exchangeDirection: 'local_to_foreign' };
    const ccyUSD = currencies.find((c) => c.code === 'USD') || { id: 5, rate: 21200, exchangeDirection: 'foreign_to_local' };
    const ccyTHB = currencies.find((c) => c.code === 'THB') || { id: 6, rate: 670, exchangeDirection: 'foreign_to_local' };

    const sampleProducts = [
      {
        product_code: 'COMM-MAC-01',
        barCode: '885000000991',
        pro_name: 'MacBook Pro 16 M3 Max (5% Commission)',
        pro_desc: 'Apple M3 Max Chip 36GB RAM 1TB SSD',
        pro_price: 35000000,
        cost_price: 31000000,
        saleCurrencyId: ccyLAK.id,
        costCurrencyId: ccyLAK.id,
        hasCommission: true,
        commissionType: 'percentage',
        commissionValue: 5.0, // 5%
        commissionCurrencyId: ccyLAK.id,
        _category: 'product',
        stock_count: 50,
        minStock: 5,
        isActive: true,
        validateStockOnSale: false,
      },
      {
        product_code: 'COMM-ESP-02',
        barCode: '885000000992',
        pro_name: 'Espresso Premium Roast Blend (3,000 LAK / Cup)',
        pro_desc: 'Arabica & Robusta Coffee Beans 1kg',
        pro_price: 35000,
        cost_price: 18000,
        saleCurrencyId: ccyLAK.id,
        costCurrencyId: ccyLAK.id,
        hasCommission: true,
        commissionType: 'fixed',
        commissionValue: 3000, // 3,000 LAK per unit
        commissionCurrencyId: ccyLAK.id,
        _category: 'product',
        stock_count: 500,
        minStock: 20,
        isActive: true,
        validateStockOnSale: false,
      },
      {
        product_code: 'COMM-IPH-03',
        barCode: '885000000993',
        pro_name: 'iPhone 15 Pro Max 256GB ($50 Fixed)',
        pro_desc: 'Natural Titanium 256GB',
        pro_price: 1200,
        cost_price: 1050,
        saleCurrencyId: ccyUSD.id,
        costCurrencyId: ccyUSD.id,
        hasCommission: true,
        commissionType: 'fixed',
        commissionValue: 50, // 50 USD per unit
        commissionCurrencyId: ccyUSD.id,
        _category: 'product',
        stock_count: 30,
        minStock: 3,
        isActive: true,
        validateStockOnSale: false,
      },
      {
        product_code: 'COMM-SONY-04',
        barCode: '885000000994',
        pro_name: 'Sony WH-1000XM5 Headphones (8% Commission)',
        pro_desc: 'Wireless Noise Canceling Headphones',
        pro_price: 6500,
        cost_price: 5200,
        saleCurrencyId: ccyTHB.id,
        costCurrencyId: ccyTHB.id,
        hasCommission: true,
        commissionType: 'percentage',
        commissionValue: 8.0, // 8%
        commissionCurrencyId: ccyTHB.id,
        _category: 'product',
        stock_count: 80,
        minStock: 10,
        isActive: true,
        validateStockOnSale: false,
      },
    ];

    const seededProducts = [];
    for (const pData of sampleProducts) {
      let product = await db.product.findOne({ where: { product_code: pData.product_code } });
      if (!product) {
        // Query next pro_id
        const lastProId = await db.product.max('pro_id');
        const nextProId = (lastProId ? parseInt(lastProId) : 1000) + 1;
        product = await db.product.create({
          ...pData,
          pro_id: nextProId,
          companyId: 1,
        });
        console.log(` - Created Product: ${product.pro_name} (ID: ${product.id}, Code: ${product.product_code})`);
      } else {
        await product.update(pData);
        console.log(` - Updated Product: ${product.pro_name} (ID: ${product.id}, Code: ${product.product_code})`);
      }
      seededProducts.push(product);
    }
    console.log('✅ Sample products ready.\n');

    // -------------------------------------------------------------
    // 4. Seed Sample Sales Transactions
    // -------------------------------------------------------------
    console.log('4. Seeding Sample Sales Transactions with Line Commissions...');
    const users = await db.user.findAll({ limit: 3 });
    const user1 = users[0] || { id: 1 };
    const user2 = users[1] || user1;
    const user3 = users[2] || user1;

    const clients = await db.client.findAll({ limit: 3 });
    const client1 = clients[0] || { id: 1 };
    const client2 = clients[1] || client1;

    const now = new Date();
    const getDateDaysAgo = (days) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    };

    // Helper to convert to LAK base amount
    const convertToLAK = (amount, currency) => {
      if (!currency || currency.code === 'LAK') return amount;
      if (currency.exchangeDirection === 'local_to_foreign') {
        return amount / (parseFloat(currency.rate) || 1);
      }
      return amount * (parseFloat(currency.rate) || 1);
    };

    const sampleOrders = [
      {
        daysAgo: 0, // Today
        userId: user1.id,
        clientId: client1.id,
        items: [
          { product: seededProducts[0], qty: 2, price: 35000000, currency: ccyLAK }, // MacBook: 2 x 35M = 70M, 5% comm = 3,500,000 LAK
          { product: seededProducts[1], qty: 10, price: 35000, currency: ccyLAK },   // Espresso: 10 x 3,000 = 30,000 LAK comm
        ],
      },
      {
        daysAgo: 1, // Yesterday
        userId: user2.id,
        clientId: client2.id,
        items: [
          { product: seededProducts[2], qty: 2, price: 1200, currency: ccyUSD }, // iPhone: 2 x $50 = $100 comm
        ],
      },
      {
        daysAgo: 2, // 2 days ago
        userId: user1.id,
        clientId: client1.id,
        items: [
          { product: seededProducts[3], qty: 4, price: 6500, currency: ccyTHB }, // Sony: 4 x 6,500 = 26,000 THB, 8% comm = 2,080 THB
          { product: seededProducts[1], qty: 5, price: 35000, currency: ccyLAK },  // Espresso: 5 x 3,000 = 15,000 LAK comm
        ],
      },
      {
        daysAgo: 5, // 5 days ago
        userId: user3.id,
        clientId: client2.id,
        items: [
          { product: seededProducts[0], qty: 1, price: 35000000, currency: ccyLAK }, // MacBook: 1 x 35M, 5% = 1,750,000 LAK comm
          { product: seededProducts[2], qty: 1, price: 1200, currency: ccyUSD },     // iPhone: 1 x $50 = $50 comm
        ],
      },
      {
        daysAgo: 10, // 10 days ago
        userId: user2.id,
        clientId: client1.id,
        items: [
          { product: seededProducts[3], qty: 2, price: 6500, currency: ccyTHB }, // Sony: 2 x 6,500 = 13,000 THB, 8% = 1,040 THB comm
        ],
      },
    ];

    let totalOrdersCreated = 0;
    let totalLinesCreated = 0;
    let totalCommissionBaseAccum = 0;

    for (let idx = 0; idx < sampleOrders.length; idx++) {
      const orderDef = sampleOrders[idx];
      const bookingDate = getDateDaysAgo(orderDef.daysAgo);
      const mainCurrency = orderDef.items[0].currency;

      let orderTotal = 0;
      orderDef.items.forEach((it) => {
        orderTotal += it.qty * it.price;
      });

      // Create SaleHeader
      const saleHeader = await db.saleHeader.create({
        bookingDate,
        qrRequestId: null,
        remark: `Demo Commission Sale #${idx + 1}`,
        discount: 0,
        total: orderTotal,
        exchangeRate: parseFloat(mainCurrency.rate) || 1,
        isActive: true,
        clientId: orderDef.clientId,
        currencyId: mainCurrency.id,
        userId: orderDef.userId,
        referenceNo: `COM-POS-${idx + 101}`,
        locationId: 1,
      });

      // Create SaleLines with Commission Snapshots
      for (const item of orderDef.items) {
        const prod = item.product;
        const lineTotal = item.qty * item.price;
        let commAmount = 0;

        if (prod.commissionType === 'percentage') {
          commAmount = (lineTotal * prod.commissionValue) / 100;
        } else {
          commAmount = prod.commissionValue * item.qty;
        }

        const commBaseAmount = convertToLAK(commAmount, item.currency);
        totalCommissionBaseAccum += commBaseAmount;

        await db.saleLine.create({
          headerId: saleHeader.id,
          saleHeaderId: saleHeader.id,
          productId: prod.id,
          currencyId: item.currency.id,
          quantity: item.qty,
          unitRate: 1,
          price: item.price,
          discount: 0,
          total: lineTotal,
          isActive: true,
          hasCommission: true,
          commissionType: prod.commissionType,
          commissionRate: prod.commissionValue,
          commissionAmount: commAmount,
          commissionCurrencyId: item.currency.id,
          commissionBaseAmount: Math.round(commBaseAmount * 100) / 100,
        });

        totalLinesCreated++;
      }

      totalOrdersCreated++;
      console.log(` - Created Sale #${saleHeader.id} (${bookingDate}) - Ref: ${saleHeader.referenceNo} - ${orderDef.items.length} lines`);
    }

    console.log('\n====================================================');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
    console.log(`- Seeded Products with Commission: ${seededProducts.length}`);
    console.log(`- Seeded Sales Orders:            ${totalOrdersCreated}`);
    console.log(`- Seeded Commission Lines:        ${totalLinesCreated}`);
    console.log(`- Total Demo Base Commission:     ${totalCommissionBaseAccum.toLocaleString()} LAK`);
    console.log('\n👉 Open the web app at:');
    console.log('   http://localhost:3000/admin/saleReportCommission');
    console.log('   or navigate via Dashboard / Product list.');
    console.log('====================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedCommissionData();
