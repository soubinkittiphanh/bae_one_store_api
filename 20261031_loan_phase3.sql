-- ==============================================================================
-- DCommerce Loan Module - Phase 3 calculation engines (UP)
-- Idempotent. Run via: node loan_migrate.js up
-- Pure calculation support only: no GL posting tables are touched.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Loan-owned rounding rule per currency (docs/loan/rounding-policy.md §3).
--    The POS currency table has no decimals field; it is not changed.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ln_currency_rule` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `currencyId` INT(11) NOT NULL COMMENT 'currency.id (no FK)',
  `decimalPlaces` INT(11) NOT NULL COMMENT '0..2 while posting into general_ledger DECIMAL(15,2)',
  `roundingMode` VARCHAR(20) NOT NULL DEFAULT 'HALF_UP',
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `makerId` INT(11) NULL,
  `checkerId` INT(11) NULL,
  `authorizedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_currency_rule` (`currencyId`, `effectiveFrom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Repayment method (EQUAL_PRINCIPAL / EQUAL_INSTALLMENT / FLAT)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ln_lookup_repayment_method` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `makerId` INT(11) NULL,
  `checkerId` INT(11) NULL,
  `authorizedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Product: repayment method, grace limit, first-period window (frozen in the snapshot)
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_product`
  ADD COLUMN IF NOT EXISTS `repaymentMethodCode` VARCHAR(30) NOT NULL DEFAULT 'EQUAL_INSTALLMENT' AFTER `interestRecognitionCode`,
  ADD COLUMN IF NOT EXISTS `maxGracePeriods` INT(11) NOT NULL DEFAULT 0 AFTER `repaymentMethodCode`,
  ADD COLUMN IF NOT EXISTS `firstPeriodMinDays` INT(11) NOT NULL DEFAULT 15 AFTER `maxGracePeriods`,
  ADD COLUMN IF NOT EXISTS `firstPeriodMaxDays` INT(11) NOT NULL DEFAULT 45 AFTER `firstPeriodMinDays`;

-- ------------------------------------------------------------------------------
-- 4. Application: terms for the schedule and maker-checker approval
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_application`
  ADD COLUMN IF NOT EXISTS `valueDate` DATE NULL AFTER `balloonAmount`,
  ADD COLUMN IF NOT EXISTS `firstDueDate` DATE NULL AFTER `valueDate`,
  ADD COLUMN IF NOT EXISTS `graceType` VARCHAR(20) NOT NULL DEFAULT 'NONE' AFTER `firstDueDate`,
  ADD COLUMN IF NOT EXISTS `gracePeriods` INT(11) NOT NULL DEFAULT 0 AFTER `graceType`,
  ADD COLUMN IF NOT EXISTS `remarks` TEXT NULL AFTER `approvedBy`,
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;

-- ------------------------------------------------------------------------------
-- 5. Account: lifecycle stage separate from the classification status
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_account`
  ADD COLUMN IF NOT EXISTS `accountStage` VARCHAR(20) NOT NULL DEFAULT 'BOOKED' COMMENT 'BOOKED / DISBURSED / CLOSED' AFTER `status`,
  ADD COLUMN IF NOT EXISTS `repaymentMethodCode` VARCHAR(30) NULL AFTER `tenorMonths`,
  ADD COLUMN IF NOT EXISTS `graceType` VARCHAR(20) NOT NULL DEFAULT 'NONE' AFTER `repaymentMethodCode`,
  ADD COLUMN IF NOT EXISTS `gracePeriods` INT(11) NOT NULL DEFAULT 0 AFTER `graceType`;

-- ------------------------------------------------------------------------------
-- 6. Holiday calendar weekend days (comma list of MON..SUN)
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_holiday_calendar`
  ADD COLUMN IF NOT EXISTS `weekendDays` VARCHAR(30) NOT NULL DEFAULT 'SAT,SUN' AFTER `branchId`;
