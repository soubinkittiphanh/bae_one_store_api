const mysql = require('mysql2/promise');

async function checkStockDb() {
  const connection = await mysql.createConnection({
    host: '150.95.31.23',
    user: 'root',
    password: 'sdat@3480',
    port: 3306,
    database: 'dcommerce_pro_nina_khaithk'
  });

  try {
    console.log('Connected to dcommerce_pro_nina_khaithk!');
    
    // Describe card table
    const [cols] = await connection.query('DESCRIBE card');
    console.log('\nColumns of card table:');
    console.table(cols.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default, Extra: c.Extra })));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

checkStockDb();
