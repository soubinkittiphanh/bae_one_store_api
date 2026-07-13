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
    
    const showCreate = await conn.query('SHOW CREATE TABLE mainCategory');
    console.log('\n--- CREATE TABLE mainCategory ---');
    console.log(showCreate[0]['Create Table']);
    
    const mainCategories = await conn.query('SELECT * FROM mainCategory');
    console.log('\n--- mainCategory ---');
    console.log(mainCategories);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) conn.end();
    pool.end();
  }
}

run();
