-- ==============================================================================
-- DCommerce Loan Module - Phase 4 payments, posting and EOD (UP)
-- Idempotent. Run via: node loan_migrate.js up
-- ==============================================================================

-- 1. Idempotency: the old unique key allowed duplicates when accountId was NULL
ALTER TABLE `ln_idempotency`
  ADD COLUMN IF NOT EXISTS `transactionId` INT(11) NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `ukAccountId` INT(11) AS (IFNULL(`accountId`, 0)) PERSISTENT;
ALTER TABLE `ln_idempotency` DROP INDEX IF EXISTS `uk_endpoint_account_key`;
ALTER TABLE `ln_idempotency` ADD UNIQUE INDEX IF NOT EXISTS `uk_idempotency` (`endpoint`, `ukAccountId`, `idempotencyKey`);

-- 2. Transactions: posting state, booking date (period lock), source, stored request/events/effects
ALTER TABLE `ln_transaction`
  ADD COLUMN IF NOT EXISTS `postingStatus` VARCHAR(20) NOT NULL DEFAULT 'POSTED' COMMENT 'PENDING_AUTH / POSTED / REJECTED' AFTER `authStatus`,
  ADD COLUMN IF NOT EXISTS `bookingDate` DATE NULL AFTER `postingDate`,
  ADD COLUMN IF NOT EXISTS `valueDatedAdjustment` TINYINT(1) NOT NULL DEFAULT 0 AFTER `bookingDate`,
  ADD COLUMN IF NOT EXISTS `source` VARCHAR(20) NOT NULL DEFAULT 'ONLINE' COMMENT 'ONLINE / EOD' AFTER `valueDatedAdjustment`,
  ADD COLUMN IF NOT EXISTS `requestJson` LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS `eventsJson` LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS `effectsJson` LONGTEXT NULL COMMENT 'Subledger changes, undone by REVERSAL',
  ADD COLUMN IF NOT EXISTS `remarks` TEXT NULL;

-- 3. Journal legs: currency and the status qualifier used for LOAN_PORTFOLIO
ALTER TABLE `ln_journal_posting`
  ADD COLUMN IF NOT EXISTS `statusQualifier` VARCHAR(30) NULL AFTER `roleCode`,
  ADD COLUMN IF NOT EXISTS `currencyId` INT(11) NULL AFTER `drCr`;

-- 4. Schedule components: how due interest is held (BOOKED / SUSPENDED / UNBOOKED) and how much is recognized
ALTER TABLE `ln_schedule_component`
  ADD COLUMN IF NOT EXISTS `bucket` VARCHAR(20) NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `amountRecognized` DECIMAL(20,4) NOT NULL DEFAULT 0.0000 AFTER `bucket`;

-- 5. Account running balances kept by the posting engine
ALTER TABLE `ln_account`
  ADD COLUMN IF NOT EXISTS `advanceBalance` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS `writtenOffMemo` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS `repossessedCarrying` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS `onTimeStreak` INT(11) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `statusSince` DATE NULL,
  ADD COLUMN IF NOT EXISTS `lastEodDate` DATE NULL;

-- 6. Every POS row a loan transaction created (GL, bank entries, AR receipts); used by REVERSAL
CREATE TABLE IF NOT EXISTS `ln_pos_link` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `transactionId` INT(11) NOT NULL,
  `posTable` VARCHAR(50) NOT NULL,
  `posId` INT(11) NOT NULL,
  `role` VARCHAR(30) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pos_link_tx` (`transactionId`),
  KEY `idx_pos_link_pos` (`posTable`, `posId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. EOD batches carry their job
ALTER TABLE `ln_gl_batch` ADD COLUMN IF NOT EXISTS `jobCode` VARCHAR(30) NULL AFTER `batchType`;

-- 8. Amendments made by a loan transaction: approvedBy only when a second person authorized it
ALTER TABLE `ln_amendment_history`
  MODIFY COLUMN `approvedBy` INT NULL COMMENT 'Checker who authorized the change; NULL when nobody approved it',
  ADD COLUMN IF NOT EXISTS `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL / TRANSACTION / SYSTEM' AFTER `approvedBy`,
  ADD COLUMN IF NOT EXISTS `transactionId` INT(11) NULL COMMENT 'ln_transaction that caused the change' AFTER `source`,
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL COMMENT 'User who entered the transaction' AFTER `transactionId`;
ALTER TABLE `ln_amendment_history` ADD INDEX IF NOT EXISTS `idx_ah_tx` (`transactionId`);
