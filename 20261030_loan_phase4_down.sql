-- ==============================================================================
-- DCommerce Loan Module - Phase 4 (DOWN). loan_migrate.js refuses while loan transactions exist.
-- ==============================================================================
ALTER TABLE `ln_gl_batch` DROP COLUMN IF EXISTS `jobCode`;
DROP TABLE IF EXISTS `ln_pos_link`;
ALTER TABLE `ln_account`
  DROP COLUMN IF EXISTS `lastEodDate`, DROP COLUMN IF EXISTS `statusSince`, DROP COLUMN IF EXISTS `onTimeStreak`,
  DROP COLUMN IF EXISTS `repossessedCarrying`, DROP COLUMN IF EXISTS `writtenOffMemo`, DROP COLUMN IF EXISTS `advanceBalance`;
ALTER TABLE `ln_schedule_component` DROP COLUMN IF EXISTS `amountRecognized`, DROP COLUMN IF EXISTS `bucket`;
ALTER TABLE `ln_journal_posting` DROP COLUMN IF EXISTS `currencyId`, DROP COLUMN IF EXISTS `statusQualifier`;
ALTER TABLE `ln_transaction`
  DROP COLUMN IF EXISTS `remarks`, DROP COLUMN IF EXISTS `effectsJson`, DROP COLUMN IF EXISTS `eventsJson`,
  DROP COLUMN IF EXISTS `requestJson`, DROP COLUMN IF EXISTS `source`, DROP COLUMN IF EXISTS `valueDatedAdjustment`,
  DROP COLUMN IF EXISTS `bookingDate`, DROP COLUMN IF EXISTS `postingStatus`;
ALTER TABLE `ln_idempotency` DROP INDEX IF EXISTS `uk_idempotency`;
ALTER TABLE `ln_idempotency` DROP COLUMN IF EXISTS `ukAccountId`, DROP COLUMN IF EXISTS `transactionId`;
ALTER TABLE `ln_idempotency` ADD UNIQUE INDEX IF NOT EXISTS `uk_endpoint_account_key` (`endpoint`, `accountId`, `idempotencyKey`);
