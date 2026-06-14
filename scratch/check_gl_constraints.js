const db = require('../src/models/index.js');

async function checkGLConstraints() {
  try {
    const dbName = db.sequelize.config.database;
    console.log(`Database name: ${dbName}`);

    // Query constraints for general_ledger table
    const constraints = await db.sequelize.query(`
      SELECT 
        CONSTRAINT_NAME, 
        TABLE_NAME, 
        COLUMN_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = :dbName 
        AND TABLE_NAME = 'general_ledger'
    `, { 
      replacements: { dbName },
      type: db.Sequelize.QueryTypes.SELECT 
    });
    
    console.log('--- Foreign Keys on general_ledger ---');
    console.log(JSON.stringify(constraints, null, 2));

    // Show columns on general_ledger
    const columns = await db.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = :dbName
        AND TABLE_NAME = 'general_ledger'
    `, {
      replacements: { dbName },
      type: db.Sequelize.QueryTypes.SELECT
    });

    console.log('--- Columns on general_ledger ---');
    console.log(JSON.stringify(columns, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkGLConstraints();
