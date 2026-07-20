const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');
const path = require('path');

const xlsxFilePath = path.join('/Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_web', 'nina khaithuek.xlsx');

function getCellValue(cell) {
  if (!cell) return null;
  if (typeof cell.value === 'object' && cell.value !== null) {
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

async function verify() {
  const connection = await mysql.createConnection({
    host: '150.95.31.23',
    user: 'root',
    password: 'sdat@3480',
    port: 3306,
    database: 'dcommerce_pro_nina_khaithk'
  });

  try {
    // 1. Calculate expected totals from the Excel sheet
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxFilePath);
    const worksheet = workbook.worksheets[0];
    
    const headers = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(getCellValue(cell) || '').trim();
    });

    let totalExpectedProducts = 0;
    let totalExpectedStock = 0;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      totalExpectedProducts++;

      // Find 'Stock' column value
      let stockVal = 0;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (headers[colNumber] === 'Stock') {
          stockVal = parseInt(getCellValue(cell) || 0);
        }
      });
      totalExpectedStock += stockVal;
    });

    console.log('--- EXCEL SHEET TOTALS ---');
    console.log(`Expected Products: ${totalExpectedProducts}`);
    console.log(`Expected Stock (Sum): ${totalExpectedStock}`);

    // 2. Query actual totals in database
    const [[prodCountRow]] = await connection.query('SELECT COUNT(*) as count FROM product');
    const [[cardCountRow]] = await connection.query('SELECT COUNT(*) as count FROM card WHERE card_isused = 0 AND saleLineId IS NULL AND isActive = 1');
    const [[stockCountSumRow]] = await connection.query('SELECT SUM(stock_count) as sum FROM product');

    console.log('\n--- DATABASE ACTUAL TOTALS ---');
    console.log(`Actual Products in DB: ${prodCountRow.count}`);
    console.log(`Actual Cards in DB: ${cardCountRow.count}`);
    console.log(`Sum of stock_count in product table: ${stockCountSumRow.sum}`);

    // 3. Comparison
    console.log('\n--- COMPARISON RESULTS ---');
    if (prodCountRow.count === totalExpectedProducts) {
      console.log('✅ Product count matches Excel!');
    } else {
      console.log('❌ Product count mismatch!');
    }

    if (cardCountRow.count === totalExpectedStock) {
      console.log('✅ Stock card count matches Excel!');
    } else {
      console.log('❌ Stock card count mismatch!');
    }

    if (parseInt(stockCountSumRow.sum) === totalExpectedStock) {
      console.log('✅ Synchronized stock_count sum matches Excel!');
    } else {
      console.log('❌ Synchronized stock_count sum mismatch!');
    }

  } catch (error) {
    console.error('Verification failed with error:', error);
  } finally {
    await connection.end();
  }
}

verify();
