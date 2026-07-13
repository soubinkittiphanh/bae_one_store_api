const mariadb = require('mariadb');
const dbConfig = require('../src/config/dbClient').clientDB.pro_sho;

async function run() {
  const pool = mariadb.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    port: dbConfig.port || 3306,
    connectionLimit: 1
  });
  
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Connected to DB:', dbConfig.database);
    
    // Check unitModel
    try {
      const units = await conn.query('SELECT * FROM unitModel');
      console.log('\n--- unitModel ---');
      console.log(units);
    } catch (e) {
      console.log('Error querying unitModel:', e.message);
    }

    // Check company
    try {
      const companies = await conn.query('SELECT * FROM company');
      console.log('\n--- company ---');
      console.log(companies);
    } catch (e) {
      console.log('Error querying company:', e.message);
    }

    // Check category
    try {
      const categories = await conn.query('SELECT * FROM category');
      console.log('\n--- category ---');
      console.log(categories);
    } catch (e) {
      console.log('Error querying category:', e.message);
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) conn.end();
    pool.end();
  }
}

run();
