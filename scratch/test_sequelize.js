// Set database env variable before loading config
process.env.DB_NAME = 'dcommerce_pro_nina_khaithk';

const db = require('../src/models');

async function testSequelize() {
  try {
    const products = await db.product.findAll({ limit: 5 });
    console.log('Successfully connected to DB using Sequelize!');
    console.log('Products:', products);
  } catch (error) {
    console.error('Error querying via Sequelize:', error);
  } finally {
    if (db.sequelize) await db.sequelize.close();
    if (db.centralSequelize) await db.centralSequelize.close();
  }
}

testSequelize();
