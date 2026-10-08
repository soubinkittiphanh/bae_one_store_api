-- ===================================================================================
-- Migration: Beerlao Agency Returnable Packaging & Promotional Stock System
-- Date: 2026-10-05
-- Description:
--   1. Creates product_packagings for linking finished goods (cases) to packaging assets (crates/bottles).
--   2. Creates customer_packaging_ledger for tracking customer packaging debt (wholesale/retail).
--   3. Creates supplier_packaging_ledger for tracking packaging balance with Lao Brewery Co.
--   4. Creates packaging_damage_logs for tracking glass breakages & damaged crates.
--   5. Alters product, poLine, receivingLine, and saleLine to support FOC promo & packaging actions.
-- ===================================================================================

-- 1. Product Packaging Composition (BOM for Returnable Items)
CREATE TABLE IF NOT EXISTS `product_packagings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,                  -- Finished Beer Case ID
  `packagingProductId` INT NOT NULL,         -- Empty Crate ID or Empty Bottle ID
  `quantity` DOUBLE NOT NULL DEFAULT 1,      -- e.g. 1 for crate, 12 for bottles
  `depositPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `companyId` INT NOT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  INDEX `idx_pkg_product` (`productId`),
  INDEX `idx_pkg_packaging_product` (`packagingProductId`),
  INDEX `idx_pkg_company` (`companyId`),
  CONSTRAINT `fk_pkg_product` FOREIGN KEY (`productId`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pkg_asset` FOREIGN KEY (`packagingProductId`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Customer Packaging Debt Ledger (Wholesale & Retail Credit)
CREATE TABLE IF NOT EXISTS `customer_packaging_ledger` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clientId` INT NOT NULL,                   -- References `client` table
  `saleHeaderId` INT NULL,                   -- Optional reference to `saleHeader`
  `packagingProductId` INT NOT NULL,         -- Crate or Bottle product ID
  `transactionType` ENUM('DELIVERED_OUT', 'RETURNED_IN', 'PAID_DEPOSIT', 'REFUNDED_DEPOSIT', 'WRITE_OFF') NOT NULL,
  `qtyChange` INT NOT NULL,                  -- (+) Customer owes more, (-) Customer returned
  `balanceAfter` INT NOT NULL DEFAULT 0,     -- Running packaging balance owed by customer
  `depositAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `notes` VARCHAR(255) NULL,
  `userId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  INDEX `idx_cpl_client` (`clientId`),
  INDEX `idx_cpl_sale` (`saleHeaderId`),
  INDEX `idx_cpl_product` (`packagingProductId`),
  CONSTRAINT `fk_cpl_client` FOREIGN KEY (`clientId`) REFERENCES `client` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cpl_product` FOREIGN KEY (`packagingProductId`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Supplier (Beerlao Factory) Packaging Ledger
CREATE TABLE IF NOT EXISTS `supplier_packaging_ledger` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `vendorId` INT NOT NULL,                   -- Lao Brewery Vendor ID
  `receivingHeaderId` INT NULL,              -- Optional reference to `receivingHeader`
  `manifestNo` VARCHAR(60) NULL,             -- Truck Return Manifest No.
  `packagingProductId` INT NOT NULL,         -- Crate or Bottle product ID
  `transactionType` ENUM('RECEIVED_FULL', 'RETURNED_EMPTY_TRUCK', 'FACTORY_ADJUSTMENT') NOT NULL,
  `qtyChange` INT NOT NULL,                  -- (+) Received from factory, (-) Handed back to truck
  `balanceAfter` INT NOT NULL DEFAULT 0,     -- Running balance with Lao Brewery
  `notes` VARCHAR(255) NULL,
  `userId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  INDEX `idx_spl_vendor` (`vendorId`),
  INDEX `idx_spl_rec` (`receivingHeaderId`),
  INDEX `idx_spl_product` (`packagingProductId`),
  CONSTRAINT `fk_spl_product` FOREIGN KEY (`packagingProductId`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Packaging Damage & Loss Log (Breakages / Crushed Crates)
CREATE TABLE IF NOT EXISTS `packaging_damage_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `packagingProductId` INT NOT NULL,
  `quantity` INT NOT NULL,
  `reason` ENUM('DELIVERY_BREAKAGE', 'WAREHOUSE_DAMAGE', 'FACTORY_REJECT') NOT NULL,
  `notes` VARCHAR(255) NULL,
  `userId` INT NOT NULL,
  `locationId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  INDEX `idx_pdl_product` (`packagingProductId`),
  CONSTRAINT `fk_pdl_product` FOREIGN KEY (`packagingProductId`) REFERENCES `product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Alter Product table to add returnable packaging flags
ALTER TABLE `product` 
  ADD COLUMN IF NOT EXISTS `isReturnablePackaging` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `isPackagingAsset` TINYINT(1) NOT NULL DEFAULT 0;

-- 6. Alter PO & Receiving lines to add FOC (Free of Charge) promo quantities
ALTER TABLE `poLine` 
  ADD COLUMN IF NOT EXISTS `focQty` DOUBLE NOT NULL DEFAULT 0;

ALTER TABLE `receivingLine` 
  ADD COLUMN IF NOT EXISTS `focQty` DOUBLE NOT NULL DEFAULT 0;

-- 7. Alter Sale lines to add FOC and packagingAction
ALTER TABLE `saleLine` 
  ADD COLUMN IF NOT EXISTS `focQty` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packagingAction` ENUM('EXCHANGED', 'DEPOSIT', 'DEBT', 'NONE') NOT NULL DEFAULT 'NONE';
