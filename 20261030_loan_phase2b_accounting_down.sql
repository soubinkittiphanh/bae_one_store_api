-- ==============================================================================
-- DCommerce Loan Module - Phase 2B accounting setup (DOWN)
-- Reverses 20261030_loan_phase2b_accounting.sql. Run via: node loan_migrate.js down --yes
-- loan_migrate.js refuses this step while ln_accounting_entry_rule has rows.
-- ==============================================================================

ALTER TABLE `ln_product` DROP COLUMN IF EXISTS `interestRecognitionCode`;
DROP TABLE IF EXISTS `ln_lookup_interest_recognition`;

ALTER TABLE `ln_accounting_entry_rule` DROP INDEX IF EXISTS `uk_accounting_entry_rule`;
ALTER TABLE `ln_accounting_entry_rule`
  DROP COLUMN IF EXISTS `targetFilter`,
  DROP COLUMN IF EXISTS `presentationFilter`,
  DROP COLUMN IF EXISTS `feeModeFilter`,
  DROP COLUMN IF EXISTS `isActive`;
ALTER TABLE `ln_accounting_entry_rule`
  ADD UNIQUE INDEX `uk_accounting_entry_rule`
    (`ukProductId`, `ukCategoryId`, `eventCode`, `amountTag`, `drCr`, `roleCode`, `qualifierSource`, `effectiveFrom`);
