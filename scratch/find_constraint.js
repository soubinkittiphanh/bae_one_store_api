const db = require('../src/models/index.js');

async function findConstraint() {
  try {
    const results = await db.sequelize.query(`
      SELECT * 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE CONSTRAINT_NAME = 'clientaudit_ibfk_65'
    `, { type: db.Sequelize.QueryTypes.SELECT });
    console.log('CONSTRAINT WHERE NAME IS clientaudit_ibfk_65:');
    console.log(results);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findConstraint();
