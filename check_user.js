const db = require('./src/models/index.js');

async function checkSchema() {
  try {
    const tableInfo = await db.sequelize.queryInterface.describeTable('user');
    console.log('User table columns:', Object.keys(tableInfo));
    
    const user = await db.user.findOne({ where: { id: 1 } });
    console.log('User raw data (id:1):', user ? user.toJSON() : 'null');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchema();
