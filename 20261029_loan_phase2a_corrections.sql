-- ==============================================================================
-- DCommerce Loan Module - Phase 2A schema corrections (UP)
-- Applies on top of 20261028_create_loan_module_phase2a_tables.sql.
-- Re-runnable (IF [NOT] EXISTS). Requires MariaDB 10.5+.
-- Rollback: 20261029_loan_phase2a_corrections_down.sql
-- Run via: node loan_migrate.js up
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Maker-checker columns on all parameter tables.
--    Rows that already exist keep AUTHORIZED; new rows default to PENDING.
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_lookup_loan_type`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_loan_type` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_frequency`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_frequency` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_disbursement_target`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_disbursement_target` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_holiday_handling`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_holiday_handling` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_day_count`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_day_count` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_rebate_method`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_rebate_method` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_accrual_method`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_accrual_method` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_collateral_type`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_collateral_type` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_loan_purpose`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_loan_purpose` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_lookup_deferred_fee_presentation`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_lookup_deferred_fee_presentation` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_product_currency`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_product_currency` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_ude`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_ude` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_rate_index_value`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_rate_index_value` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_rate_tier`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_rate_tier` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_holiday_calendar`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_holiday_calendar` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_holiday_date`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_holiday_date` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_amount_tag`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_amount_tag` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_event_master`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_event_master` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_numbering_sequence`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_numbering_sequence` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_batch_job`
  ADD COLUMN IF NOT EXISTS `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_batch_job` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_product_category`
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_product_category` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_product`
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_product` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_component`
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_component` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_product_component`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_product_component` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_product_ude`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_product_ude` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_rate_index`
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_rate_index` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_waterfall_rule`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_waterfall_rule` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_fee_master`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_fee_master` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_tax_master`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_tax_master` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_regulatory_class`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_regulatory_class` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_status_master`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_status_master` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_status_movement_rule`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_status_movement_rule` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_status_cure_rule`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_status_cure_rule` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_provision_rule`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_provision_rule` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_approval_matrix`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_approval_matrix` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_document_checklist`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_document_checklist` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_accounting_role`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_accounting_role` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_accounting_entry_rule`
  ADD COLUMN IF NOT EXISTS `makerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `checkerId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_accounting_entry_rule` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';
ALTER TABLE `ln_role_gl_mapping`
  ADD COLUMN IF NOT EXISTS `authorizedAt` DATETIME NULL;
ALTER TABLE `ln_role_gl_mapping` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';

ALTER TABLE `ln_transaction` ALTER COLUMN `authStatus` SET DEFAULT 'PENDING';

-- ------------------------------------------------------------------------------
-- 2. Pending changes to AUTHORIZED parameter rows (applied on authorization)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ln_param_change` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `entityName` VARCHAR(50) NOT NULL,
  `entityKey` VARCHAR(100) NULL COMMENT 'PK of the target row; NULL for CREATE',
  `action` VARCHAR(10) NOT NULL COMMENT 'CREATE / UPDATE / DELETE',
  `payloadJson` LONGTEXT NULL,
  `baseOptLock` INT(11) NULL COMMENT 'optLockVersion of the target row when the change was made',
  `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / AUTHORIZED / REJECTED',
  `makerId` INT(11) NOT NULL,
  `checkerId` INT(11) NULL,
  `authorizedAt` DATETIME NULL,
  `remarks` VARCHAR(255) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_param_change_entity` (`entityName`, `entityKey`, `status`),
  KEY `idx_param_change_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Go-live checklist confirmations, one row per item
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ln_checklist_confirmation` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `itemKey` VARCHAR(50) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'UNCONFIRMED' COMMENT 'UNCONFIRMED / CONFIRMED / HELD',
  `confirmedBy` INT(11) NULL,
  `confirmedAt` DATETIME NULL,
  `snapshotJson` LONGTEXT NULL COMMENT 'Parameter values that were confirmed',
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_checklist_item` (`itemKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. Tax profile: VAT rate comes from the POS `tax` row (posTaxId).
--    The VAT payable account is a Phase 2B system parameter, not stored here.
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_tax_profile`
  ADD COLUMN IF NOT EXISTS `posTaxId` INT(11) NULL COMMENT 'tax.id (no FK)' AFTER `companyVatRegistered`,
  ADD COLUMN IF NOT EXISTS `lastModifiedBy` INT(11) NULL AFTER `confirmedAt`,
  DROP COLUMN IF EXISTS `defaultVatRate`,
  DROP COLUMN IF EXISTS `taxPayableAccountId`;

-- ------------------------------------------------------------------------------
-- 5. Tax master: effective-dated per tax code; NULL rate = use the POS rate
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_tax_master`
  DROP INDEX IF EXISTS `taxCode`,
  ADD COLUMN IF NOT EXISTS `posTaxId` INT(11) NULL COMMENT 'tax.id (no FK)' AFTER `componentId`,
  MODIFY COLUMN `taxRate` DECIMAL(9,6) NULL DEFAULT NULL COMMENT 'NULL = rate from POS tax row',
  ADD UNIQUE INDEX IF NOT EXISTS `uk_tax_master_code_from` (`taxCode`, `effectiveFrom`);

-- ------------------------------------------------------------------------------
-- 6. MariaDB-safe unique keys (no COALESCE in index): persistent generated columns
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_role_gl_mapping`
  ADD COLUMN IF NOT EXISTS `ukProductId` INT(11) AS (IFNULL(`productId`, 0)) PERSISTENT,
  ADD COLUMN IF NOT EXISTS `ukCategoryId` INT(11) AS (IFNULL(`categoryId`, 0)) PERSISTENT,
  ADD COLUMN IF NOT EXISTS `ukBranchId` INT(11) AS (IFNULL(`branchId`, 0)) PERSISTENT,
  ADD COLUMN IF NOT EXISTS `ukCurrencyId` INT(11) AS (IFNULL(`currencyId`, 0)) PERSISTENT,
  ADD COLUMN IF NOT EXISTS `ukStatusQualifier` VARCHAR(30) AS (IFNULL(`statusQualifier`, '*')) PERSISTENT;
ALTER TABLE `ln_role_gl_mapping`
  ADD UNIQUE INDEX IF NOT EXISTS `uk_role_gl_mapping`
    (`ukProductId`, `ukCategoryId`, `ukBranchId`, `ukCurrencyId`, `ukStatusQualifier`, `roleCode`, `effectiveFrom`);

ALTER TABLE `ln_accounting_entry_rule`
  ADD COLUMN IF NOT EXISTS `ukProductId` INT(11) AS (IFNULL(`productId`, 0)) PERSISTENT,
  ADD COLUMN IF NOT EXISTS `ukCategoryId` INT(11) AS (IFNULL(`categoryId`, 0)) PERSISTENT;
ALTER TABLE `ln_accounting_entry_rule`
  ADD UNIQUE INDEX IF NOT EXISTS `uk_accounting_entry_rule`
    (`ukProductId`, `ukCategoryId`, `eventCode`, `amountTag`, `drCr`, `roleCode`, `qualifierSource`, `effectiveFrom`);

-- ------------------------------------------------------------------------------
-- 7. glBatchId holds ln_gl_batch.batchNumber (same convention as general_ledger.glBatchId)
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_journal_posting` MODIFY COLUMN `glBatchId` VARCHAR(100) NULL COMMENT 'ln_gl_batch.batchNumber';
ALTER TABLE `ln_accrual_ledger` MODIFY COLUMN `glBatchId` VARCHAR(100) NULL COMMENT 'ln_gl_batch.batchNumber';
ALTER TABLE `ln_provision_ledger` MODIFY COLUMN `glBatchId` VARCHAR(100) NULL COMMENT 'ln_gl_batch.batchNumber';

-- ------------------------------------------------------------------------------
-- 8. Provision rates are company policy, not regulation
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_provision_rule`
  ADD COLUMN IF NOT EXISTS `policyNote` VARCHAR(255) NOT NULL DEFAULT 'To be set by company management policy' AFTER `provisionBase`;

-- ------------------------------------------------------------------------------
-- 9. Account status uses ln_status_master codes
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_account` ALTER COLUMN `status` SET DEFAULT 'NORMAL';

-- ------------------------------------------------------------------------------
-- 10. branchId = location.id (POS has no branch table); no FK by decision
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_application` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1 COMMENT 'location.id (no FK)';
ALTER TABLE `ln_account` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1 COMMENT 'location.id (no FK)';
ALTER TABLE `ln_transaction` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1 COMMENT 'location.id (no FK)';
ALTER TABLE `ln_system_date` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1 COMMENT 'location.id (no FK)';
ALTER TABLE `ln_gl_batch` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1 COMMENT 'location.id (no FK)';
ALTER TABLE `ln_holiday_calendar` MODIFY COLUMN `branchId` INT(11) NULL DEFAULT NULL COMMENT 'location.id (no FK)';
ALTER TABLE `ln_role_gl_mapping` MODIFY COLUMN `branchId` INT(11) NULL DEFAULT NULL COMMENT 'location.id (no FK)';

-- ------------------------------------------------------------------------------
-- 11. Audit log must also cover tables with string keys (lookups)
-- ------------------------------------------------------------------------------
ALTER TABLE `ln_audit_log`
  MODIFY COLUMN `entityId` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `entityKey` VARCHAR(100) NULL AFTER `entityId`,
  ADD INDEX IF NOT EXISTS `idx_audit_entity_key` (`entityName`, `entityKey`);
