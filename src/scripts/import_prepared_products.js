const fs = require('fs');
const path = require('path');
const mariadb = require('mariadb');
const dbConfig = require('../config/dbClient').clientDB.pro_sho;

// Helper to parse CSV fields containing quotes or commas
function parseCSV(text) {
  const records = [];
  let record = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      record.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      record.push(cell.trim());
      if (record.length > 1 || record[0] !== '') {
        records.push(record);
      }
      record = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || record.length > 0) {
    record.push(cell.trim());
    records.push(record);
  }
  return records;
}

function parsePrice(val) {
  if (!val) return 0.0;
  const cleaned = val.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0.0 : num;
}

function parseSalePrice(val) {
  if (!val) return 0.0;
  const parts = val.split(',');
  return parsePrice(parts[0]);
}

function cleanField(val) {
  if (!val) return '';
  return val.replace(/\s*Document from ສຸບິນ CBS SHO V2/g, '')
            .replace(/\s*\(Image\)/g, '')
            .trim();
}

async function findOrCreateCategory(conn, categoryName) {
  if (!categoryName) return null;
  const rows = await conn.query('SELECT categ_id FROM category WHERE categ_name = ?', [categoryName]);
  if (rows.length > 0) {
    return Number(rows[0].categ_id);
  }
  // Ensure default mainCategory exists
  let mainCategoryId = null;
  const mainCatRows = await conn.query('SELECT id FROM mainCategory LIMIT 1');
  if (mainCatRows.length > 0) {
    mainCategoryId = Number(mainCatRows[0].id);
  } else {
    const insertMainCat = await conn.query(
      "INSERT INTO mainCategory (categoryName, categoryDesc, isActive, createdAt, updateTimestamp) VALUES ('Default', 'Default main category', 1, NOW(), NOW())"
    );
    mainCategoryId = Number(insertMainCat.insertId);
    console.log(`Created default mainCategory with ID: ${mainCategoryId}`);
  }

  const res = await conn.query(
    'INSERT INTO category (categ_name, categ_desc, isActive, createdAt, updateTimestamp, mainCategoryId) VALUES (?, ?, 1, NOW(), NOW(), ?)',
    [categoryName, `Imported category: ${categoryName}`, mainCategoryId]
  );
  console.log(`Created Category: ${categoryName} (ID: ${res.insertId})`);
  return Number(res.insertId);
}

async function run() {
  const pool = mariadb.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    port: dbConfig.port || 3306,
    connectionLimit: 5
  });

  let conn;

  try {
    conn = await pool.getConnection();
    console.log('Connected to MariaDB database:', dbConfig.database);

    // 1. Delete all old products and associated sizes/cards
    console.log('Cleaning up old products, stock cards, and product sizes...');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE card');
    await conn.query('TRUNCATE TABLE product_size');
    await conn.query('TRUNCATE TABLE product');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Database tables cleaned.');

    // 2. Ensure default userGroup exists
    let groupId;
    const groupRows = await conn.query('SELECT id FROM userGroup LIMIT 1');
    if (groupRows.length > 0) {
      groupId = Number(groupRows[0].id);
    } else {
      const groupRes = await conn.query(
        "INSERT INTO userGroup (name, code, homePage, ticketCancel, isActive, createdAt, updateTimestamp) VALUES ('Admin', 'ADMIN', '/home', 1, 1, NOW(), NOW())"
      );
      groupId = Number(groupRes.insertId);
      console.log(`Created default userGroup with ID: ${groupId}`);
    }

    // 3. Ensure default user exists
    let inputterId;
    const userRows = await conn.query('SELECT id FROM user LIMIT 1');
    if (userRows.length > 0) {
      inputterId = Number(userRows[0].id);
    } else {
      const userRes = await conn.query(
        "INSERT INTO user (cus_id, cus_pass, cus_name, cus_active, isActive, groupId, createdAt, updateTimestamp) VALUES ('1000', '1000', 'Admin', 1, 1, ?, NOW(), NOW())",
        [groupId]
      );
      inputterId = Number(userRes.insertId);
      console.log(`Created default user with ID: ${inputterId}`);
    }

    // 4. Ensure all standard Sizes exist
    const sizeMap = {
      'XS': { id: null, order: 1, colIdx: 3 },
      'S': { id: null, order: 2, colIdx: 4 },
      'M': { id: null, order: 3, colIdx: 5 },
      'L': { id: null, order: 6, colIdx: 6 },
      'XL': { id: null, order: 7, colIdx: 7 }
    };
    for (const sizeName of Object.keys(sizeMap)) {
      const sizeRows = await conn.query('SELECT id FROM size WHERE size_name = ? OR size_code = ?', [sizeName, sizeName]);
      if (sizeRows.length > 0) {
        sizeMap[sizeName].id = sizeRows[0].id;
      } else {
        const insertRes = await conn.query(
          'INSERT INTO size (size_name, size_code, size_order, isActive, inputter, created_at, updated_at) VALUES (?, ?, ?, 1, ?, NOW(), NOW())',
          [sizeName, sizeName, sizeMap[sizeName].order, inputterId]
        );
        sizeMap[sizeName].id = Number(insertRes.insertId);
      }
    }
    console.log('Sizes validated.');

    let currentProId = 1000;

    // 5. Parse Qty counts from original sheet content for File 1
    const originalSheetPath = '/Users/soubinkittiphanh/.gemini/antigravity-ide/brain/0445a29b-277a-41c0-9ce3-ba92fa7b4bdf/.system_generated/steps/43/content.md';
    const sheetContent = fs.readFileSync(originalSheetPath, 'utf8');
    const sheetCsvContent = sheetContent.split('---')[1] || sheetContent;
    const sheetRecords = parseCSV(sheetCsvContent);
    
    // Map of key `${modelNo}_${colorName}_${sizeName}` => qty
    const qtyMap = {};
    for (let i = 4; i < sheetRecords.length; i++) {
      const row = sheetRecords[i];
      if (!row || row.length < 9) continue;
      const model = row[0] ? row[0].trim() : '';
      const color = row[2] ? row[2].trim().toLowerCase() : '';
      if (!model) continue;
      
      for (const [sizeName, sizeInfo] of Object.entries(sizeMap)) {
        const val = row[sizeInfo.colIdx];
        if (val) {
          const qty = parseInt(val.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(qty) && qty > 0) {
            qtyMap[`${model}_${color}_${sizeName}`] = qty;
          }
        }
      }
    }

    // 6. Import File 1 Variants
    console.log('Importing File 1 Product Variants...');
    const variantsCsvPath = path.join(__dirname, 'product_variants.csv');
    const variantsContent = fs.readFileSync(variantsCsvPath, 'utf8');
    const variantRecords = parseCSV(variantsContent);

    for (let i = 1; i < variantRecords.length; i++) {
      const row = variantRecords[i];
      if (row.length < 6) continue;
      
      const modelNo = row[0];
      const colorName = row[1];
      const sizeName = row[2];
      const barcode = row[3];
      const costPrice = parseFloat(row[4]);
      const salePrice = parseSalePrice(row[5]);

      const key = `${modelNo}_${colorName.toLowerCase()}_${sizeName}`;
      const qty = qtyMap[key] || 0;

      // Find or create Color
      let colorId;
      const colorCode = colorName.replace(/[^a-zA-Z]/g, '').slice(0, 10).toUpperCase() || 'NA';
      const colorRows = await conn.query('SELECT id FROM color WHERE color_name = ? OR color_code = ?', [colorName, colorCode]);
      if (colorRows.length > 0) {
        colorId = colorRows[0].id;
      } else {
        const insertRes = await conn.query(
          'INSERT INTO color (color_name, color_code, isActive, inputter, created_at, updated_at) VALUES (?, ?, 1, ?, NOW(), NOW())',
          [colorName, colorCode, inputterId]
        );
        colorId = Number(insertRes.insertId);
      }

      const productName = `${modelNo} - ${colorName} - ${sizeName}`;
      console.log(`Creating variant: Name="${productName}", Barcode="${barcode}", Stock=${qty}`);

      // Create Product
      const productRes = await conn.query(
        `INSERT INTO product (
          pro_category, categoryCategId, pro_id, pro_name, pro_price, pro_desc, pro_status, 
          retail_cost_percent, cost_price, stock_count, minStock, barCode, 
          isActive, _category, validateStockOnSale, companyId, stockUnitId, baseUnitId, costCurrencyId, saleCurrencyId, createdAt, updateTimestamp
        ) VALUES (32, 32, ?, ?, ?, ?, 1, 0, ?, ?, 0, ?, 1, 'product', 1, 1, 1, 1, 6, 6, NOW(), NOW())`,
        [currentProId, productName, salePrice, `Imported customer product variant. Model: ${modelNo}, Color: ${colorName}, Size: ${sizeName}`, costPrice, qty, barcode]
      );
      
      const productId = Number(productRes.insertId);

      // Create ProductSize configuration
      await conn.query(
        'INSERT INTO product_size (sizeName, price, productId, createdAt, updateTimestamp) VALUES (?, ?, ?, NOW(), NOW())',
        [sizeName, salePrice, productId]
      );

      // Create Stock Cards
      if (qty > 0) {
        const sessionId = `${Date.now()}_1`;
        for (let j = 0; j < qty; j++) {
          await conn.query(
            `INSERT INTO card (
              card_type_code, product_id, productId, cost, costLCY, exchangeRate, 
              card_number, card_isused, locking_session_id, card_input_date, 
              inputter, isActive, colorId, sizeId, stockCardQty, update_time, update_time_new, createdAt, updateTimestamp
            ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, NOW(), ?, 1, ?, ?, 1, NOW(), NOW(), NOW(), NOW())`,
            [
              1, // Stock in type
              currentProId,
              productId,
              costPrice,
              costPrice,
              `${currentProId}_${sizeName}_${sessionId}_${j + 1}`,
              sessionId,
              inputterId,
              colorId,
              sizeMap[sizeName].id
            ]
          );
        }
      }

      currentProId++;
    }

    // 7. Import File 2 Items
    console.log('Importing File 2 Products...');
    const file2CsvPath = path.join(__dirname, 'product_2_extract.csv');
    const file2Content = fs.readFileSync(file2CsvPath, 'utf8');
    const file2Records = parseCSV(file2Content);

    const seenFile2Items = new Set();

    for (let i = 1; i < file2Records.length; i++) {
      const row = file2Records[i];
      if (row.length < 3) continue;

      const itemNameRaw = row[0];
      const purchasePriceThbRaw = row[1];
      const salePriceThbRaw = row[2];
      const barcodeRaw = row[3] || '';

      const itemName = cleanField(itemNameRaw);
      if (!itemName || itemName === 'Name / Description') continue; // skip header if duplicated

      const purchasePriceThb = parseFloat(cleanField(purchasePriceThbRaw));
      const salePriceThb = parseFloat(cleanField(salePriceThbRaw));
      const barcode = cleanField(barcodeRaw); // will be blank/empty string

      const key = `${itemName}_${purchasePriceThb}_${salePriceThb}`;
      if (seenFile2Items.has(key)) {
        console.log(`Skipping duplicate File 2 item: "${itemName}"`);
        continue;
      }
      seenFile2Items.add(key);

      // Design categories based on item names
      let categoryName = 'Sports & Yoga';
      if (itemName.toLowerCase().includes('socks')) {
        categoryName = 'Socks';
      } else if (itemName.toLowerCase().includes('mat') || itemName.toLowerCase().includes('dumbbell')) {
        categoryName = 'Yoga & Fitness';
      }

      const categoryId = await findOrCreateCategory(conn, categoryName);

      console.log(`Creating File 2 product: Name="${itemName}", Barcode="${barcode}", Category="${categoryName}"`);

      // Create Product (costCurrencyId = 6 for THB, saleCurrencyId = 6 for THB)
      const productRes = await conn.query(
        `INSERT INTO product (
          pro_category, categoryCategId, pro_id, pro_name, pro_price, pro_desc, pro_status, 
          retail_cost_percent, cost_price, stock_count, minStock, barCode, 
          isActive, _category, validateStockOnSale, companyId, stockUnitId, baseUnitId, costCurrencyId, saleCurrencyId, createdAt, updateTimestamp
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, 1, 0, ?, 1, 'product', 1, 1, 1, 1, 6, 6, NOW(), NOW())`,
        [categoryId, categoryId, currentProId, itemName, salePriceThb, `Imported product from File 2. Category: ${categoryName}`, purchasePriceThb, barcode]
      );

      const productId = Number(productRes.insertId);

      // Create 1 stock card for this product
      const sessionId = `${Date.now()}_2`;
      await conn.query(
        `INSERT INTO card (
          card_type_code, product_id, productId, cost, costLCY, exchangeRate, 
          card_number, card_isused, locking_session_id, card_input_date, 
          inputter, isActive, stockCardQty, update_time, update_time_new, createdAt, updateTimestamp
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, NOW(), ?, 1, 1, NOW(), NOW(), NOW(), NOW())`,
        [
          1, // Stock in type
          currentProId,
          productId,
          purchasePriceThb,
          purchasePriceThb,
          `${currentProId}_default_${sessionId}_1`,
          sessionId,
          inputterId
        ]
      );

      currentProId++;
    }

    console.log('Successfully completed the import process for all items!');
    process.exit(0);
  } catch (error) {
    console.error('Error during import process:', error);
    process.exit(1);
  } finally {
    if (conn) conn.end();
    pool.end();
  }
}

run();
