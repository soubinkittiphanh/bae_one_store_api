const db = require('../src/models/index.js');

async function run() {
  try {
    const results1 = await db.sequelize.query("SHOW TABLES LIKE 'salePayment'", { type: db.Sequelize.QueryTypes.SELECT });
    console.log('salePayment exists:', results1.length > 0);

    const results2 = await db.sequelize.query("SHOW TABLES LIKE 'shipping_checkout_batches'", { type: db.Sequelize.QueryTypes.SELECT });
    console.log('shipping_checkout_batches exists:', results2.length > 0);

    if (results1.length > 0) {
      const createSalePayment = await db.sequelize.query("SHOW CREATE TABLE salePayment", { type: db.Sequelize.QueryTypes.SELECT });
      console.log('\n--- CREATE TABLE salePayment ---');
      console.log(createSalePayment[0]['Create Table'] || createSalePayment[0]);
    }

    if (results2.length > 0) {
      const createBatches = await db.sequelize.query("SHOW CREATE TABLE shipping_checkout_batches", { type: db.Sequelize.QueryTypes.SELECT });
      console.log('\n--- CREATE TABLE shipping_checkout_batches ---');
      console.log(createBatches[0]['Create Table'] || createBatches[0]);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
