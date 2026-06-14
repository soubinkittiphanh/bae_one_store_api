const fs = require('fs');
const path = require('path');
const db = require('../src/models/index.js');

// Paths to generated images in artifact folder
const ARTIFACT_DIR = '/Users/soubinkittiphanh/.gemini/antigravity/brain/296a94c4-e0ca-4e08-a315-89029de92744';
const UPLOADS_DIR = '/Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/uploads';

const imageFiles = {
  iced_caramel_macchiato: 'iced_caramel_macchiato_1779269207370.png',
  hot_cappuccino: 'hot_cappuccino_1779269345436.png', // wait, let's verify filenames from the outputs
  iced_matcha_latte: 'iced_matcha_latte_1779269271244.png',
  strawberry_smoothie: 'strawberry_smoothie_1779269304563.png',
  butter_croissant: 'butter_croissant_1779269345436.png',
  chocolate_fudge_cake: 'chocolate_fudge_cake_1779269400545.png'
};

// Wait, the correct names of the generated files from output:
// 1. iced_caramel_macchiato_1779269207370.png
// 2. hot_cappuccino_1779269235019.png
// 3. iced_matcha_latte_1779269271244.png
// 4. strawberry_smoothie_1779269304563.png
// 5. butter_croissant_1779269345436.png
// 6. chocolate_fudge_cake_1779269400545.png

const correctImages = {
  'iced_caramel_macchiato.png': path.join(ARTIFACT_DIR, 'iced_caramel_macchiato_1779269207370.png'),
  'hot_cappuccino.png': path.join(ARTIFACT_DIR, 'hot_cappuccino_1779269235019.png'),
  'iced_matcha_latte.png': path.join(ARTIFACT_DIR, 'iced_matcha_latte_1779269271244.png'),
  'strawberry_smoothie.png': path.join(ARTIFACT_DIR, 'strawberry_smoothie_1779269304563.png'),
  'butter_croissant.png': path.join(ARTIFACT_DIR, 'butter_croissant_1779269345436.png'),
  'chocolate_fudge_cake.png': path.join(ARTIFACT_DIR, 'chocolate_fudge_cake_1779269400545.png')
};

async function run() {
  try {
    console.log('=== STEP 1: DATABASE CLEANUP ===');
    console.log('Disabling foreign key constraints...');
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    const tablesToClean = [
      'saleLine',
      'saleHeader',
      'salePayment',
      'ticketLine',
      'ticket',
      'card',
      'priceList',
      'product_size',
      'image_path',
      'ProductReservation',
      'ProductAudit',
      'WebGroupProduct',
      'stock_transactions',
      'loyalty_transaction',
      'washJobLine',
      'washJob',
      'orders_history',
      'orders',
      'product',
      'category',
      'mainCategory'
    ];

    for (const table of tablesToClean) {
      try {
        console.log(`Clearing table: ${table}...`);
        await db.sequelize.query(`DELETE FROM \`${table}\``);
      } catch (e) {
        console.log(`Skipped table ${table} (might not exist): ${e.message}`);
      }
    }

    console.log('Re-enabling foreign key constraints...');
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Database cleanup completed successfully!\n');

    console.log('=== STEP 2: COPYING DUMMY IMAGES ===');
    if (!fs.existsSync(UPLOADS_DIR)) {
      console.log(`Creating uploads directory: ${UPLOADS_DIR}...`);
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    for (const [targetName, sourcePath] of Object.entries(correctImages)) {
      const destinationPath = path.join(UPLOADS_DIR, targetName);
      if (fs.existsSync(sourcePath)) {
        console.log(`Copying image to ${destinationPath}...`);
        fs.copyFileSync(sourcePath, destinationPath);
      } else {
        console.warn(`Source image not found: ${sourcePath}`);
      }
    }
    console.log('Image copying completed successfully!\n');

    console.log('=== STEP 3: SEEDING MAIN CATEGORY ===');
    const mainCategory = await db.mainCategory.create({
      categoryName: 'Cafe & Desserts',
      categoryDesc: 'Premium cafe drinks, coffee, tea, and bakery desserts',
      isActive: true
    });
    console.log(`Created Main Category: ${mainCategory.categoryName} (ID: ${mainCategory.id})\n`);

    console.log('=== STEP 4: SEEDING CATEGORIES ===');
    const subCategories = [
      {
        categ_name: 'Coffee & Espresso',
        categ_desc: 'Freshly brewed espresso and coffee drinks',
        isActive: true,
        mainCategoryId: mainCategory.id
      },
      {
        categ_name: 'Teas & Smoothies',
        categ_desc: 'Iced milk teas, matcha, and blended fresh fruit smoothies',
        isActive: true,
        mainCategoryId: mainCategory.id
      },
      {
        categ_name: 'Bakery & Pastries',
        categ_desc: 'Freshly baked croissants, pastries, and gourmet cakes',
        isActive: true,
        mainCategoryId: mainCategory.id
      }
    ];

    const createdCats = [];
    for (const cat of subCategories) {
      const c = await db.category.create(cat);
      createdCats.push(c);
      console.log(`Created Category: ${c.categ_name} (ID: ${c.categ_id})`);
    }
    console.log('');

    console.log('=== STEP 5: DYNAMIC RELATION FALLBACKS ===');
    // Fetch fallback IDs for foreign keys dynamically
    const fallbackCompany = await db.company.findOne();
    const companyId = fallbackCompany ? fallbackCompany.id : 1;

    const fallbackTax = await db.tax.findOne();
    const taxId = fallbackTax ? fallbackTax.id : 1;

    const fallbackCurrency = await db.currency.findOne();
    const currencyId = fallbackCurrency ? fallbackCurrency.id : 1;

    const fallbackUnit = await db.unit.findOne();
    const unitId = fallbackUnit ? fallbackUnit.id : 1;

    console.log(`Using Fallbacks -> Company ID: ${companyId}, Tax ID: ${taxId}, Currency ID: ${currencyId}, Unit ID: ${unitId}\n`);

    console.log('=== STEP 6: SEEDING PRODUCTS & IMAGES ===');
    const productsData = [
      // Coffee & Espresso
      {
        pro_category: createdCats[0].categ_id,
        categoryCategId: createdCats[0].categ_id,
        pro_id: 1001,
        pro_name: 'Iced Caramel Macchiato',
        pro_price: 35000,
        pro_desc: 'Freshly pulled espresso layered with cold milk, ice cubes, and rich sweet caramel drizzle.',
        pro_status: true,
        validateStockOnSale: false,
        pro_image_path: 'uploads/iced_caramel_macchiato.png',
        cost_price: 12000,
        stock_count: 999,
        minStock: 5,
        isActive: true,
        _category: 'product',
        companyId,
        taxId,
        saleCurrencyId: currencyId,
        costCurrencyId: currencyId,
        receiveUnitId: unitId,
        stockUnitId: unitId,
        baseUnitId: unitId,
        image_name: 'iced_caramel_macchiato.png',
        image_path: 'uploads/iced_caramel_macchiato.png'
      },
      {
        pro_category: createdCats[0].categ_id,
        categoryCategId: createdCats[0].categ_id,
        pro_id: 1002,
        pro_name: 'Hot Cappuccino',
        pro_price: 30000,
        pro_desc: 'Rich espresso topped with a smooth, velvety layer of steamed milk foam and beautiful latte art.',
        pro_status: true,
        validateStockOnSale: false,
        pro_image_path: 'uploads/hot_cappuccino.png',
        cost_price: 9000,
        stock_count: 999,
        minStock: 5,
        isActive: true,
        _category: 'product',
        companyId,
        taxId,
        saleCurrencyId: currencyId,
        costCurrencyId: currencyId,
        receiveUnitId: unitId,
        stockUnitId: unitId,
        baseUnitId: unitId,
        image_name: 'hot_cappuccino.png',
        image_path: 'uploads/hot_cappuccino.png'
      },
      // Teas & Smoothies
      {
        pro_category: createdCats[1].categ_id,
        categoryCategId: createdCats[1].categ_id,
        pro_id: 1003,
        pro_name: 'Iced Matcha Latte',
        pro_price: 38000,
        pro_desc: 'Premium organic Japanese matcha whisked and layered over cold creamy milk and ice.',
        pro_status: true,
        validateStockOnSale: false,
        pro_image_path: 'uploads/iced_matcha_latte.png',
        cost_price: 14000,
        stock_count: 999,
        minStock: 5,
        isActive: true,
        _category: 'product',
        companyId,
        taxId,
        saleCurrencyId: currencyId,
        costCurrencyId: currencyId,
        receiveUnitId: unitId,
        stockUnitId: unitId,
        baseUnitId: unitId,
        image_name: 'iced_matcha_latte.png',
        image_path: 'uploads/iced_matcha_latte.png'
      },
      {
        pro_category: createdCats[1].categ_id,
        categoryCategId: createdCats[1].categ_id,
        pro_id: 1004,
        pro_name: 'Strawberry Smoothie',
        pro_price: 40000,
        pro_desc: 'Thick, creamy smoothie blended with fresh ripe strawberries, milk, and cream swirls.',
        pro_status: true,
        validateStockOnSale: false,
        pro_image_path: 'uploads/strawberry_smoothie.png',
        cost_price: 15000,
        stock_count: 999,
        minStock: 5,
        isActive: true,
        _category: 'product',
        companyId,
        taxId,
        saleCurrencyId: currencyId,
        costCurrencyId: currencyId,
        receiveUnitId: unitId,
        stockUnitId: unitId,
        baseUnitId: unitId,
        image_name: 'strawberry_smoothie.png',
        image_path: 'uploads/strawberry_smoothie.png'
      },
      // Bakery & Pastries
      {
        pro_category: createdCats[2].categ_id,
        categoryCategId: createdCats[2].categ_id,
        pro_id: 1005,
        pro_name: 'Butter Croissant',
        pro_price: 28000,
        pro_desc: 'Freshly baked flaky French butter croissant with a golden crispy exterior and light, airy inside.',
        pro_status: true,
        validateStockOnSale: false,
        pro_image_path: 'uploads/butter_croissant.png',
        cost_price: 10000,
        stock_count: 999,
        minStock: 5,
        isActive: true,
        _category: 'product',
        companyId,
        taxId,
        saleCurrencyId: currencyId,
        costCurrencyId: currencyId,
        receiveUnitId: unitId,
        stockUnitId: unitId,
        baseUnitId: unitId,
        image_name: 'butter_croissant.png',
        image_path: 'uploads/butter_croissant.png'
      },
      {
        pro_category: createdCats[2].categ_id,
        categoryCategId: createdCats[2].categ_id,
        pro_id: 1006,
        pro_name: 'Chocolate Fudge Cake',
        pro_price: 45000,
        pro_desc: 'A rich slice of moist chocolate fudge cake layered with premium dark chocolate ganache.',
        pro_status: true,
        validateStockOnSale: false,
        pro_image_path: 'uploads/chocolate_fudge_cake.png',
        cost_price: 18000,
        stock_count: 999,
        minStock: 5,
        isActive: true,
        _category: 'product',
        companyId,
        taxId,
        saleCurrencyId: currencyId,
        costCurrencyId: currencyId,
        receiveUnitId: unitId,
        stockUnitId: unitId,
        baseUnitId: unitId,
        image_name: 'chocolate_fudge_cake.png',
        image_path: 'uploads/chocolate_fudge_cake.png'
      }
    ];

    for (const p of productsData) {
      const { image_name, image_path: imgPath, ...prodFields } = p;
      const product = await db.product.create(prodFields);
      console.log(`Created Product: ${product.pro_name} (ID: ${product.id}, Pro ID: ${product.pro_id})`);

      await db.image.create({
        pro_id: product.pro_id,
        img_name: image_name,
        img_path: imgPath,
        productId: product.id,
        isActive: true
      });
      console.log(`Created Image Association for: ${product.pro_name}`);
    }

    console.log('\n=============================================');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
    console.log('=============================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ SEEDING FAILED WITH ERROR:', error);
    process.exit(1);
  }
}

run();
