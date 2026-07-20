const mysql = require('mysql2/promise');

async function checkProducts() {
  const connection = await mysql.createConnection({
    host: '150.95.31.23',
    user: 'root',
    password: 'sdat@3480',
    port: 3306,
    database: 'dcommerce_pro_nina_khaithk'
  });

  try {
    console.log('Connected to dcommerce_pro_nina_khaithk!');
    
    const [products] = await connection.query('SELECT id, pro_id, pro_name, product_code, barCode, cost_price, pro_price, companyId, pro_category FROM product LIMIT 5');
    console.log('Existing products:', products);

    const [maxProId] = await connection.query('SELECT MAX(pro_id) as max_pro_id FROM product');
    console.log('Max pro_id:', maxProId[0]);

    const [count] = await connection.query('SELECT COUNT(*) as count FROM product');
    console.log('Total products count:', count[0].count);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

checkProducts();
