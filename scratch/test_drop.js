const db = require('../src/models/index.js');

async function testDrop() {
  try {
    console.log('Attempting to drop constraint general_ledger_ibfk_3901...');
    await db.sequelize.query(
      'ALTER TABLE general_ledger DROP FOREIGN KEY general_ledger_ibfk_3901', 
      { type: db.Sequelize.QueryTypes.BULKUPDATE }
    );
    console.log('Constraint dropped successfully!');

    console.log('Attempting to drop column chartOfAccountId...');
    await db.sequelize.query(
      'ALTER TABLE general_ledger DROP COLUMN chartOfAccountId', 
      { type: db.Sequelize.QueryTypes.BULKUPDATE }
    );
    console.log('Column chartOfAccountId dropped successfully!');

    process.exit(0);
  } catch (error) {
    console.error('Error executing query:', error);
    process.exit(1);
  }
}

testDrop();
