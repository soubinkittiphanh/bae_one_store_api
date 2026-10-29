-- ==============================================================================
-- DCommerce Loan Module - Phase 2A schema corrections (DOWN)
-- Reverses 20261029_loan_phase2a_corrections.sql. Run via: node loan_migrate.js down
-- Restoring ln_tax_master UNIQUE(taxCode) fails if several effective-dated rows
-- share a taxCode; resolve those rows first.
-- ==============================================================================

-- 11. Audit log
ALTER TABLE `ln_audit_log` DROP INDEX IF EXISTS `idx_audit_entity_key`, DROP COLUMN IF EXISTS `entityKey`;
UPDATE `ln_audit_log` SET `entityId` = 0 WHERE `entityId` IS NULL;
ALTER TABLE `ln_audit_log` MODIFY COLUMN `entityId` INT(11) NOT NULL;

-- 10. branchId comments
ALTER TABLE `ln_application` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1;
ALTER TABLE `ln_account` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1;
ALTER TABLE `ln_transaction` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1;
ALTER TABLE `ln_system_date` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1;
ALTER TABLE `ln_gl_batch` MODIFY COLUMN `branchId` INT(11) NOT NULL DEFAULT 1;
ALTER TABLE `ln_holiday_calendar` MODIFY COLUMN `branchId` INT(11) NULL DEFAULT NULL;
ALTER TABLE `ln_role_gl_mapping` MODIFY COLUMN `branchId` INT(11) NULL DEFAULT NULL;

-- 9. Account status default
ALTER TABLE `ln_account` ALTER COLUMN `status` SET DEFAULT 'ACTIVE';

-- 8. Provision policy note
ALTER TABLE `ln_provision_rule` DROP COLUMN IF EXISTS `policyNote`;

-- 7. glBatchId
ALTER TABLE `ln_journal_posting` MODIFY COLUMN `glBatchId` VARCHAR(50) NULL;
ALTER TABLE `ln_accrual_ledger` MODIFY COLUMN `glBatchId` VARCHAR(50) NULL;
ALTER TABLE `ln_provision_ledger` MODIFY COLUMN `glBatchId` VARCHAR(50) NULL;

-- 6. Generated unique keys
ALTER TABLE `ln_accounting_entry_rule` DROP INDEX IF EXISTS `uk_accounting_entry_rule`;
ALTER TABLE `ln_accounting_entry_rule` DROP COLUMN IF EXISTS `ukCategoryId`, DROP COLUMN IF EXISTS `ukProductId`;
ALTER TABLE `ln_role_gl_mapping` DROP INDEX IF EXISTS `uk_role_gl_mapping`;
ALTER TABLE `ln_role_gl_mapping`
  DROP COLUMN IF EXISTS `ukStatusQualifier`, DROP COLUMN IF EXISTS `ukCurrencyId`,
  DROP COLUMN IF EXISTS `ukBranchId`, DROP COLUMN IF EXISTS `ukCategoryId`, DROP COLUMN IF EXISTS `ukProductId`;

-- 5. Tax master (fill NULL rates from the POS row before restoring NOT NULL)
UPDATE `ln_tax_master` m LEFT JOIN `tax` t ON t.id = m.posTaxId SET m.taxRate = t.rate WHERE m.taxRate IS NULL;
ALTER TABLE `ln_tax_master`
  DROP INDEX IF EXISTS `uk_tax_master_code_from`,
  MODIFY COLUMN `taxRate` DECIMAL(9,6) NOT NULL DEFAULT 0.070000,
  DROP COLUMN IF EXISTS `posTaxId`,
  ADD UNIQUE INDEX IF NOT EXISTS `taxCode` (`taxCode`);

-- 4. Tax profile (original columns restored, rate back-filled from the POS row)
ALTER TABLE `ln_tax_profile`
  ADD COLUMN IF NOT EXISTS `defaultVatRate` DECIMAL(9,6) NOT NULL DEFAULT 0.070000 AFTER `confirmedAt`,
  ADD COLUMN IF NOT EXISTS `taxPayableAccountId` INT(11) NULL AFTER `defaultVatRate`;
UPDATE `ln_tax_profile` p JOIN `tax` t ON t.id = p.posTaxId SET p.defaultVatRate = t.rate;
ALTER TABLE `ln_tax_profile` DROP COLUMN IF EXISTS `lastModifiedBy`, DROP COLUMN IF EXISTS `posTaxId`;

-- 3. / 2. New tables
DROP TABLE IF EXISTS `ln_checklist_confirmation`;
DROP TABLE IF EXISTS `ln_param_change`;

-- 1. Maker-checker columns
ALTER TABLE `ln_transaction` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_lookup_loan_type`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_frequency`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_disbursement_target`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_holiday_handling`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_day_count`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_rebate_method`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_accrual_method`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_collateral_type`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_loan_purpose`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_lookup_deferred_fee_presentation`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_product_currency`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_ude`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_rate_index_value`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_rate_tier`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_holiday_calendar`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_holiday_date`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_amount_tag`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_event_master`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_numbering_sequence`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_batch_job`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `authStatus`;
ALTER TABLE `ln_product_category`
  DROP COLUMN IF EXISTS `authorizedAt`;
ALTER TABLE `ln_product_category` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_product`
  DROP COLUMN IF EXISTS `authorizedAt`;
ALTER TABLE `ln_product` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_component`
  DROP COLUMN IF EXISTS `authorizedAt`;
ALTER TABLE `ln_component` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_product_component`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_product_component` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_product_ude`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_product_ude` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_rate_index`
  DROP COLUMN IF EXISTS `authorizedAt`;
ALTER TABLE `ln_rate_index` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_waterfall_rule`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_waterfall_rule` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_fee_master`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_fee_master` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_tax_master`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_tax_master` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_regulatory_class`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_regulatory_class` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_status_master`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_status_master` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_status_movement_rule`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_status_movement_rule` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_status_cure_rule`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_status_cure_rule` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_provision_rule`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_provision_rule` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_approval_matrix`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_approval_matrix` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_document_checklist`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_document_checklist` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_accounting_role`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_accounting_role` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_accounting_entry_rule`
  DROP COLUMN IF EXISTS `authorizedAt`,
  DROP COLUMN IF EXISTS `checkerId`,
  DROP COLUMN IF EXISTS `makerId`;
ALTER TABLE `ln_accounting_entry_rule` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
ALTER TABLE `ln_role_gl_mapping`
  DROP COLUMN IF EXISTS `authorizedAt`;
ALTER TABLE `ln_role_gl_mapping` ALTER COLUMN `authStatus` SET DEFAULT 'AUTHORIZED';
