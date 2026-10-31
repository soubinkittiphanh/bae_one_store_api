-- ==============================================================================
-- DCommerce Loan Module - Phase 5 Part A (DOWN). loan_migrate.js refuses while loan transactions exist.
-- ==============================================================================
ALTER TABLE `ln_journal_posting` DROP INDEX IF EXISTS `idx_jp_account_role`;
ALTER TABLE `ln_journal_posting` DROP COLUMN IF EXISTS `isBaseOnly`;
ALTER TABLE `ln_transaction` DROP COLUMN IF EXISTS `fxWarning`, DROP COLUMN IF EXISTS `exchangeRateDate`;
DROP TABLE IF EXISTS `ln_exchange_rate`;
