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

function parseCount(val) {
  if (!val) return 0;
  const num = parseInt(val.replace(/[^0-9]/g, ''));
  return isNaN(num) ? 0 : num;
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

async function run() {
  const csvPath = '/Users/soubinkittiphanh/.gemini/antigravity-ide/brain/0445a29b-277a-41c0-9ce3-ba92fa7b4bdf/.system_generated/steps/43/content.md';
  
  // Create MariaDB pool using clientDB configuration
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
    console.log('Reading CSV file from:', csvPath);
    const content = fs.readFileSync(csvPath, 'utf8');
    
    // Skip markdown metadata prefix
    const parts = content.split('---');
    const csvContent = parts.length > 1 ? parts[1] : content;
    
    const records = parseCSV(csvContent);
    console.log(`Parsed ${records.length} CSV rows.`);
    
    const dataRows = [];
    for (let i = 3; i < records.length; i++) {
      const row = records[i];
      if (row.length > 0 && row[0] !== '') {
        dataRows.push(row);
      }
    }
    
    console.log(`Found ${dataRows.length} valid product rows to import.`);
    
    // Connect to database
    conn = await pool.getConnection();
    console.log('Successfully connected to database via native driver.');
    
    // Start transaction
    await conn.beginTransaction();
    console.log('Transaction started.');

    // Clean up orphaned cards if products are 0
    const prodCountRes = await conn.query('SELECT COUNT(*) AS count FROM product');
    const existingProdCount = Number(prodCountRes[0].count);
    if (existingProdCount === 0) {
      console.log('No products found in DB. Cleaning up orphaned stock cards and product size mappings...');
      await conn.query('DELETE FROM card');
      await conn.query('DELETE FROM product_size');
    }

    // Ensure default userGroup exists
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

    // Ensure default user exists
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

    // Query last product pro_id
    const maxIdRows = await conn.query('SELECT MAX(pro_id) AS max_id FROM product');
    let currentProId = maxIdRows[0].max_id ? parseInt(maxIdRows[0].max_id) + 1 : 1000;
    console.log(`Next product pro_id will be: ${currentProId}`);
    
    const sizeMap = {
      'XS': { id: null, order: 1, colIdx: 3 },
      'S': { id: null, order: 2, colIdx: 4 },
      'M': { id: null, order: 3, colIdx: 5 },
      'L': { id: null, order: 4, colIdx: 6 },
      'XL': { id: null, order: 5, colIdx: 7 }
    };
    
    // Ensure all standard Sizes exist in the database (lookup by name OR code)
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
    console.log('Sizes validated/created.');

    for (const row of dataRows) {
      const modelNo = row[0];
      const colorName = row[2] || 'N/A';
      const costPrice = parsePrice(row[12]);
      const salePrice = parseSalePrice(row[13]);
      
      // Find or create Color (lookup by name OR code)
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

      // Loop through each size count. If count > 0, we create a separate product and size variant.
      for (const [sizeName, sizeInfo] of Object.entries(sizeMap)) {
        const count = parseCount(row[sizeInfo.colIdx]);
        if (count === 0) continue; // Skip if no stock for this size
        
        const productName = `${modelNo} - ${colorName} - ${sizeName}`;
        const barCode = `${modelNo}-${sizeName}`;
        
        console.log(`Creating variant: Name=${productName}, Barcode=${barCode}, Stock=${count}`);
        
        // Create Product
        const productRes = await conn.query(
          `INSERT INTO product (
            pro_category, pro_id, pro_name, pro_price, pro_desc, pro_status, 
            retail_cost_percent, cost_price, stock_count, minStock, barCode, 
            isActive, _category, validateStockOnSale, companyId, createdAt, updateTimestamp
          ) VALUES (null, ?, ?, ?, ?, 1, 0, ?, ?, 0, ?, 1, 'product', 1, null, NOW(), NOW())`,
          [currentProId, productName, salePrice, `Imported customer product variant. Model: ${modelNo}, Color: ${colorName}, Size: ${sizeName}`, costPrice, count, barCode]
        );
        
        const productId = Number(productRes.insertId);
        
        // Create ProductSize configuration for this product
        await conn.query(
          'INSERT INTO product_size (sizeName, price, productId, createdAt, updateTimestamp) VALUES (?, ?, ?, NOW(), NOW())',
          [sizeName, salePrice, productId]
        );
        
        // Create stock Cards for inventory
        const sessionId = `${Date.now()}_1`;
        for (let i = 0; i < count; i++) {
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
              `${currentProId}_${sizeName}_${sessionId}_${i + 1}`,
              sessionId,
              inputterId,
              colorId,
              sizeInfo.id
            ]
          );
        }
        console.log(`✓ Created variant ID: ${productId}, pro_id: ${currentProId} with ${count} stock cards.`);
        
        // Increment pro_id for next variant
        currentProId++;
      }
    }

    // Commit transaction
    await conn.commit();
    console.log('Transaction committed successfully.');
    console.log('Successfully completed the import process!');
    process.exit(0);
  } catch (error) {
    console.error('Error during import process:', error);
    if (conn) {
      try {
        await conn.rollback();
        console.log('Transaction rolled back.');
      } catch (rErr) {
        console.error('Error during rollback:', rErr);
      }
    }
    process.exit(1);
  } finally {
    if (conn) conn.end();
    pool.end();
  }
}

run();
