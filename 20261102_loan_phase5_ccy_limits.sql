-- ==============================================================================
-- DCommerce Loan Module - Phase 5 Part B0, per-currency amount limits and fixed amounts (UP)
-- Idempotent. Run via: node loan_migrate.js up
-- A product that offers several currencies needs its amount limits and every fixed amount per currency;
-- percentages and rates stay currency-free. The product accounting check refuses to authorize a product
-- that offers a currency without them.
-- ==============================================================================

-- 1. Amount limits per offered currency (NULL = not set; the check blocks authorization)
ALTER TABLE `ln_product_currency`
  ADD COLUMN IF NOT EXISTS `minAmount` DECIMAL(20,4) NULL AFTER `isDefault`,
  ADD COLUMN IF NOT EXISTS `maxAmount` DECIMAL(20,4) NULL AFTER `minAmount`;

-- 2. Fixed amounts per currency for product components with a fixed-amount formula (FIXED_CONTRACT_FEE)
--    and for product UDEs whose UDE dataType is AMOUNT. A product child: copied with a new product version
--    and authorized with it.
CREATE TABLE IF NOT EXISTS `ln_product_amount` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `productId` INT(11) NOT NULL,
  `currencyId` INT(11) NOT NULL COMMENT 'currency.id (no FK)',
  `itemType` VARCHAR(20) NOT NULL COMMENT 'COMPONENT / UDE',
  `itemCode` VARCHAR(30) NOT NULL COMMENT 'componentCode or udeCode',
  `defaultValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `minValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `maxValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `makerId` INT(11) NULL,
  `checkerId` INT(11) NULL,
  `authorizedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_amount` (`productId`, `currencyId`, `itemType`, `itemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Amount-basis rate tiers name their currency; fee master and approval matrix amounts name theirs
--    (NULL = the base currency; neither table is read by an engine yet)
ALTER TABLE `ln_rate_tier` ADD COLUMN IF NOT EXISTS `currencyId` INT(11) NULL COMMENT 'currency.id; required for tierBasis AMOUNT' AFTER `tierBasis`;
ALTER TABLE `ln_fee_master` ADD COLUMN IF NOT EXISTS `currencyId` INT(11) NULL COMMENT 'currency.id of minAmount/maxAmount; NULL = base' AFTER `basisAmountType`;
ALTER TABLE `ln_approval_matrix` ADD COLUMN IF NOT EXISTS `currencyId` INT(11) NULL COMMENT 'currency.id of minAmount/maxAmount; NULL = base' AFTER `entityType`;

-- 4. Backfill for the base currency only: the existing product values are base-currency amounts, copied
--    unchanged with the product's own authorization state. Other offered currencies stay unset.
UPDATE `ln_product_currency` pc
  JOIN `ln_product` p ON p.id = pc.productId
  JOIN `currency` c ON c.id = pc.currencyId AND c.isLocalCCY = 1
   SET pc.minAmount = p.minAmount, pc.maxAmount = p.maxAmount
 WHERE pc.minAmount IS NULL AND pc.maxAmount IS NULL;

INSERT IGNORE INTO `ln_product_amount` (productId, currencyId, itemType, itemCode, defaultValue, `minValue`, `maxValue`, authStatus, makerId, checkerId, authorizedAt)
SELECT pcm.productId, pc.currencyId, 'COMPONENT', cm.componentCode, pcm.defaultValue, pcm.`minValue`, pcm.`maxValue`, pcm.authStatus, pcm.makerId, pcm.checkerId, pcm.authorizedAt
  FROM `ln_product_component` pcm
  JOIN `ln_component` cm ON cm.id = pcm.componentId
  JOIN `ln_product_currency` pc ON pc.productId = pcm.productId
  JOIN `currency` c ON c.id = pc.currencyId AND c.isLocalCCY = 1
 WHERE pcm.formulaCode = 'FIXED_CONTRACT_FEE';

INSERT IGNORE INTO `ln_product_amount` (productId, currencyId, itemType, itemCode, defaultValue, `minValue`, `maxValue`, authStatus, makerId, checkerId, authorizedAt)
SELECT pu.productId, pc.currencyId, 'UDE', pu.udeCode, pu.defaultValue, pu.`minValue`, pu.`maxValue`, pu.authStatus, pu.makerId, pu.checkerId, pu.authorizedAt
  FROM `ln_product_ude` pu
  JOIN `ln_ude` u ON u.udeCode = pu.udeCode AND u.dataType = 'AMOUNT'
  JOIN `ln_product_currency` pc ON pc.productId = pu.productId
  JOIN `currency` c ON c.id = pc.currencyId AND c.isLocalCCY = 1;
