-- ==============================================================================
-- DCommerce Loan Module - Phase 2B accounting setup (UP)
-- Idempotent. Run via: node loan_migrate.js up
-- See docs/loan/rev5-accounting-addendum.md sections 0 and 7.
-- No GL accounts and no ln_role_gl_mapping rows are created here.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Entry rules: active flag and product-parameter filters ('ANY' or one code).
--    The filters are part of the unique key so one leg can exist per fee mode,
--    presentation or disbursement target.
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_accounting_entry_rule`
  ADD COLUMN IF NOT EXISTS `isActive` TINYINT(1) NOT NULL DEFAULT 1 AFTER `qualifierSource`,
  ADD COLUMN IF NOT EXISTS `feeModeFilter` VARCHAR(30) NOT NULL DEFAULT 'ANY' AFTER `isActive`,
  ADD COLUMN IF NOT EXISTS `presentationFilter` VARCHAR(30) NOT NULL DEFAULT 'ANY' AFTER `feeModeFilter`,
  ADD COLUMN IF NOT EXISTS `targetFilter` VARCHAR(30) NOT NULL DEFAULT 'ANY' AFTER `presentationFilter`;
ALTER TABLE `ln_accounting_entry_rule` DROP INDEX IF EXISTS `uk_accounting_entry_rule`;
ALTER TABLE `ln_accounting_entry_rule`
  ADD UNIQUE INDEX `uk_accounting_entry_rule`
    (`ukProductId`, `ukCategoryId`, `eventCode`, `amountTag`, `drCr`, `roleCode`, `qualifierSource`,
     `feeModeFilter`, `presentationFilter`, `targetFilter`, `effectiveFrom`);

-- ------------------------------------------------------------------------------
-- 2. When interest is recognized (DUE_DATE / DAILY / CASH); frozen in the snapshot JSON
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ln_lookup_interest_recognition` (
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

ALTER TABLE `ln_product`
  ADD COLUMN IF NOT EXISTS `interestRecognitionCode` VARCHAR(30) NOT NULL DEFAULT 'DUE_DATE' AFTER `accrualMethodCode`;
