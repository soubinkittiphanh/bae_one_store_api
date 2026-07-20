const mysql = require('mysql2/promise');

async function testConnection() {
  try {
    const connection = await mysql.createConnection({
      host: '150.95.31.23',
      user: 'root',
      password: 'sdat@3480',
      port: 3306
    });

    console.log('Connected to DB server successfully!');
    const [rows] = await connection.query('SHOW DATABASES');
    console.log('Databases:', rows.map(r => r.Database));
    await connection.end();
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

testConnection();
