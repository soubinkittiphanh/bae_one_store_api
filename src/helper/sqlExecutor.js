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
 * Automatically sets schoolInvoiceId to NULL for any schoolPayment records
 * that reference a non-existent schoolInvoice ID. This prevents foreign key 
 * constraint failures when Sequelize alters or adds constraints.
 */
const cleanOrphanedSchoolPayments = async () => {
  try {
    const dbName = sequelize.config.database;
    
    // Helper to check if a table exists
    const tableExists = async (tableName) => {
      const result = await sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = :dbName 
          AND LOWER(TABLE_NAME) = :tableName
      `, {
        replacements: { dbName, tableName: tableName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    // Helper to check if a table has a specific column
    const hasColumn = async (tableName, colName) => {
      const result = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = :dbName 
          AND LOWER(TABLE_NAME) = :tableName
          AND LOWER(COLUMN_NAME) = :colName
      `, {
        replacements: { dbName, tableName: tableName.toLowerCase(), colName: colName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    const hasPaymentTable = await tableExists('schoolPayment');
    const hasInvoiceTable = await tableExists('schoolInvoice');

    if (hasPaymentTable && hasInvoiceTable && await hasColumn('schoolPayment', 'schoolInvoiceId')) {
      logger.info("Checking for orphaned schoolInvoiceId references in schoolPayment...");
      const orphanedCount = await sequelize.query(`
        SELECT COUNT(*) as count 
        FROM \`schoolPayment\` 
        WHERE \`schoolInvoiceId\` NOT IN (SELECT \`id\` FROM \`schoolInvoice\`) 
          AND \`schoolInvoiceId\` IS NOT NULL
      `, {
        type: QueryTypes.SELECT
      });

      const count = orphanedCount[0]?.count || 0;
      if (count > 0) {
        logger.info(`Found ${count} orphaned schoolPayment records referencing non-existent invoices. Cleaning them up...`);
        await sequelize.query(`
          UPDATE \`schoolPayment\` 
          SET \`schoolInvoiceId\` = NULL 
          WHERE \`schoolInvoiceId\` NOT IN (SELECT \`id\` FROM \`schoolInvoice\`) 
            AND \`schoolInvoiceId\` IS NOT NULL
        `, { type: QueryTypes.BULKUPDATE });
        logger.info("Orphaned schoolPayment records successfully updated to NULL.");
      } else {
        logger.info("No orphaned schoolPayment records found.");
      }
    }
  } catch (error) {
    logger.error("Error executing schoolPayment orphaned records cleanup:", error);
  }
};

/**
 * Automatically checks and creates critical performance indexes across client databases.
 * Runs on API startup to ensure fast inventory and product queries without manual DB migrations.
 */
const ensurePerformanceIndexes = async () => {
  try {
    const dbName = sequelize.config.database;
    logger.info(`Checking performance indexes in database: ${dbName}`);

    // Helper to check if an index exists on a table
    const indexExists = async (tableName, indexName) => {
      const result = await sequelize.query(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = :dbName 
          AND LOWER(TABLE_NAME) = :tableName 
          AND LOWER(INDEX_NAME) = :indexName
      `, {
        replacements: { 
          dbName, 
          tableName: tableName.toLowerCase(), 
          indexName: indexName.toLowerCase() 
        },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    // Helper to check if a table exists
    const tableExists = async (tableName) => {
      const result = await sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = :dbName 
          AND LOWER(TABLE_NAME) = :tableName
      `, {
        replacements: { dbName, tableName: tableName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    // 1. Check & create composite stock lookup index on card table
    // Covers: WHERE card_isused = 0 AND locationId = ? AND isActive = 1 GROUP BY productId
    if (await tableExists('card')) {
      const hasStockIndex = await indexExists('card', 'idx_card_location_stock');
      if (!hasStockIndex) {
        logger.info("Index idx_card_location_stock not found on card table. Creating...");
        await sequelize.query(
          "CREATE INDEX idx_card_location_stock ON card (locationId, card_isused, isActive, productId)",
          { type: QueryTypes.BULKUPDATE }
        );
        logger.info("Successfully created index idx_card_location_stock on card table.");
      } else {
        logger.info("Index idx_card_location_stock already exists on card table.");
      }
    }

    // 2. Check & create index on image_path (pro_id) for fast product joins
    if (await tableExists('image_path')) {
      const hasImageIndex = await indexExists('image_path', 'idx_image_path_pro_id');
      if (!hasImageIndex) {
        logger.info("Index idx_image_path_pro_id not found on image_path table. Creating...");
        await sequelize.query(
          "CREATE INDEX idx_image_path_pro_id ON image_path (pro_id)",
          { type: QueryTypes.BULKUPDATE }
        );
        logger.info("Successfully created index idx_image_path_pro_id on image_path table.");
      } else {
        logger.info("Index idx_image_path_pro_id already exists on image_path table.");
      }
    }

    // 3. Check & create composite index on saleHeader (locationId, bookingDate)
    // Covers: WHERE bookingDate BETWEEN ... AND locationId = ?
    if (await tableExists('saleHeader')) {
      const hasLocBookingIndex = await indexExists('saleHeader', 'idx_saleHeader_location_bookingDate');
      if (!hasLocBookingIndex) {
        logger.info("Index idx_saleHeader_location_bookingDate not found on saleHeader table. Creating...");
        await sequelize.query(
          "CREATE INDEX idx_saleHeader_location_bookingDate ON saleHeader (locationId, bookingDate)",
          { type: QueryTypes.BULKUPDATE }
        );
        logger.info("Successfully created index idx_saleHeader_location_bookingDate on saleHeader table.");
      } else {
        logger.info("Index idx_saleHeader_location_bookingDate already exists on saleHeader table.");
      }

      // 4. Check & create index on saleHeader (bookingDate) for date-only range queries
      const hasBookingIndex = await indexExists('saleHeader', 'idx_saleHeader_bookingDate');
      if (!hasBookingIndex) {
        logger.info("Index idx_saleHeader_bookingDate not found on saleHeader table. Creating...");
        await sequelize.query(
          "CREATE INDEX idx_saleHeader_bookingDate ON saleHeader (bookingDate)",
          { type: QueryTypes.BULKUPDATE }
        );
        logger.info("Successfully created index idx_saleHeader_bookingDate on saleHeader table.");
      } else {
        logger.info("Index idx_saleHeader_bookingDate already exists on saleHeader table.");
      }
    }

  } catch (error) {
    logger.error("Error executing performance indexes check:", error);
  }
};

/**
 * Automatically checks and ensures returnable packaging columns and enum values
 * are properly defined on category, product, saleLine, poLine, and receivingLine tables.
 */
const ensurePackagingColumns = async () => {
  try {
    const dbName = sequelize.config.database;
    logger.info(`Checking packaging columns and enums in database: ${dbName}`);

    // Helper to check if a table exists
    const tableExists = async (tableName) => {
      const result = await sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND LOWER(TABLE_NAME) = :tableName
      `, {
        replacements: { tableName: tableName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    // Helper to check if a table has a specific column
    const hasColumn = async (tableName, colName) => {
      const result = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND LOWER(TABLE_NAME) = :tableName
          AND LOWER(COLUMN_NAME) = :colName
      `, {
        replacements: { tableName: tableName.toLowerCase(), colName: colName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    // 1. Ensure category packaging flags
    try {
      if (await tableExists('category')) {
        if (!(await hasColumn('category', 'isPackaging'))) {
          logger.info("Adding isPackaging column to category table...");
          await sequelize.query(
            "ALTER TABLE `category` ADD COLUMN `isPackaging` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether this category represents packaging/empties (crates, bottles)'",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added isPackaging to category table.");
        }
      }
    } catch (catErr) {
      logger.warn("Could not ensure category packaging column:", catErr.message);
    }

    // 2. Ensure product returnable packaging flags
    try {
      if (await tableExists('product')) {
        if (!(await hasColumn('product', 'isReturnablePackaging'))) {
          logger.info("Adding isReturnablePackaging column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `isReturnablePackaging` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether this product uses returnable packaging'",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added isReturnablePackaging to product table.");
        }
        if (!(await hasColumn('product', 'isPackagingAsset'))) {
          logger.info("Adding isPackagingAsset column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `isPackagingAsset` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether this product is an empty crate/bottle packaging asset'",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added isPackagingAsset to product table.");
        }
      }
    } catch (prodErr) {
      logger.warn("Could not ensure product packaging columns:", prodErr.message);
    }

    // 3. Ensure saleLine.packagingAction ENUM includes 'SOLD' and 'RETURNED'
    try {
      if (await tableExists('saleLine')) {
        const hasPkgAction = await hasColumn('saleLine', 'packagingAction');
        if (hasPkgAction) {
          logger.info("Updating saleLine.packagingAction ENUM to ensure all actions ('EXCHANGED', 'DEPOSIT', 'DEBT', 'SOLD', 'RETURNED', 'NONE') are allowed...");
          await sequelize.query(
            "ALTER TABLE `saleLine` MODIFY COLUMN `packagingAction` ENUM('EXCHANGED', 'DEPOSIT', 'DEBT', 'SOLD', 'RETURNED', 'NONE') NOT NULL DEFAULT 'NONE'",
            { type: QueryTypes.BULKUPDATE }
          );
        } else {
          logger.info("Adding saleLine.packagingAction ENUM column...");
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `packagingAction` ENUM('EXCHANGED', 'DEPOSIT', 'DEBT', 'SOLD', 'RETURNED', 'NONE') NOT NULL DEFAULT 'NONE'",
            { type: QueryTypes.BULKUPDATE }
          );
        }

        if (!(await hasColumn('saleLine', 'focQty'))) {
          logger.info("Adding saleLine.focQty column...");
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `focQty` DOUBLE NOT NULL DEFAULT 0",
            { type: QueryTypes.BULKUPDATE }
          );
        }
      }
    } catch (saleLineErr) {
      logger.warn("Could not ensure saleLine packaging columns:", saleLineErr.message);
    }

    // 4. Ensure poLine & receivingLine focQty
    try {
      if (await tableExists('poLine') && !(await hasColumn('poLine', 'focQty'))) {
        await sequelize.query(
          "ALTER TABLE `poLine` ADD COLUMN `focQty` DOUBLE NOT NULL DEFAULT 0",
          { type: QueryTypes.BULKUPDATE }
        );
      }
      if (await tableExists('receivingLine') && !(await hasColumn('receivingLine', 'focQty'))) {
        await sequelize.query(
          "ALTER TABLE `receivingLine` ADD COLUMN `focQty` DOUBLE NOT NULL DEFAULT 0",
          { type: QueryTypes.BULKUPDATE }
        );
      }
    } catch (lineErr) {
      logger.warn("Could not ensure poLine/receivingLine focQty:", lineErr.message);
    }

  } catch (error) {
    logger.warn("Could not ensure packaging columns/enums:", error.message);
  }
};

/**
 * Automatically checks and ensures company table columns exist across all client databases.
 */
const ensureCompanyColumns = async () => {
  try {
    const dbName = sequelize.config.database;
    logger.info(`Checking company table columns in database: ${dbName}`);

    const tableExists = async (tableName) => {
      const result = await sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND LOWER(TABLE_NAME) = :tableName
      `, {
        replacements: { tableName: tableName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    const hasColumn = async (tableName, colName) => {
      const result = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND LOWER(TABLE_NAME) = :tableName
          AND LOWER(COLUMN_NAME) = :colName
      `, {
        replacements: { tableName: tableName.toLowerCase(), colName: colName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    if (await tableExists('company')) {
      if (!(await hasColumn('company', 'ticket_logo_size'))) {
        logger.info("Adding ticket_logo_size column to company table...");
        await sequelize.query(
          "ALTER TABLE `company` ADD COLUMN `ticket_logo_size` INT DEFAULT 65 COMMENT 'Logo width in pixels on POS ticket (30-220px)'",
          { type: QueryTypes.BULKUPDATE }
        );
      }
      if (!(await hasColumn('company', 'customer_welcome_text'))) {
        await sequelize.query(
          "ALTER TABLE `company` ADD COLUMN `customer_welcome_text` TEXT NULL",
          { type: QueryTypes.BULKUPDATE }
        );
      }
      if (!(await hasColumn('company', 'term_condition'))) {
        await sequelize.query(
          "ALTER TABLE `company` ADD COLUMN `term_condition` TEXT NULL",
          { type: QueryTypes.BULKUPDATE }
        );
      }
      if (!(await hasColumn('company', 'showLogoOnTicket'))) {
        await sequelize.query(
          "ALTER TABLE `company` ADD COLUMN `showLogoOnTicket` TINYINT(1) NOT NULL DEFAULT 0",
          { type: QueryTypes.BULKUPDATE }
        );
      }
      if (!(await hasColumn('company', 'ticketLayout'))) {
        await sequelize.query(
          "ALTER TABLE `company` ADD COLUMN `ticketLayout` ENUM('classic', 'modern') NOT NULL DEFAULT 'classic'",
          { type: QueryTypes.BULKUPDATE }
        );
      }
    }
  } catch (error) {
    logger.warn("Could not ensure company columns:", error.message);
  }
};

/**
 * Reads and executes the SQL cleanup script (toomanykey.sql)
 * to drop redundant indexes before Sequelize synchronization runs.
 */
const executeSqlScript = async () => {
  try {
    // First run the dynamic general_ledger cleanup to ensure constraints are dropped correctly across any client DB
    await dropGeneralLedgerDeprecatedFields();

    // Clean up orphaned schoolInvoiceId references in schoolPayment
    await cleanOrphanedSchoolPayments();

    // Automatically check and create performance indexes on startup
    await ensurePerformanceIndexes();

    // Automatically ensure returnable packaging columns and ENUM values (SOLD, RETURNED) are present
    await ensurePackagingColumns();

    // Automatically ensure company table columns (ticket_logo_size, etc.) are present
    await ensureCompanyColumns();

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
  } finally {
    try {
      await sequelize.close();
      logger.info("Closed temporary SQL executor database connection pool.");
    } catch (err) {
      logger.error("Error closing temporary SQL executor database connection pool:", err);
    }
  }
};

module.exports = executeSqlScript;
