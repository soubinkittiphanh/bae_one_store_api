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

    // 2. Ensure product columns (product_code, packaging flags, duration, units, etc.)
    try {
      if (await tableExists('product')) {
        if (!(await hasColumn('product', 'product_code'))) {
          logger.info("Adding product_code column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `product_code` VARCHAR(255) DEFAULT NULL COMMENT 'Product code / SKU'",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added product_code to product table.");
        }
        if (!(await hasColumn('product', 'duration_minutes'))) {
          logger.info("Adding duration_minutes column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `duration_minutes` INT(11) NOT NULL DEFAULT 0",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added duration_minutes to product table.");
        }
        if (!(await hasColumn('product', 'validateStockOnSale'))) {
          logger.info("Adding validateStockOnSale column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `validateStockOnSale` TINYINT(1) NOT NULL DEFAULT 0",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added validateStockOnSale to product table.");
        }
        if (!(await hasColumn('product', 'receiveUnitId'))) {
          logger.info("Adding receiveUnitId column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `receiveUnitId` INT(11) DEFAULT NULL",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added receiveUnitId to product table.");
        }
        if (!(await hasColumn('product', 'stockUnitId'))) {
          logger.info("Adding stockUnitId column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `stockUnitId` INT(11) DEFAULT NULL",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added stockUnitId to product table.");
        }
        if (!(await hasColumn('product', 'baseUnitId'))) {
          logger.info("Adding baseUnitId column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `baseUnitId` INT(11) DEFAULT NULL",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added baseUnitId to product table.");
        }
        if (!(await hasColumn('product', 'vendorName'))) {
          logger.info("Adding vendorName column to product table...");
          await sequelize.query(
            "ALTER TABLE `product` ADD COLUMN `vendorName` VARCHAR(100) DEFAULT NULL",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added vendorName to product table.");
        }
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
      logger.warn("Could not ensure product columns:", prodErr.message);
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

        if (!(await hasColumn('saleLine', 'isReturn'))) {
          logger.info("Adding saleLine.isReturn column...");
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `isReturn` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether this line represents a returned item / empty packaging inflow'",
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info("Successfully added isReturn to saleLine table.");
        }

        if (!(await hasColumn('saleLine', 'isGift'))) {
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `isGift` TINYINT(1) NOT NULL DEFAULT 0",
            { type: QueryTypes.BULKUPDATE }
          );
        }

        if (!(await hasColumn('saleLine', 'colorId'))) {
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `colorId` INT(11) DEFAULT NULL",
            { type: QueryTypes.BULKUPDATE }
          );
        }

        if (!(await hasColumn('saleLine', 'sizeId'))) {
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `sizeId` INT(11) DEFAULT NULL",
            { type: QueryTypes.BULKUPDATE }
          );
        }

        if (!(await hasColumn('saleLine', 'taxType'))) {
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `taxType` ENUM('INC', 'EXC') NOT NULL DEFAULT 'INC'",
            { type: QueryTypes.BULKUPDATE }
          );
        }

        if (!(await hasColumn('saleLine', 'taxRate'))) {
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `taxRate` DOUBLE NOT NULL DEFAULT 0",
            { type: QueryTypes.BULKUPDATE }
          );
        }

        if (!(await hasColumn('saleLine', 'taxAmount'))) {
          await sequelize.query(
            "ALTER TABLE `saleLine` ADD COLUMN `taxAmount` DOUBLE NOT NULL DEFAULT 0",
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
 * Automatically checks and ensures dashboard_menus table and default shortcuts exist.
 * Runs on startup so any new or existing customer DB has dashboard shortcuts ready.
 */
const ensureDashboardMenuTable = async () => {
  try {
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

    if (!(await tableExists('dashboard_menus'))) {
      logger.info("Creating dashboard_menus table...");
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`dashboard_menus\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`name\` varchar(255) NOT NULL,
          \`llname\` varchar(255) DEFAULT NULL,
          \`path\` varchar(255) NOT NULL,
          \`icon\` varchar(255) NOT NULL DEFAULT 'cashier_2.svg',
          \`iconType\` enum('svg','mdi') NOT NULL DEFAULT 'svg',
          \`color\` varchar(255) DEFAULT NULL,
          \`badge\` varchar(255) DEFAULT NULL,
          \`order\` int(11) NOT NULL DEFAULT 0,
          \`target_systems\` varchar(255) DEFAULT 'ALL',
          \`userGroupId\` int(11) DEFAULT NULL,
          \`userId\` int(11) DEFAULT NULL,
          \`isActive\` tinyint(1) NOT NULL DEFAULT 1,
          \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updateTimestamp\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_dashboard_menus_user\` (\`userId\`, \`isActive\`),
          KEY \`idx_dashboard_menus_group\` (\`userGroupId\`, \`isActive\`),
          KEY \`idx_dashboard_menus_order\` (\`order\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
      logger.info("Successfully created dashboard_menus table.");
    }

    // Check if default shortcuts exist; if empty, seed defaults
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM \`dashboard_menus\` 
      WHERE \`userId\` IS NULL AND \`userGroupId\` IS NULL
    `, { type: QueryTypes.SELECT });

    if (!countResult || countResult.count === 0) {
      logger.info("Seeding initial 10 default dashboard shortcuts...");
      const defaultShortcuts = [
        ['POS Minimart', 'ຂາຍສິນຄ້າ (POS)', '/pos/minimart', 'cashier_2.svg', 'svg', 0, 1],
        ['Invoice', 'ໃບບິນ (Invoice)', '/admin/ordersFromPos', 'invoice.svg', 'svg', 1, 1],
        ['Receivables', 'ລູກໜີ້', '/admin/ordersFromPosCredit', 'pay-card.svg', 'svg', 2, 1],
        ['Inventory Stock', 'ສາງສິນຄ້າ', '/admin/product/productlist', 'stock.svg', 'svg', 3, 1],
        ['Restaurant Menu', 'ເມນູອາຫານ (Menu)', '/admin/restaurant/menu', 'coffee.svg', 'svg', 4, 1],
        ['Customers', 'ລູກຄ້າ', '/admin/client', 'patient.svg', 'svg', 5, 1],
        ['Sale by Main Category', 'ລາຍງານຕາມໝວດຫຼັກ', '/admin/saleByMainCategory', 'invoice.svg', 'svg', 6, 1],
        ['Sale by Category', 'ລາຍງານຕາມປະເພດສິນຄ້າ', '/admin/saleByCategory', 'invoice.svg', 'svg', 7, 1],
        ['Daily Sale Summary', 'ສະຫຼຸບຍອດຂາຍລາຍວັນ', '/admin/saleReportSummary', 'invoice.svg', 'svg', 8, 1],
        ['Loyalty Points Report', 'ລາຍງານຄະແນນສະສົມ', '/admin/report/loyalty', 'overview.svg', 'svg', 9, 1]
      ];

      for (const item of defaultShortcuts) {
        await sequelize.query(`
          INSERT INTO \`dashboard_menus\` (\`name\`, \`llname\`, \`path\`, \`icon\`, \`iconType\`, \`order\`, \`isActive\`, \`createdAt\`, \`updateTimestamp\`)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, {
          replacements: item,
          type: QueryTypes.INSERT
        });
      }
      logger.info("Successfully seeded default dashboard shortcuts.");
    }

    // Register /admin/dashboardMenu in menuLine if menuLine table exists
    if (await tableExists('menuLine')) {
      const [menuLine] = await sequelize.query(`
        SELECT id FROM \`menuLine\` WHERE \`path\` = '/admin/dashboardMenu' LIMIT 1
      `, { type: QueryTypes.SELECT });

      let lineId = menuLine ? menuLine.id : null;
      if (!lineId) {
        const [insertRes] = await sequelize.query(`
          INSERT INTO \`menuLine\` (\`name\`, \`llname\`, \`icon\`, \`path\`, \`remark\`, \`target_systems\`, \`isActive\`, \`createdAt\`, \`updateTimestamp\`)
          VALUES ('Dashboard Shortcuts', 'ຈັດການເມນູດ່ວນ', 'mdi-view-dashboard-edit-outline', '/admin/dashboardMenu', 'Manage and configure dashboard shortcut menu cards', 'ALL', 1, NOW(), NOW())
        `, { type: QueryTypes.INSERT });
        lineId = insertRes;
      }

      if (lineId && await tableExists('menuHeader') && await tableExists('GroupMenuHeader')) {
        const [header] = await sequelize.query(`
          SELECT id, code FROM \`menuHeader\` WHERE \`code\` IN ('BRANCH', 'MODULES') ORDER BY FIELD(\`code\`, 'BRANCH', 'MODULES') LIMIT 1
        `, { type: QueryTypes.SELECT });

        if (header) {
          const [exists] = await sequelize.query(`
            SELECT id FROM \`MenuHeaderLines\` WHERE \`menuHeaderId\` = :headerId AND \`menuLineId\` = :lineId LIMIT 1
          `, { replacements: { headerId: header.id, lineId }, type: QueryTypes.SELECT });

          if (!exists) {
            await sequelize.query(`
              INSERT INTO \`MenuHeaderLines\` (\`menuHeaderId\`, \`menuLineId\`, \`order\`, \`createdAt\`, \`updateTimestamp\`)
              VALUES (:headerId, :lineId, 99, NOW(), NOW())
            `, { replacements: { headerId: header.id, lineId }, type: QueryTypes.INSERT });
          }
        }
      }
    }
  } catch (err) {
    logger.warn("Could not ensure dashboardMenu table:", err.message);
  }
};

/**
 * Automatically checks and ensures AR and AP tables and columns (documents, glPostingStatus, etc.)
 * exist across all client databases on API startup.
 */
const ensureARAndAPColumns = async () => {
  try {
    const dbName = sequelize.config.database;
    logger.info(`Checking AR and AP tables and columns in database: ${dbName}`);

    // Helper to get real table name (case-insensitive)
    const getActualTableName = async (tableName) => {
      const result = await sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND LOWER(TABLE_NAME) = :tableName
      `, {
        replacements: { tableName: tableName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0 ? result[0].TABLE_NAME : null;
    };

    // Helper to check if column exists (case-insensitive)
    const hasColumn = async (actualTableName, colName) => {
      const result = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND LOWER(TABLE_NAME) = :tableName
          AND LOWER(COLUMN_NAME) = :colName
      `, {
        replacements: { tableName: actualTableName.toLowerCase(), colName: colName.toLowerCase() },
        type: QueryTypes.SELECT
      });
      return result.length > 0;
    };

    const addColumnIfMissing = async (actualTableName, colName, colDefinition) => {
      try {
        if (!(await hasColumn(actualTableName, colName))) {
          logger.info(`Adding column ${colName} to ${actualTableName}...`);
          await sequelize.query(
            `ALTER TABLE \`${actualTableName}\` ADD COLUMN \`${colName}\` ${colDefinition}`,
            { type: QueryTypes.BULKUPDATE }
          );
          logger.info(`Successfully added ${colName} to ${actualTableName}.`);
        }
      } catch (err) {
        logger.warn(`Could not add column ${colName} to ${actualTableName}: ${err.message}`);
      }
    };

    // 1. ARReceiveHeader
    let arReceiveHeaderTable = await getActualTableName('ARReceiveHeader');
    if (!arReceiveHeaderTable) {
      logger.info("Creating ARReceiveHeader table...");
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`ARReceiveHeader\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`receiptNumber\` varchar(255) NOT NULL,
          \`bookingDate\` date NOT NULL,
          \`receivedDate\` date NOT NULL,
          \`totalReceivedAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`exchangeRate\` decimal(15,2) NOT NULL DEFAULT 1.00,
          \`paymentMethod\` enum('cash','check','bank_transfer','credit_card','other') NOT NULL DEFAULT 'cash',
          \`referenceNumber\` varchar(255) DEFAULT NULL,
          \`notes\` text DEFAULT NULL,
          \`status\` enum('active','voided','cancelled') NOT NULL DEFAULT 'active',
          \`glPostingStatus\` enum('unposted','posted') NOT NULL DEFAULT 'unposted',
          \`glPostingDate\` datetime DEFAULT NULL,
          \`glBatchId\` varchar(100) DEFAULT NULL,
          \`documents\` json DEFAULT NULL,
          \`invoiceHeaderId\` int(11) DEFAULT NULL,
          \`inputterId\` int(11) DEFAULT NULL,
          \`makerId\` int(11) DEFAULT NULL,
          \`updateUserId\` int(11) DEFAULT NULL,
          \`currencyId\` int(11) DEFAULT NULL,
          \`paymentId\` int(11) DEFAULT NULL,
          \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updateTimestamp\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`receiptNumber\` (\`receiptNumber\`),
          KEY \`bookingDate\` (\`bookingDate\`),
          KEY \`invoiceHeaderId\` (\`invoiceHeaderId\`),
          KEY \`status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
      arReceiveHeaderTable = await getActualTableName('ARReceiveHeader');
    }

    if (arReceiveHeaderTable) {
      await addColumnIfMissing(arReceiveHeaderTable, 'documents', "JSON DEFAULT NULL COMMENT 'Attached receipt documents/files'");
      await addColumnIfMissing(arReceiveHeaderTable, 'glPostingStatus', "ENUM('unposted', 'posted') NOT NULL DEFAULT 'unposted'");
      await addColumnIfMissing(arReceiveHeaderTable, 'glPostingDate', "DATETIME DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'glBatchId', "VARCHAR(100) DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'status', "ENUM('active', 'voided', 'cancelled') NOT NULL DEFAULT 'active'");
      await addColumnIfMissing(arReceiveHeaderTable, 'paymentMethod', "ENUM('cash', 'check', 'bank_transfer', 'credit_card', 'other') NOT NULL DEFAULT 'cash'");
      await addColumnIfMissing(arReceiveHeaderTable, 'exchangeRate', "DECIMAL(15, 2) NOT NULL DEFAULT 1.00");
      await addColumnIfMissing(arReceiveHeaderTable, 'referenceNumber', "VARCHAR(255) DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'notes', "TEXT DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'invoiceHeaderId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'inputterId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'makerId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'updateUserId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'currencyId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arReceiveHeaderTable, 'paymentId', "INT(11) DEFAULT NULL");
    }

    // 2. ARInvoiceHeader
    let arInvoiceHeaderTable = await getActualTableName('ARInvoiceHeader');
    if (!arInvoiceHeaderTable) {
      logger.info("Creating ARInvoiceHeader table...");
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`ARInvoiceHeader\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`invoiceNumber\` varchar(255) NOT NULL,
          \`invoiceDate\` date NOT NULL,
          \`dueDate\` date DEFAULT NULL,
          \`exchangeRate\` decimal(15,2) NOT NULL DEFAULT 1.00,
          \`totalAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`taxAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`netAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`status\` enum('draft','sent','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
          \`description\` text DEFAULT NULL,
          \`glPostingStatus\` enum('unposted','posted') NOT NULL DEFAULT 'unposted',
          \`glPostingDate\` datetime DEFAULT NULL,
          \`glBatchId\` varchar(100) DEFAULT NULL,
          \`documents\` json DEFAULT NULL,
          \`saleHeaderId\` int(11) DEFAULT NULL,
          \`sourceType\` enum('POS_ORDER','JOB_BATCH','MANUAL') NOT NULL DEFAULT 'MANUAL',
          \`clientId\` int(11) DEFAULT NULL,
          \`currencyId\` int(11) DEFAULT NULL,
          \`agencyId\` int(11) DEFAULT NULL,
          \`jobBatchId\` int(11) DEFAULT NULL,
          \`makerId\` int(11) DEFAULT NULL,
          \`updateUserId\` int(11) DEFAULT NULL,
          \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updateTimestamp\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`invoiceNumber\` (\`invoiceNumber\`),
          KEY \`invoiceDate\` (\`invoiceDate\`),
          KEY \`status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
      arInvoiceHeaderTable = await getActualTableName('ARInvoiceHeader');
    }

    if (arInvoiceHeaderTable) {
      await addColumnIfMissing(arInvoiceHeaderTable, 'documents', "JSON DEFAULT NULL COMMENT 'Attached invoice documents/files'");
      await addColumnIfMissing(arInvoiceHeaderTable, 'saleHeaderId', "INT(11) DEFAULT NULL COMMENT 'Linked POS Sale Header ID if created from POS Order'");
      await addColumnIfMissing(arInvoiceHeaderTable, 'sourceType', "ENUM('POS_ORDER', 'JOB_BATCH', 'MANUAL') NOT NULL DEFAULT 'MANUAL'");
      await addColumnIfMissing(arInvoiceHeaderTable, 'glPostingStatus', "ENUM('unposted', 'posted') NOT NULL DEFAULT 'unposted'");
      await addColumnIfMissing(arInvoiceHeaderTable, 'glPostingDate', "DATETIME DEFAULT NULL");
      await addColumnIfMissing(arInvoiceHeaderTable, 'glBatchId', "VARCHAR(100) DEFAULT NULL");
      await addColumnIfMissing(arInvoiceHeaderTable, 'agencyId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arInvoiceHeaderTable, 'jobBatchId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arInvoiceHeaderTable, 'taxAmount', "DECIMAL(15, 2) NOT NULL DEFAULT 0.00");
      await addColumnIfMissing(arInvoiceHeaderTable, 'netAmount', "DECIMAL(15, 2) NOT NULL DEFAULT 0.00");
      await addColumnIfMissing(arInvoiceHeaderTable, 'clientId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arInvoiceHeaderTable, 'currencyId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arInvoiceHeaderTable, 'makerId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(arInvoiceHeaderTable, 'updateUserId', "INT(11) DEFAULT NULL");
    }

    // 3. APInvoice
    let apInvoiceTable = await getActualTableName('APInvoice');
    if (!apInvoiceTable) {
      logger.info("Creating APInvoice table...");
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`APInvoice\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`invoiceNumber\` varchar(255) NOT NULL,
          \`vendorInvoiceNumber\` varchar(255) DEFAULT NULL,
          \`invoiceDate\` date NOT NULL,
          \`dueDate\` date DEFAULT NULL,
          \`description\` text DEFAULT NULL,
          \`totalAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`paidAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`exchangeRate\` decimal(15,6) NOT NULL DEFAULT 1.000000,
          \`status\` enum('draft','submitted','approved','partially_paid','paid','voided') NOT NULL DEFAULT 'draft',
          \`approvedAt\` datetime DEFAULT NULL,
          \`note\` text DEFAULT NULL,
          \`vendorId\` int(11) DEFAULT NULL,
          \`currencyId\` int(11) DEFAULT NULL,
          \`makerId\` int(11) DEFAULT NULL,
          \`checkerId\` int(11) DEFAULT NULL,
          \`agencyId\` int(11) DEFAULT NULL,
          \`glPostingStatus\` enum('unposted','posted') NOT NULL DEFAULT 'unposted',
          \`glPostingDate\` datetime DEFAULT NULL,
          \`glBatchId\` varchar(100) DEFAULT NULL,
          \`documents\` json DEFAULT NULL,
          \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updateTimestamp\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`invoiceNumber\` (\`invoiceNumber\`),
          KEY \`invoiceDate\` (\`invoiceDate\`),
          KEY \`status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
      apInvoiceTable = await getActualTableName('APInvoice');
    }

    if (apInvoiceTable) {
      await addColumnIfMissing(apInvoiceTable, 'documents', "JSON DEFAULT NULL");
      await addColumnIfMissing(apInvoiceTable, 'glPostingStatus', "ENUM('unposted', 'posted') NOT NULL DEFAULT 'unposted'");
      await addColumnIfMissing(apInvoiceTable, 'glPostingDate', "DATETIME DEFAULT NULL");
      await addColumnIfMissing(apInvoiceTable, 'glBatchId', "VARCHAR(100) DEFAULT NULL");
      await addColumnIfMissing(apInvoiceTable, 'agencyId', "INT(11) DEFAULT NULL");
    }

    // 4. APInvoiceSettlement
    let apInvoiceSettlementTable = await getActualTableName('APInvoiceSettlement');
    if (!apInvoiceSettlementTable) {
      logger.info("Creating APInvoiceSettlement table...");
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`APInvoiceSettlement\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`settlementDate\` date NOT NULL,
          \`paymentAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`baseAmount\` decimal(15,2) NOT NULL DEFAULT 0.00,
          \`status\` enum('draft','completed','cancelled') NOT NULL DEFAULT 'completed',
          \`reference\` varchar(255) DEFAULT NULL,
          \`description\` text DEFAULT NULL,
          \`note\` text DEFAULT NULL,
          \`invoiceId\` int(11) DEFAULT NULL,
          \`paymentMethodId\` int(11) DEFAULT NULL,
          \`bankAccountId\` int(11) DEFAULT NULL,
          \`makerId\` int(11) DEFAULT NULL,
          \`checkerId\` int(11) DEFAULT NULL,
          \`exchangeRate\` decimal(15,6) NOT NULL DEFAULT 1.000000,
          \`currencyId\` int(11) DEFAULT NULL,
          \`glPostingStatus\` enum('unposted','posted') NOT NULL DEFAULT 'unposted',
          \`glPostingDate\` datetime DEFAULT NULL,
          \`glBatchId\` varchar(100) DEFAULT NULL,
          \`documents\` json DEFAULT NULL,
          \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updateTimestamp\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`settlementDate\` (\`settlementDate\`),
          KEY \`status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
      apInvoiceSettlementTable = await getActualTableName('APInvoiceSettlement');
    }

    if (apInvoiceSettlementTable) {
      await addColumnIfMissing(apInvoiceSettlementTable, 'documents', "JSON DEFAULT NULL");
      await addColumnIfMissing(apInvoiceSettlementTable, 'glPostingStatus', "ENUM('unposted', 'posted') NOT NULL DEFAULT 'unposted'");
      await addColumnIfMissing(apInvoiceSettlementTable, 'glPostingDate', "DATETIME DEFAULT NULL");
      await addColumnIfMissing(apInvoiceSettlementTable, 'glBatchId', "VARCHAR(100) DEFAULT NULL");
      await addColumnIfMissing(apInvoiceSettlementTable, 'exchangeRate', "DECIMAL(15, 6) NOT NULL DEFAULT 1.000000");
      await addColumnIfMissing(apInvoiceSettlementTable, 'currencyId', "INT(11) DEFAULT NULL");
    }

    // 5. Audit Tables
    if (!(await getActualTableName('ARReceiveHeaderAudit'))) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`ARReceiveHeaderAudit\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`action\` enum('CREATE','UPDATE','DELETE','VOID','CANCEL','APPROVE') NOT NULL DEFAULT 'UPDATE',
          \`recordData\` json NOT NULL,
          \`reason\` text DEFAULT NULL,
          \`userId\` int(11) NOT NULL,
          \`auditDate\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`receiveHeaderId\` int(11) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`receiveHeaderId_auditDate\` (\`receiveHeaderId\`, \`auditDate\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
    }

    if (!(await getActualTableName('ARInvoiceHeaderAudit'))) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`ARInvoiceHeaderAudit\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`action\` enum('CREATE','UPDATE','DELETE','POST','CANCEL') NOT NULL DEFAULT 'UPDATE',
          \`recordData\` json NOT NULL,
          \`reason\` text DEFAULT NULL,
          \`userId\` int(11) NOT NULL,
          \`auditDate\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`invoiceHeaderId\` int(11) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`invoiceHeaderId_auditDate\` (\`invoiceHeaderId\`, \`auditDate\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
    }

    if (!(await getActualTableName('APInvoiceAudit'))) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`APInvoiceAudit\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`action\` enum('CREATE','UPDATE','DELETE','APPROVE','VOID') NOT NULL DEFAULT 'UPDATE',
          \`recordData\` json NOT NULL,
          \`reason\` text DEFAULT NULL,
          \`userId\` int(11) NOT NULL,
          \`auditDate\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`invoiceId\` int(11) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`invoiceId_auditDate\` (\`invoiceId\`, \`auditDate\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
    }

    if (!(await getActualTableName('APSettlementAudit'))) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`APSettlementAudit\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`action\` enum('CREATE','UPDATE','DELETE','CANCEL') NOT NULL DEFAULT 'UPDATE',
          \`recordData\` json NOT NULL,
          \`reason\` text DEFAULT NULL,
          \`userId\` int(11) NOT NULL,
          \`auditDate\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`settlementId\` int(11) NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`settlementId_auditDate\` (\`settlementId\`, \`auditDate\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
    }

    // 6. saleHeader AR & Loyalty columns
    const saleHeaderTable = await getActualTableName('saleHeader');
    if (saleHeaderTable) {
      await addColumnIfMissing(saleHeaderTable, 'arInvoiceId', "INT(11) DEFAULT NULL COMMENT 'Linked AR Invoice ID if posted to AR'");
      await addColumnIfMissing(saleHeaderTable, 'isPostedToAR', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether this credit order has been posted to AR'");
      await addColumnIfMissing(saleHeaderTable, 'arPostedAt', "DATETIME DEFAULT NULL COMMENT 'Timestamp when posted to AR'");
      await addColumnIfMissing(saleHeaderTable, 'loyaltyDiscount', "DOUBLE NOT NULL DEFAULT 0");
      await addColumnIfMissing(saleHeaderTable, 'redeemedPoints', "INT(11) NOT NULL DEFAULT 0");
    }

    // 7. payment_header budget columns
    const paymentHeaderTable = await getActualTableName('payment_header');
    if (paymentHeaderTable) {
      await addColumnIfMissing(paymentHeaderTable, 'expenseSource', "VARCHAR(255) NOT NULL DEFAULT 'POS_SALE'");
      await addColumnIfMissing(paymentHeaderTable, 'budgetId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(paymentHeaderTable, 'budgetImpactYear', "INT(11) DEFAULT NULL");
    }

    // 8. ar_receive_header (legacy simple basic income) columns
    const legacyArTable = await getActualTableName('ar_receive_header');
    if (legacyArTable) {
      await addColumnIfMissing(legacyArTable, 'locking_session_id', "VARCHAR(255) DEFAULT NULL");
      await addColumnIfMissing(legacyArTable, 'update_user', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(legacyArTable, 'isActive', "TINYINT(1) NOT NULL DEFAULT 1");
      await addColumnIfMissing(legacyArTable, 'currencyId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(legacyArTable, 'paymentId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(legacyArTable, 'drAccountId', "INT(11) DEFAULT NULL");
      await addColumnIfMissing(legacyArTable, 'crAccountId', "INT(11) DEFAULT NULL");
    }

    // 9. annual_expense_budget table
    if (!(await getActualTableName('annual_expense_budget'))) {
      logger.info("Creating annual_expense_budget table...");
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`annual_expense_budget\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`name\` varchar(255) NOT NULL,
          \`year\` int(11) NOT NULL,
          \`allocatedAmount\` decimal(30,2) NOT NULL DEFAULT 0.00,
          \`exchangeRate\` decimal(30,2) NOT NULL DEFAULT 1.00,
          \`thresholdWarningPercent\` int(11) NOT NULL DEFAULT 80,
          \`drAccountId\` int(11) DEFAULT NULL,
          \`ministryId\` int(11) DEFAULT NULL,
          \`currencyId\` int(11) NOT NULL,
          \`remark\` varchar(255) DEFAULT '',
          \`isActive\` tinyint(1) NOT NULL DEFAULT 1,
          \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updateTimestamp\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_aeb_year\` (\`year\`),
          KEY \`idx_aeb_currency\` (\`currencyId\`),
          KEY \`idx_aeb_drAccount\` (\`drAccountId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
      logger.info("Successfully created annual_expense_budget table.");
    }

    // 10. revenue_target table
    if (!(await getActualTableName('revenue_target'))) {
      logger.info("Creating revenue_target table...");
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`revenue_target\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`name\` varchar(255) NOT NULL,
          \`year\` int(11) NOT NULL,
          \`targetAmount\` decimal(30,2) NOT NULL DEFAULT 0.00,
          \`exchangeRate\` decimal(30,2) NOT NULL DEFAULT 1.00,
          \`remark\` varchar(255) DEFAULT '',
          \`isActive\` tinyint(1) NOT NULL DEFAULT 1,
          \`currencyId\` int(11) DEFAULT NULL,
          \`parentMinistryId\` int(11) DEFAULT NULL,
          \`chartAccountId\` int(11) DEFAULT NULL,
          \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updateTimestamp\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_rev_year\` (\`year\`),
          KEY \`idx_rev_currency\` (\`currencyId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `, { type: QueryTypes.BULKUPDATE });
      logger.info("Successfully created revenue_target table.");
    }

    logger.info("AR and AP tables and columns check completed.");
  } catch (error) {
    logger.warn("Could not ensure AR and AP columns:", error.message);
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

    // Automatically ensure dashboard_menus table and default shortcuts exist
    await ensureDashboardMenuTable();

    // Automatically ensure AR and AP tables and columns (documents, glPostingStatus, etc.) exist
    await ensureARAndAPColumns();

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
