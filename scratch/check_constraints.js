const db = require('../src/models/index.js');

async function checkConstraints() {
  try {
    const results = await db.sequelize.query(`
      SELECT * 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = 'dcommerce_dev' 
      AND TABLE_NAME IN ('ClientAudit', 'clientaudit')
    `, { type: db.Sequelize.QueryTypes.SELECT });
    console.log('TABLE CONSTRAINTS:');
    console.log(results);

    const keyUsage = await db.sequelize.query(`
      SELECT * 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = 'dcommerce_dev' 
      AND TABLE_NAME IN ('ClientAudit', 'clientaudit')
    `, { type: db.Sequelize.QueryTypes.SELECT });
    console.log('\nKEY COLUMN USAGE:');
    console.log(keyUsage);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkConstraints();
