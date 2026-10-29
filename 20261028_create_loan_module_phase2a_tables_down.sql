-- ==============================================================================
-- DCommerce Loan Module - Phase 2A DDL (DOWN)
-- Reverses 20261028_create_loan_module_phase2a_tables.sql.
-- Run 20261029_loan_phase2a_corrections_down.sql first. Run via: node loan_migrate.js down --yes
--
-- DESTRUCTIVE: drops every ln_* table created by the UP script, including all loan data.
-- The ln_* tables have no foreign keys, so drop order does not matter.
-- ==============================================================================

DROP TABLE IF EXISTS `ln_batch_lock`;
DROP TABLE IF EXISTS `ln_batch_log`;
DROP TABLE IF EXISTS `ln_batch_job`;
DROP TABLE IF EXISTS `ln_numbering_sequence`;
DROP TABLE IF EXISTS `ln_system_date`;
DROP TABLE IF EXISTS `ln_idempotency`;
DROP TABLE IF EXISTS `ln_amendment_history`;
DROP TABLE IF EXISTS `ln_status_history`;
DROP TABLE IF EXISTS `ln_journal_posting`;
DROP TABLE IF EXISTS `ln_transaction_allocation`;
DROP TABLE IF EXISTS `ln_transaction`;
DROP TABLE IF EXISTS `ln_accrual_ledger`;
DROP TABLE IF EXISTS `ln_schedule_component`;
DROP TABLE IF EXISTS `ln_schedule`;
DROP TABLE IF EXISTS `ln_account_balance`;
DROP TABLE IF EXISTS `ln_account_ude`;
DROP TABLE IF EXISTS `ln_account_param_snapshot`;
DROP TABLE IF EXISTS `ln_account`;
DROP TABLE IF EXISTS `ln_guarantor`;
DROP TABLE IF EXISTS `ln_application`;
DROP TABLE IF EXISTS `ln_loan_collateral`;
DROP TABLE IF EXISTS `ln_collateral_vehicle`;
DROP TABLE IF EXISTS `ln_collateral_master`;
DROP TABLE IF EXISTS `ln_gl_batch`;
DROP TABLE IF EXISTS `ln_role_gl_mapping`;
DROP TABLE IF EXISTS `ln_accounting_entry_rule`;
DROP TABLE IF EXISTS `ln_event_master`;
DROP TABLE IF EXISTS `ln_amount_tag`;
DROP TABLE IF EXISTS `ln_accounting_role`;
DROP TABLE IF EXISTS `ln_audit_log`;
DROP TABLE IF EXISTS `ln_application_document`;
DROP TABLE IF EXISTS `ln_document_checklist`;
DROP TABLE IF EXISTS `ln_approval_log`;
DROP TABLE IF EXISTS `ln_approval_matrix`;
DROP TABLE IF EXISTS `ln_provision_ledger`;
DROP TABLE IF EXISTS `ln_provision_rule`;
DROP TABLE IF EXISTS `ln_status_cure_rule`;
DROP TABLE IF EXISTS `ln_status_movement_rule`;
DROP TABLE IF EXISTS `ln_status_master`;
DROP TABLE IF EXISTS `ln_regulatory_class`;
DROP TABLE IF EXISTS `ln_tax_master`;
DROP TABLE IF EXISTS `ln_fee_master`;
DROP TABLE IF EXISTS `ln_holiday_date`;
DROP TABLE IF EXISTS `ln_holiday_calendar`;
DROP TABLE IF EXISTS `ln_waterfall_rule`;
DROP TABLE IF EXISTS `ln_rate_tier`;
DROP TABLE IF EXISTS `ln_rate_index_value`;
DROP TABLE IF EXISTS `ln_rate_index`;
DROP TABLE IF EXISTS `ln_product_ude`;
DROP TABLE IF EXISTS `ln_ude`;
DROP TABLE IF EXISTS `ln_product_component`;
DROP TABLE IF EXISTS `ln_component`;
DROP TABLE IF EXISTS `ln_product_currency`;
DROP TABLE IF EXISTS `ln_product`;
DROP TABLE IF EXISTS `ln_product_category`;
DROP TABLE IF EXISTS `ln_tax_profile`;
DROP TABLE IF EXISTS `ln_lookup_deferred_fee_presentation`;
DROP TABLE IF EXISTS `ln_lookup_loan_purpose`;
DROP TABLE IF EXISTS `ln_lookup_collateral_type`;
DROP TABLE IF EXISTS `ln_lookup_accrual_method`;
DROP TABLE IF EXISTS `ln_lookup_rebate_method`;
DROP TABLE IF EXISTS `ln_lookup_day_count`;
DROP TABLE IF EXISTS `ln_lookup_holiday_handling`;
DROP TABLE IF EXISTS `ln_lookup_disbursement_target`;
DROP TABLE IF EXISTS `ln_lookup_frequency`;
DROP TABLE IF EXISTS `ln_lookup_loan_type`;

-- Restore the original chart_of_account.accountType ENUM.
-- In strict mode this fails (no data change) if any account still uses 'Off-Balance';
-- loan_migrate.js checks for such rows and stops before this point.
ALTER TABLE `chart_of_account` MODIFY COLUMN `accountType` ENUM('Asset', 'Liability', 'Equity', 'Revenue', 'Expense') NOT NULL;
