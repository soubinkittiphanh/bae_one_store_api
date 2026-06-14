const db = require('../src/models/index.js');

async function checkBankIndexes() {
  try {
    const results = await db.sequelize.query(`
      SHOW INDEX FROM \`bank\`
    `, { type: db.Sequelize.QueryTypes.SELECT });
    console.log('ALL INDEXES ON TABLE bank:');
    console.log(results);
    console.log(`Total indexes count: ${results.length}`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBankIndexes();
