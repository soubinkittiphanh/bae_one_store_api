-- ==============================================================================
-- DCommerce Loan Module - READ-ONLY state check
-- Purpose: see what the loan Phase 2A scripts left in a database (e.g. the remote
-- dcommerce_demo) before deciding whether to run the DOWN scripts.
-- Contains SELECT statements only. It changes nothing.
--
-- Usage (connect to the target database first):
--   mysql -h <host> -u <user> -p <database> --force < 20261029_loan_phase2a_readonly_check.sql
-- --force keeps going if a table in section C does not exist.
-- ==============================================================================

-- A. Which database, and which ln_* tables exist
SELECT DATABASE() AS current_database, NOW() AS checked_at;
SELECT COUNT(*) AS ln_table_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'ln\_%';
SELECT TABLE_NAME, CREATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'ln\_%'
ORDER BY TABLE_NAME;

-- Corrections migration applied? (ln_param_change exists only after 20261029)
SELECT COUNT(*) AS corrections_applied
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('ln_param_change', 'ln_checklist_confirmation');

-- B. chart_of_account.accountType change
SELECT COLUMN_TYPE AS accountType_definition
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_account' AND COLUMN_NAME = 'accountType';
SELECT COUNT(*) AS off_balance_accounts FROM chart_of_account WHERE accountType = 'Off-Balance';

-- C. Business data (if any count is > 0, the DOWN scripts would delete real loan data)
SELECT 'ln_application' AS tbl, COUNT(*) AS row_count FROM ln_application
UNION ALL SELECT 'ln_account', COUNT(*) FROM ln_account
UNION ALL SELECT 'ln_transaction', COUNT(*) FROM ln_transaction
UNION ALL SELECT 'ln_schedule', COUNT(*) FROM ln_schedule
UNION ALL SELECT 'ln_journal_posting', COUNT(*) FROM ln_journal_posting
UNION ALL SELECT 'ln_collateral_master', COUNT(*) FROM ln_collateral_master
UNION ALL SELECT 'ln_accounting_entry_rule', COUNT(*) FROM ln_accounting_entry_rule
UNION ALL SELECT 'ln_role_gl_mapping', COUNT(*) FROM ln_role_gl_mapping;

-- D. Seeded parameter data
SELECT 'ln_product' AS tbl, COUNT(*) AS row_count FROM ln_product
UNION ALL SELECT 'ln_component', COUNT(*) FROM ln_component
UNION ALL SELECT 'ln_tax_profile', COUNT(*) FROM ln_tax_profile
UNION ALL SELECT 'ln_tax_master', COUNT(*) FROM ln_tax_master
UNION ALL SELECT 'ln_regulatory_class', COUNT(*) FROM ln_regulatory_class
UNION ALL SELECT 'ln_provision_rule', COUNT(*) FROM ln_provision_rule
UNION ALL SELECT 'ln_status_master', COUNT(*) FROM ln_status_master
UNION ALL SELECT 'ln_status_movement_rule', COUNT(*) FROM ln_status_movement_rule
UNION ALL SELECT 'ln_accounting_role', COUNT(*) FROM ln_accounting_role
UNION ALL SELECT 'ln_amount_tag', COUNT(*) FROM ln_amount_tag
UNION ALL SELECT 'ln_event_master', COUNT(*) FROM ln_event_master
UNION ALL SELECT 'ln_numbering_sequence', COUNT(*) FROM ln_numbering_sequence
UNION ALL SELECT 'ln_system_date', COUNT(*) FROM ln_system_date
UNION ALL SELECT 'ln_batch_job', COUNT(*) FROM ln_batch_job;
SELECT productCode, version, authStatus, createdAt FROM ln_product ORDER BY id;
SELECT confirmationStatus, confirmedBy, confirmedAt, createdAt FROM ln_tax_profile;

-- E. Loan menu rows added by seed_loan_menus.js
SELECT id, code, name, createdAt FROM menuHeader WHERE code = 'LOAN';
SELECT id, name, path, createdAt FROM menuLine WHERE path LIKE '/admin/loan/%';
SELECT COUNT(*) AS loan_menu_links
FROM MenuHeaderLines mhl JOIN menuHeader mh ON mh.id = mhl.menuHeaderId
WHERE mh.code = 'LOAN';
