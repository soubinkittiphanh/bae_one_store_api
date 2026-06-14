const db = require('../src/models/index.js');

async function fixOrphanedReferences() {
  try {
    const references = [
      {
        fkColumn: 'saleHeaderId',
        refTable: 'saleHeader',
        refColumn: 'id'
      },
      {
        fkColumn: 'bankAccountId',
        refTable: 'bankAccount',
        refColumn: 'id'
      }
    ];

    for (const ref of references) {
      console.log(`\n=== Scanning for orphaned ${ref.fkColumn} referencing ${ref.refTable}(${ref.refColumn}) ===`);

      // 1. Find all tables in dcommerce_dev that have fkColumn
      const tables = await db.sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = 'dcommerce_dev' 
        AND COLUMN_NAME = :fkColumn
      `, {
        replacements: { fkColumn: ref.fkColumn },
        type: db.Sequelize.QueryTypes.SELECT
      });

      for (const t of tables) {
        const tableName = t.TABLE_NAME;
        
        // Skip view/system tables if any, though INFORMATION_SCHEMA.COLUMNS filters base tables usually
        console.log(`Checking table: ${tableName}`);

        // Check if there are orphaned rows
        const checkQuery = `
          SELECT COUNT(*) as count 
          FROM \`${tableName}\` 
          WHERE \`${ref.fkColumn}\` IS NOT NULL 
          AND \`${ref.fkColumn}\` NOT IN (SELECT \`${ref.refColumn}\` FROM \`${ref.refTable}\`)
        `;

        try {
          const checkResult = await db.sequelize.query(checkQuery, {
            type: db.Sequelize.QueryTypes.SELECT
          });

          const count = checkResult[0].count;
          if (count > 0) {
            console.log(`  -> Found ${count} orphaned rows in \`${tableName}\`!`);
            
            // Fix orphaned rows by setting the fk to NULL
            const fixQuery = `
              UPDATE \`${tableName}\` 
              SET \`${ref.fkColumn}\` = NULL 
              WHERE \`${ref.fkColumn}\` IS NOT NULL 
              AND \`${ref.fkColumn}\` NOT IN (SELECT \`${ref.refColumn}\` FROM \`${ref.refTable}\`)
            `;

            console.log(`  -> Executing fix for \`${tableName}\`...`);
            const updateResult = await db.sequelize.query(fixQuery, {
              type: db.Sequelize.QueryTypes.UPDATE
            });
            console.log(`  -> Fix completed. Result:`, updateResult);
          } else {
            console.log(`  -> 0 orphaned rows found in \`${tableName}\`.`);
          }
        } catch (tblError) {
          console.error(`  -> Error checking/fixing table \`${tableName}\`:`, tblError.message);
        }
      }
    }

    console.log('\n=== Database Correction Completed ===');
    console.log('You can now run "npm run dev" or let the server restart.');
    process.exit(0);
  } catch (error) {
    console.error('Global Error in fixOrphanedReferences:', error);
    process.exit(1);
  }
}

// We wrap it in a short delay to ensure index.js initial automatic async synchronization (which runs when requiring index.js)
// has finished, or at least failed, so we don't interfere with it during our cleanup.
console.log('Waiting 5 seconds for initial index.js load to settle before running database repair...');
setTimeout(fixOrphanedReferences, 5000);
