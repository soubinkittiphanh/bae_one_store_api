-- ==============================================================================
-- DCommerce Loan Module - Phase 5 Part A, multi-currency posting (UP)
-- Idempotent. Run via: node loan_migrate.js up
-- docs/loan/rev5-accounting-addendum.md §8. Carrying base per bucket is derived from ln_journal_posting
-- (signed amount and baseAmount per role and qualifier), so no balance columns are added.
-- ==============================================================================

-- 1. Dated, authorized exchange rates (base units per 1 contract unit), maker-checker like every parameter
CREATE TABLE IF NOT EXISTS `ln_exchange_rate` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `currencyId` INT(11) NOT NULL COMMENT 'currency.id (no FK)',
  `rateDate` DATE NOT NULL,
  `rate` DECIMAL(20,8) NOT NULL COMMENT 'base units per 1 unit of currencyId',
  `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL / POS_COPY',
  `remarks` VARCHAR(255) NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `makerId` INT(11) NULL,
  `checkerId` INT(11) NULL,
  `authorizedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exchange_rate` (`currencyId`, `rateDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Transactions: the date of the rate used and the warning shown when it is not the booking date's
ALTER TABLE `ln_transaction`
  ADD COLUMN IF NOT EXISTS `exchangeRateDate` DATE NULL AFTER `exchangeRate`,
  ADD COLUMN IF NOT EXISTS `fxWarning` VARCHAR(255) NULL AFTER `exchangeRateDate`;

-- 3. Journal legs: base-only legs (FX_DIFF, FX_REVAL, ROUND_DIFF) have amount 0 and a base amount
ALTER TABLE `ln_journal_posting`
  ADD COLUMN IF NOT EXISTS `isBaseOnly` TINYINT(1) NOT NULL DEFAULT 0 AFTER `baseAmount`;
ALTER TABLE `ln_journal_posting` ADD INDEX IF NOT EXISTS `idx_jp_account_role` (`loanAccountId`, `roleCode`);
