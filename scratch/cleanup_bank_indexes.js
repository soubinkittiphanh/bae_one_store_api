const db = require('../src/models/index.js');

async function cleanupBankIndexes() {
  try {
    const indexes = await db.sequelize.query(`
      SHOW INDEX FROM \`bank\`
    `, { type: db.Sequelize.QueryTypes.SELECT });

    // Filter for duplicate indexes on 'code' column that are NOT the primary/main 'code' or 'PRIMARY'
    // Specifically, index names like 'code_2', 'code_3', etc.
    const dupIndexes = [...new Set(
      indexes
        .map(idx => idx.Key_name)
        .filter(name => name.startsWith('code_') && name !== 'code')
    )];

    console.log(`Found ${dupIndexes.length} duplicate index constraints to drop:`, dupIndexes);

    for (const idxName of dupIndexes) {
      console.log(`Dropping index \`${idxName}\` from \`bank\` table...`);
      try {
        await db.sequelize.query(`
          ALTER TABLE \`bank\` DROP INDEX \`${idxName}\`
        `, { type: db.Sequelize.QueryTypes.RAW });
        console.log(`  -> Dropped \`${idxName}\` successfully.`);
      } catch (err) {
        console.error(`  -> Failed to drop index \`${idxName}\`:`, err.message);
      }
    }

    console.log('\nBank indexes cleanup completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning up bank indexes:', error);
    process.exit(1);
  }
}

// Wait 5 seconds to let the automatic index.js async sync run (or crash) before we execute our cleanup
console.log('Waiting 5 seconds for initial index.js load to settle before running index cleanup...');
setTimeout(cleanupBankIndexes, 5000);
