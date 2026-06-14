const fs = require('fs');
const path = require('path');
const { sequelize } = require('../models/database');
const { QueryTypes } = require('sequelize');
const logger = require('../api/logger');

/**
 * Dynamically drops the foreign key constraints and the column chartOfAccountId,
 * as well as other deprecated columns from general_ledger table.
 * This needs to be dynamic because the foreign key constraint names (like general_ledger_ibfk_XXXX)
 * vary across different client databases.
 */
const dropGeneralLedgerDeprecatedFields = async () => {
  try {
    const dbName = sequelize.config.database;
    logger.info(`Checking general_ledger deprecated fields in database: ${dbName}`);

    // Helper to check if general_ledger has a specific column
    const hasColumn = async (colName) => {
      const result = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = :dbName 
          AND LOWER(TABLE_NAME) = 'general_ledger' 
          AND LOWER(COLUMN_NAME) = :colName
      `, {
        replacements: { dbName, colName: colName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    // 1. Process chartOfAccountId if it exists
    if (await hasColumn('chartOfAccountId')) {
      logger.info("Column chartOfAccountId exists. Dropping related foreign keys...");
      
      // Find the foreign key constraint names for chartOfAccountId
      const constraints = await sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = :dbName
          AND LOWER(TABLE_NAME) = 'general_ledger'
          AND LOWER(COLUMN_NAME) = 'chartofaccountid'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `, {
        replacements: { dbName },
        type: QueryTypes.SELECT
      });

      // Drop the constraints
      for (const row of constraints) {
        const constraintName = row.CONSTRAINT_NAME;
        logger.info(`Dropping dynamic constraint ${constraintName} on general_ledger...`);
        try {
          await sequelize.query(
            `ALTER TABLE general_ledger DROP FOREIGN KEY \`${constraintName}\``,
            { type: QueryTypes.BULKUPDATE }
          );
        } catch (err) {
          logger.warn(`Failed to drop constraint ${constraintName}: ${err.message}`);
        }
      }

      // Drop the column chartOfAccountId
      try {
        logger.info("Dropping column chartOfAccountId from general_ledger...");
        await sequelize.query(
          "ALTER TABLE general_ledger DROP COLUMN chartOfAccountId",
          { type: QueryTypes.BULKUPDATE }
        );
      } catch (err) {
        logger.warn(`Could not drop column chartOfAccountId: ${err.message}`);
      }
    } else {
      logger.info("Column chartOfAccountId does not exist on general_ledger. Skipping constraint and column drops.");
    }

    // 2. Drop column amount if it exists
    if (await hasColumn('amount')) {
      try {
        logger.info("Dropping column amount from general_ledger...");
        await sequelize.query(
          "ALTER TABLE general_ledger DROP COLUMN amount",
          { type: QueryTypes.BULKUPDATE }
        );
      } catch (err) {
        logger.warn(`Could not drop column amount: ${err.message}`);
      }
    }

    // 3. Drop column localAmount if it exists
    if (await hasColumn('localAmount')) {
      try {
        logger.info("Dropping column localAmount from general_ledger...");
        await sequelize.query(
          "ALTER TABLE general_ledger DROP COLUMN localAmount",
          { type: QueryTypes.BULKUPDATE }
        );
      } catch (err) {
        logger.warn(`Could not drop column localAmount: ${err.message}`);
      }
    }

  } catch (error) {
    logger.error("Error executing dynamic general_ledger cleanup:", error);
  }
};

/**
 * Reads and executes the SQL cleanup script (toomanykey.sql)
 * to drop redundant indexes before Sequelize synchronization runs.
 */
const executeSqlScript = async () => {
  // First run the dynamic general_ledger cleanup to ensure constraints are dropped correctly across any client DB
  await dropGeneralLedgerDeprecatedFields();

  const filePath = path.join(__dirname, '../../toomanykey.sql');
  if (!fs.existsSync(filePath)) {
    logger.warn(`SQL cleanup script not found at ${filePath}, skipping.`);
    return;
  }

  logger.info(`Starting execution of SQL script: ${filePath}`);
  try {
    const sqlContent = fs.readFileSync(filePath, 'utf8');

    // Parse the file into clean statements:
    // 1. Split by newline to filter out comment lines (starting with -- or #)
    // 2. Join back and split by semicolon (;) to get individual statements
    const statements = sqlContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => !line.startsWith('--') && !line.startsWith('#'))
      .join('\n')
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    logger.info(`Found ${statements.length} SQL statements to execute.`);

    let successCount = 0;
    let failCount = 0;

    for (const statement of statements) {
      try {
        // Use QueryTypes.BULKUPDATE to bypass the MariaDB metadata formatResults bug
        await sequelize.query(statement, { type: QueryTypes.BULKUPDATE });
        successCount++;
      } catch (err) {
        // Log failures as debug/verbose since tables or indexes might not exist yet,
        // which is perfectly expected during initial runs.
        failCount++;
        logger.debug(`Statement failed: "${statement}". Error: ${err.message}`);
      }
    }

    logger.info(`Finished executing SQL script. Success: ${successCount}, Failed/Skipped: ${failCount}`);
  } catch (error) {
    logger.error(`Error reading or executing SQL script ${filePath}:`, error);
  }
};

module.exports = executeSqlScript;
