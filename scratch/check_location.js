const mysql = require('mysql2/promise');

async function checkLocations() {
  const connection = await mysql.createConnection({
    host: '150.95.31.23',
    user: 'root',
    password: 'sdat@3480',
    port: 3306,
    database: 'dcommerce_pro_nina_khaithk'
  });

  try {
    console.log('Connected to dcommerce_pro_nina_khaithk!');
    
    // Check location table
    const [locations] = await connection.query('SELECT id, name, isActive FROM location');
    console.log('Locations in DB:', locations);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

checkLocations();
