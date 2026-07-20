// Set database env variable before loading models config
process.env.DB_NAME = 'dcommerce_pro_nina_khaithk';

const ExcelJS = require('exceljs');
const path = require('path');
const db = require('../src/models');

const xlsxFilePath = path.join('/Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_web', 'nina khaithuek.xlsx');

// Helper to get clean string or number from cell
function getCellValue(cell) {
  if (!cell) return null;
  if (typeof cell.value === 'object' && cell.value !== null) {
    // Handle rich text or formula objects
    if (cell.value.richText) {
      return cell.value.richText.map(t => t.text).join('');
    }
    if (cell.value.result !== undefined) {
      return cell.value.result;
    }
    return cell.value.text || null;
  }
  return cell.value;
}

async function importProducts() {
  console.log('Starting product import from:', xlsxFilePath);
  
  // 1. Read Excel file using ExcelJS
  const data = [];
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxFilePath);
    const worksheet = workbook.worksheets[0];
    console.log(`Successfully loaded worksheet: ${worksheet.name}`);

    // Map headers to indexes
    const headers = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(getCellValue(cell) || '').trim();
    });

    console.log('Detected Headers:', headers.filter(Boolean));

    // Read data rows starting from row 2
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip headers
      
      const rowData = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerName = headers[colNumber];
        if (headerName) {
          rowData[headerName] = getCellValue(cell);
        }
      });
      data.push(rowData);
    });

    console.log(`Successfully read Excel sheet. Found ${data.length} records.`);
  } catch (err) {
    console.error('Failed to read Excel file:', err);
    return;
  }

  // 2. Perform validations
  const uniqueIds = new Set();
  const duplicateIds = [];
  const invalidRows = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const id = parseInt(row['ID']);
    const name = row['Product Name'];

    if (isNaN(id) || id <= 0) {
      invalidRows.push({ index: i + 2, reason: 'Invalid or missing numeric ID', row });
      continue;
    }

    if (!name || String(name).trim() === '') {
      invalidRows.push({ index: i + 2, reason: 'Missing Product Name', row });
      continue;
    }

    if (uniqueIds.has(id)) {
      duplicateIds.push(id);
    } else {
      uniqueIds.add(id);
    }
  }

  if (invalidRows.length > 0) {
    console.error('Validation failed: Found invalid rows:');
    console.error(JSON.stringify(invalidRows, null, 2));
    return;
  }

  if (duplicateIds.length > 0) {
    console.error('Validation failed: Duplicate Excel ID values found:', duplicateIds);
    return;
  }

  console.log('Validation passed: All rows are valid and unique.');

  // 3. Database operations inside transaction
  const transaction = await db.sequelize.transaction();
  try {
    // Check if there are already products in the DB (just in case)
    const existingCount = await db.product.count({ transaction });
    if (existingCount > 0) {
      console.warn(`Warning: There are already ${existingCount} products in the database!`);
    }

    console.log('Inserting products and stock cards...');
    let productsInserted = 0;
    let cardsInserted = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const pro_id = parseInt(row['ID']);
      const pro_name = String(row['Product Name'] || '').trim();
      const product_code = row['Product Code'] ? String(row['Product Code']).trim() : null;
      const barCode = row['Barcode'] ? String(row['Barcode']).trim() : null;
      const cost_price = parseFloat(row['Cost Price'] || 0);
      const pro_price = parseFloat(row['Base Price'] || 0);
      const pro_desc = row['Product Description'] ? String(row['Product Description']).trim() : pro_name;
      const minStock = parseInt(row['Minimum Stock'] || 0);
      const stock = parseInt(row['Stock'] || 0);

      // Create product payload
      const productPayload = {
        pro_id,
        pro_name,
        pro_price,
        pro_desc,
        pro_status: true,
        cost_price,
        minStock,
        barCode,
        isActive: true,
        _category: 'product',
        receiveUnitId: 1, // Piece
        stockUnitId: 1, // Piece
        baseUnitId: 1, // Piece
        costCurrencyId: 1, // LAK
        saleCurrencyId: 1, // LAK
        companyId: 1, // ນິນ່າ ຂາຍຖືກ
        pro_category: 26, // ອື່ນໆ
        categoryCategId: 26, // ອື່ນໆ
        duration_minutes: 0,
        validateStockOnSale: false,
        product_code,
        createdAt: new Date(),
        updateTimestamp: new Date()
      };

      // Insert product
      const product = await db.product.create(productPayload, { transaction });
      productsInserted++;

      // Insert stock cards if stock > 0
      if (stock > 0) {
        const cardsPayload = [];
        const lockingSessionId = Date.now();
        const exchangeRate = 1; // LAK rate is 1

        for (let s = 0; s < stock; s++) {
          // Generate unique card_number matching the pattern
          const cardSequenceNumber = Date.now().toString() + Math.floor(Math.random() * 100000).toString().padStart(5, '0') + s;
          
          cardsPayload.push({
            card_type_code: 10010, // Stock adjustment in
            product_id: pro_id, // the unique numeric spreadsheet ID
            productId: product.id, // the primary key auto-increment ID
            cost: cost_price,
            costLCY: cost_price * exchangeRate,
            exchangeRate: exchangeRate,
            card_number: cardSequenceNumber,
            card_isused: 0,
            locking_session_id: String(lockingSessionId),
            card_input_date: new Date(),
            inputter: 1, // Admin
            update_user: 1,
            update_time: new Date(),
            update_time_new: new Date(),
            isActive: true,
            currencyId: 1, // LAK
            locationId: 1 // ສາງ ນິນ່າ ຂາຍຖືກ
          });
        }

        await db.card.bulkCreate(cardsPayload, { transaction });
        cardsInserted += stock;
      }
    }

    console.log(`Committing transaction...`);
    await transaction.commit();
    console.log('Transaction committed successfully.');

    // 4. Update product table stock_count values
    console.log('Updating product stock_count values in database...');
    const syncSql = `
      UPDATE product pro
      LEFT JOIN (
          SELECT productId, COUNT(card_number) AS card_count
          FROM card
          WHERE card_isused = 0 
            AND saleLineId IS NULL 
            AND isActive = 1
          GROUP BY productId
      ) proc ON proc.productId = pro.id
      SET pro.stock_count = IFNULL(proc.card_count, 0);
    `;
    await db.sequelize.query(syncSql);
    console.log('Stock counts synchronized successfully.');

    console.log('\n--- Import Summary ---');
    console.log(`Total Products Inserted: ${productsInserted}`);
    console.log(`Total Stock Cards Inserted: ${cardsInserted}`);
    console.log('----------------------');

  } catch (error) {
    console.error('Error during import, rolling back...', error);
    try {
      await transaction.rollback();
      console.log('Transaction rolled back successfully.');
    } catch (rbErr) {
      console.error('Failed to rollback transaction:', rbErr);
    }
  } finally {
    if (db.sequelize) await db.sequelize.close();
    if (db.centralSequelize) await db.centralSequelize.close();
  }
}

importProducts();
