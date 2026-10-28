-- ==============================================================================
-- DCommerce Loan Module - Phase 2A DDL Migration Script
-- Comprehensive Core Banking Parameter-Driven Schema (54 Tables)
-- Engine: MariaDB 10.x / MySQL 8.x InnoDB
-- Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci
-- ==============================================================================

-- 0. Schema Pre-reconciliation: Support Off-Balance in chart_of_account if not already present
ALTER TABLE `chart_of_account` MODIFY COLUMN `accountType` ENUM('Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'Off-Balance') NOT NULL;

-- ------------------------------------------------------------------------------
-- 1. BUSINESS RULE LOOKUP TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_lookup_loan_type` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_frequency` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `daysInterval` INT NOT NULL DEFAULT 30,
  `periodsPerYear` DECIMAL(9,6) NOT NULL DEFAULT 12.000000,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_disbursement_target` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_holiday_handling` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_day_count` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `daysInYear` INT NOT NULL DEFAULT 365,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_rebate_method` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_accrual_method` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_collateral_type` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_loan_purpose` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_lookup_deferred_fee_presentation` (
  `code` VARCHAR(30) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. TAX PROFILE & VAT GOVERNANCE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_tax_profile` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyVatRegistered` TINYINT(1) NOT NULL DEFAULT 1,
  `confirmationStatus` ENUM('UNCONFIRMED', 'CONFIRMED') NOT NULL DEFAULT 'UNCONFIRMED',
  `confirmedBy` INT NULL,
  `confirmedAt` DATETIME NULL,
  `defaultVatRate` DECIMAL(9,6) NOT NULL DEFAULT 0.070000,
  `taxPayableAccountId` INT NULL,
  `warningBannerActive` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. PRODUCT FACTORY & PARAMETER TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_product_category` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `makerId` INT NULL,
  `checkerId` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_product` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productCode` VARCHAR(30) NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `name` VARCHAR(100) NOT NULL,
  `categoryId` INT NOT NULL,
  `effectiveDate` DATE NOT NULL,
  `expiryDate` DATE NULL,
  `loanTypeCode` VARCHAR(30) NOT NULL,
  `minAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `maxAmount` DECIMAL(20,4) NOT NULL DEFAULT 10000000000.0000,
  `minTenorMonths` INT NOT NULL DEFAULT 1,
  `maxTenorMonths` INT NOT NULL DEFAULT 120,
  `minInterestRate` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `maxInterestRate` DECIMAL(9,6) NOT NULL DEFAULT 1.000000,
  `minDownPaymentPct` DECIMAL(9,6) NOT NULL DEFAULT 0.200000,
  `maxLtvPct` DECIMAL(9,6) NOT NULL DEFAULT 0.800000,
  `disbursementTargetCode` VARCHAR(30) NOT NULL DEFAULT 'SALE_INVOICE_SETTLEMENT',
  `feeFinancingMode` VARCHAR(30) NOT NULL DEFAULT 'UPFRONT',
  `deferredFeePresentation` VARCHAR(30) NOT NULL DEFAULT 'IMMEDIATE',
  `earlySettlementRebateMethod` VARCHAR(30) NOT NULL DEFAULT 'RULE_OF_78',
  `accrualMethodCode` VARCHAR(30) NOT NULL DEFAULT 'DAILY_OUTSTANDING',
  `dayCountCode` VARCHAR(30) NOT NULL DEFAULT '30_360',
  `defaultFrequencyCode` VARCHAR(30) NOT NULL DEFAULT 'MONTHLY',
  `holidayHandlingCode` VARCHAR(30) NOT NULL DEFAULT 'NEXT_WORKING_DAY',
  `partialPrepayOption` VARCHAR(30) NOT NULL DEFAULT 'REDUCE_INSTALLMENT',
  `overpaymentTreatment` VARCHAR(30) NOT NULL DEFAULT 'CUSTOMER_ADVANCE',
  `oldestInstallmentFirst` TINYINT(1) NOT NULL DEFAULT 1,
  `allowRateOverride` TINYINT(1) NOT NULL DEFAULT 0,
  `allowScheduleOverride` TINYINT(1) NOT NULL DEFAULT 0,
  `allowPrepayment` TINYINT(1) NOT NULL DEFAULT 1,
  `allowTopUp` TINYINT(1) NOT NULL DEFAULT 0,
  `allowReschedule` TINYINT(1) NOT NULL DEFAULT 1,
  `allowBackdatedDisbursement` TINYINT(1) NOT NULL DEFAULT 0,
  `requireCollateral` TINYINT(1) NOT NULL DEFAULT 1,
  `requireGuarantor` TINYINT(1) NOT NULL DEFAULT 0,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `makerId` INT NULL,
  `checkerId` INT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  `optLockVersion` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_product_version` (`productCode`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_product_currency` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,
  `currencyId` INT NOT NULL,
  `isDefault` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_product_currency` (`productId`, `currencyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_component` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `componentCode` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `componentType` VARCHAR(30) NOT NULL,
  `calculationBasis` VARCHAR(50) NOT NULL,
  `liquidationMode` VARCHAR(30) NOT NULL DEFAULT 'AUTO',
  `allowPrepay` TINYINT(1) NOT NULL DEFAULT 1,
  `isTaxable` TINYINT(1) NOT NULL DEFAULT 0,
  `taxCode` VARCHAR(30) NULL,
  `taxInclusive` TINYINT(1) NOT NULL DEFAULT 0,
  `taxPointEvent` VARCHAR(30) NOT NULL DEFAULT 'DISB',
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `makerId` INT NULL,
  `checkerId` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_product_component` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,
  `componentId` INT NOT NULL,
  `formulaCode` VARCHAR(50) NOT NULL,
  `defaultValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `minValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `maxValue` DECIMAL(20,4) NOT NULL DEFAULT 1000000000.0000,
  `timing` VARCHAR(30) NOT NULL DEFAULT 'UPFRONT_COLLECTED',
  `isAmendableAtAccount` TINYINT(1) NOT NULL DEFAULT 0,
  `isEIRAmortized` TINYINT(1) NOT NULL DEFAULT 0,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_product_component` (`productId`, `componentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. USER DEFINED ELEMENTS (UDE) & RATE INDEXES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_ude` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `udeCode` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `dataType` VARCHAR(30) NOT NULL DEFAULT 'RATE',
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_product_ude` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,
  `udeCode` VARCHAR(30) NOT NULL,
  `defaultValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `minValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `maxValue` DECIMAL(20,4) NOT NULL DEFAULT 1000000000.0000,
  `isAmendableAtAccount` TINYINT(1) NOT NULL DEFAULT 0,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_product_ude` (`productId`, `udeCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_rate_index` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rateCode` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `resetFrequencyCode` VARCHAR(30) NOT NULL DEFAULT 'MONTHLY',
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `makerId` INT NULL,
  `checkerId` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_rate_index_value` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rateIndexId` INT NOT NULL,
  `effectiveDate` DATE NOT NULL,
  `baseRate` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `optLockVersion` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_rate_index_date` (`rateIndexId`, `effectiveDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_rate_tier` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productComponentId` INT NOT NULL,
  `tierBasis` VARCHAR(30) NOT NULL DEFAULT 'AMOUNT',
  `fromValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `toValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `tierRate` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_waterfall_rule` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,
  `accountStatus` VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  `priorityOrder` INT NOT NULL,
  `componentId` INT NOT NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_product_status_priority` (`productId`, `accountStatus`, `priorityOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. CALENDAR, FEES & TAXES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_holiday_calendar` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `calendarCode` VARCHAR(30) NOT NULL UNIQUE,
  `branchId` INT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_holiday_date` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `calendarId` INT NOT NULL,
  `holidayDate` DATE NOT NULL,
  `description` VARCHAR(100) NOT NULL,
  `isWeekend` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_calendar_date` (`calendarId`, `holidayDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_fee_master` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `feeCode` VARCHAR(30) NOT NULL UNIQUE,
  `componentId` INT NULL,
  `feeType` VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
  `calcMethod` VARCHAR(30) NOT NULL DEFAULT 'FLAT',
  `basisAmountType` VARCHAR(50) NOT NULL DEFAULT 'ORIGINAL_SANCTIONED',
  `minAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `maxAmount` DECIMAL(20,4) NOT NULL DEFAULT 100000000.0000,
  `isEirAmortized` TINYINT(1) NOT NULL DEFAULT 0,
  `taxApplicable` TINYINT(1) NOT NULL DEFAULT 1,
  `triggerEventCode` VARCHAR(30) NOT NULL DEFAULT 'DISB',
  `accountingRoleCode` VARCHAR(50) NOT NULL DEFAULT 'FEE_INCOME',
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_tax_master` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `taxCode` VARCHAR(30) NOT NULL UNIQUE,
  `componentId` INT NULL,
  `taxRate` DECIMAL(9,6) NOT NULL DEFAULT 0.070000,
  `accountingRoleCode` VARCHAR(50) NOT NULL DEFAULT 'TAX_PAYABLE',
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. STATUS, REGULATORY CLASS, PROVISION & CURE RULES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_regulatory_class` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `classCode` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `glQualifier` VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_status_master` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `statusCode` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `regulatoryClassCode` VARCHAR(30) NOT NULL,
  `interestTreatment` VARCHAR(30) NOT NULL DEFAULT 'CONTINUE_ACCRUAL',
  `penaltyTreatment` VARCHAR(30) NOT NULL DEFAULT 'ACCRUE',
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_status_movement_rule` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `fromStatus` VARCHAR(30) NOT NULL,
  `toStatus` VARCHAR(30) NOT NULL,
  `minDpd` INT NOT NULL DEFAULT 0,
  `maxDpd` INT NOT NULL DEFAULT 99999,
  `conditionFormula` TEXT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_status_cure_rule` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `fromStatus` VARCHAR(30) NOT NULL,
  `toStatus` VARCHAR(30) NOT NULL,
  `consecutiveOnTimeInstallmentsRequired` INT NOT NULL DEFAULT 3,
  `observationMonthsRequired` INT NOT NULL DEFAULT 0,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_provision_rule` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `regulatoryClassCode` VARCHAR(30) NOT NULL,
  `productId` INT NULL,
  `categoryId` INT NULL,
  `provisionRate` DECIMAL(9,6) NOT NULL DEFAULT 0.010000,
  `collateralHaircutPct` DECIMAL(9,6) NOT NULL DEFAULT 0.300000,
  `provisionBase` VARCHAR(30) NOT NULL DEFAULT 'NET_EXPOSURE',
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_provision_ledger` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `evaluationDate` DATE NOT NULL,
  `outstandingPrincipal` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `eligibleCollateralValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `netExposure` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `provisionRate` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `requiredProvision` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `bookedProvision` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `deltaProvision` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `glBatchId` VARCHAR(50) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'POSTED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_prov_loan_date` (`loanAccountId`, `evaluationDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. GOVERNANCE, APPROVAL MATRIX & DOCUMENTATION
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_approval_matrix` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entityType` VARCHAR(30) NOT NULL DEFAULT 'APPLICATION',
  `minAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `maxAmount` DECIMAL(20,4) NOT NULL DEFAULT 1000000000.0000,
  `requiredLevel` INT NOT NULL DEFAULT 1,
  `approverRoleId` INT NOT NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_approval_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entityType` VARCHAR(30) NOT NULL,
  `entityId` INT NOT NULL,
  `approvalLevel` INT NOT NULL DEFAULT 1,
  `approverUserId` INT NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `comments` TEXT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_appr_entity` (`entityType`, `entityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_document_checklist` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,
  `documentTypeCode` VARCHAR(50) NOT NULL,
  `documentName` VARCHAR(100) NOT NULL,
  `isMandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_application_document` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `applicationId` INT NOT NULL,
  `documentTypeCode` VARCHAR(50) NOT NULL,
  `fileUrl` VARCHAR(255) NOT NULL,
  `fileName` VARCHAR(150) NOT NULL,
  `isVerified` TINYINT(1) NOT NULL DEFAULT 0,
  `verifiedBy` INT NULL,
  `verifiedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entityName` VARCHAR(50) NOT NULL,
  `entityId` INT NOT NULL,
  `actionType` VARCHAR(30) NOT NULL,
  `oldValuesJson` LONGTEXT NULL,
  `newValuesJson` LONGTEXT NULL,
  `userId` INT NOT NULL,
  `ipAddress` VARCHAR(50) NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_entity` (`entityName`, `entityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 8. ACCOUNTING SETUP STRUCTURE & GL BATCH
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_accounting_role` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `roleCode` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `expectedType` VARCHAR(30) NOT NULL,
  `resolverType` VARCHAR(30) NOT NULL DEFAULT 'MAPPING_TABLE',
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_amount_tag` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tagCode` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_event_master` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `eventCode` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_accounting_entry_rule` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NULL,
  `categoryId` INT NULL,
  `eventCode` VARCHAR(30) NOT NULL,
  `amountTag` VARCHAR(50) NOT NULL,
  `drCr` VARCHAR(10) NOT NULL,
  `roleCode` VARCHAR(50) NOT NULL,
  `qualifierSource` VARCHAR(30) NOT NULL DEFAULT 'CURRENT',
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_role_gl_mapping` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NULL,
  `categoryId` INT NULL,
  `branchId` INT NULL,
  `currencyId` INT NULL,
  `statusQualifier` VARCHAR(30) NULL,
  `roleCode` VARCHAR(50) NOT NULL,
  `chartAccountId` INT NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `isSeedDefault` TINYINT(1) NOT NULL DEFAULT 0,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `makerId` INT NULL,
  `checkerId` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_gl_map_lookup` (`roleCode`, `statusQualifier`, `productId`, `currencyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_gl_batch` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `batchNumber` VARCHAR(50) NOT NULL UNIQUE,
  `businessDate` DATE NOT NULL,
  `batchType` VARCHAR(50) NOT NULL DEFAULT 'EOD_ACCRUAL',
  `totalDebit` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `totalCredit` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `currencyId` INT NOT NULL DEFAULT 1,
  `branchId` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(30) NOT NULL DEFAULT 'POSTED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 9. COLLATERAL & SECURITY
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_collateral_master` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `collateralNo` VARCHAR(30) NOT NULL UNIQUE,
  `collateralTypeCode` VARCHAR(30) NOT NULL DEFAULT 'VEHICLE',
  `customerId` INT NOT NULL,
  `appraisedValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `appraisedDate` DATE NOT NULL,
  `currencyId` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(30) NOT NULL DEFAULT 'PLEDGED',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_collateral_vehicle` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `collateralId` INT NOT NULL UNIQUE,
  `vinChassisNo` VARCHAR(50) NOT NULL,
  `engineNo` VARCHAR(50) NULL,
  `licensePlate` VARCHAR(30) NULL,
  `registrationBookRef` VARCHAR(50) NULL,
  `brand` VARCHAR(50) NOT NULL,
  `model` VARCHAR(50) NOT NULL,
  `year` INT NOT NULL,
  `color` VARCHAR(30) NULL,
  `insurancePolicyNo` VARCHAR(50) NULL,
  `insuranceCompany` VARCHAR(100) NULL,
  `insuranceExpiryDate` DATE NULL,
  `insuranceCoverageAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_vin` (`vinChassisNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_loan_collateral` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `collateralId` INT NOT NULL,
  `allocatedValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `ltvPct` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_loan_collateral` (`loanAccountId`, `collateralId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 10. ORIGINATION, APPLICATION & GUARANTORS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_application` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `appNo` VARCHAR(30) NOT NULL UNIQUE,
  `branchId` INT NOT NULL DEFAULT 1,
  `customerId` INT NOT NULL,
  `productId` INT NOT NULL,
  `currencyId` INT NOT NULL DEFAULT 1,
  `vehicleSaleHeaderId` INT NULL,
  `vehiclePrice` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `downPaymentAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `downPaymentPct` DECIMAL(9,6) NOT NULL DEFAULT 0.200000,
  `requestedAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `tenorMonths` INT NOT NULL DEFAULT 12,
  `interestRate` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `balloonAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `purposeCode` VARCHAR(30) NOT NULL DEFAULT 'VEHICLE_PURCHASE',
  `status` VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  `currentApprovalLevel` INT NOT NULL DEFAULT 0,
  `createdBy` INT NOT NULL,
  `approvedBy` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_guarantor` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `applicationId` INT NOT NULL,
  `loanAccountId` INT NULL,
  `fullName` VARCHAR(100) NOT NULL,
  `idCardPassport` VARCHAR(50) NULL,
  `phone` VARCHAR(30) NULL,
  `relationship` VARCHAR(50) NULL,
  `address` TEXT NULL,
  `monthlyIncome` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `employerName` VARCHAR(100) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 11. CORE ACCOUNT, PARAMETER SNAPSHOT & BALANCES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_account` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `accountNo` VARCHAR(30) NOT NULL UNIQUE,
  `branchId` INT NOT NULL DEFAULT 1,
  `applicationId` INT NOT NULL,
  `customerId` INT NOT NULL,
  `productId` INT NOT NULL,
  `productVersion` INT NOT NULL DEFAULT 1,
  `currencyId` INT NOT NULL DEFAULT 1,
  `saleHeaderId` INT NULL,
  `sanctionedAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `disbursedAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `downPaymentAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `downPaymentCollected` TINYINT(1) NOT NULL DEFAULT 0,
  `interestRate` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `rateIndexId` INT NULL,
  `spread` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `effectiveInterestRate` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `balloonAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `tenorMonths` INT NOT NULL DEFAULT 12,
  `firstDueDate` DATE NOT NULL,
  `valueDate` DATE NOT NULL,
  `maturityDate` DATE NOT NULL,
  `disbursementTarget` VARCHAR(30) NOT NULL DEFAULT 'SALE_INVOICE_SETTLEMENT',
  `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  `regulatoryClass` VARCHAR(30) NOT NULL DEFAULT 'CLASS_A',
  `currentDpd` INT NOT NULL DEFAULT 0,
  `closedAt` DATETIME NULL,
  `optLockVersion` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_account_param_snapshot` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL UNIQUE,
  `productVersion` INT NOT NULL DEFAULT 1,
  `snapshotJson` LONGTEXT NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_account_ude` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `udeCode` VARCHAR(30) NOT NULL,
  `udeValue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_account_ude` (`loanAccountId`, `udeCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_account_balance` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `componentId` INT NOT NULL,
  `outstandingAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `totalAccrued` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `totalBilled` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `totalPaid` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `totalWaived` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `optLockVersion` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_account_component_balance` (`loanAccountId`, `componentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 12. SCHEDULE & ACCRUAL LEDGER
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_schedule` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `installmentNo` INT NOT NULL,
  `dueDate` DATE NOT NULL,
  `originalDueDate` DATE NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
  `optLockVersion` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_account_installment` (`loanAccountId`, `installmentNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_schedule_component` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `scheduleId` INT NOT NULL,
  `componentId` INT NOT NULL,
  `amountDue` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `amountPaid` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `amountWaived` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `status` VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_schedule_comp` (`scheduleId`, `componentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_accrual_ledger` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `componentId` INT NOT NULL,
  `accrualDate` DATE NOT NULL,
  `dailyAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `cumulativeAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `isSuspended` TINYINT(1) NOT NULL DEFAULT 0,
  `glBatchId` VARCHAR(50) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_accrual_loan_date` (`loanAccountId`, `accrualDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 13. TRANSACTIONS & ALLOCATIONS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_transaction` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `txNo` VARCHAR(50) NOT NULL UNIQUE,
  `branchId` INT NOT NULL DEFAULT 1,
  `loanAccountId` INT NOT NULL,
  `eventCode` VARCHAR(30) NOT NULL,
  `valueDate` DATE NOT NULL,
  `postingDate` DATE NOT NULL,
  `amount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `currencyId` INT NOT NULL DEFAULT 1,
  `exchangeRate` DECIMAL(20,8) NOT NULL DEFAULT 1.00000000,
  `baseAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `paymentMethod` VARCHAR(30) NOT NULL DEFAULT 'CASH',
  `paymentMethodId` INT NULL,
  `bankAccountId` INT NULL,
  `isReversed` TINYINT(1) NOT NULL DEFAULT 0,
  `reversalOfTxId` INT NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED',
  `makerId` INT NULL,
  `checkerId` INT NULL,
  `authorizedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_tx_loan_event` (`loanAccountId`, `eventCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_transaction_allocation` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `transactionId` INT NOT NULL,
  `scheduleComponentId` INT NOT NULL,
  `componentId` INT NOT NULL,
  `allocatedAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_journal_posting` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `transactionId` INT NULL,
  `glBatchId` VARCHAR(50) NULL,
  `loanAccountId` INT NULL,
  `eventCode` VARCHAR(30) NOT NULL,
  `amountTag` VARCHAR(50) NOT NULL,
  `roleCode` VARCHAR(50) NOT NULL,
  `chartAccountId` INT NOT NULL,
  `drCr` VARCHAR(10) NOT NULL,
  `amount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `baseAmount` DECIMAL(20,4) NOT NULL DEFAULT 0.0000,
  `exchangeRate` DECIMAL(20,8) NOT NULL DEFAULT 1.00000000,
  `glRecordId` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_jp_tx` (`transactionId`),
  INDEX `idx_jp_batch` (`glBatchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 14. LIFECYCLE HISTORY & AUDIT TRAIL
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_status_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `oldStatus` VARCHAR(30) NOT NULL,
  `newStatus` VARCHAR(30) NOT NULL,
  `changeReason` TEXT NULL,
  `triggeredBy` VARCHAR(30) NOT NULL DEFAULT 'EOD_BATCH',
  `approvalUserId` INT NULL,
  `effectiveDate` DATE NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sh_loan` (`loanAccountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_amendment_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `loanAccountId` INT NOT NULL,
  `amendmentType` VARCHAR(30) NOT NULL,
  `effectiveDate` DATE NOT NULL,
  `oldValuesJson` LONGTEXT NOT NULL,
  `newValuesJson` LONGTEXT NOT NULL,
  `approvedBy` INT NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ah_loan` (`loanAccountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 15. SYSTEM DATES, NUMBERING, IDEMPOTENCY & MUTEX LOCKS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ln_idempotency` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `endpoint` VARCHAR(100) NOT NULL,
  `accountId` INT NULL,
  `idempotencyKey` VARCHAR(100) NOT NULL,
  `requestHash` VARCHAR(64) NOT NULL,
  `responseBody` LONGTEXT NULL,
  `status` INT NOT NULL DEFAULT 200,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_endpoint_account_key` (`endpoint`, `accountId`, `idempotencyKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_system_date` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `branchId` INT NOT NULL DEFAULT 1,
  `currentBusinessDate` DATE NOT NULL,
  `prevBusinessDate` DATE NOT NULL,
  `nextBusinessDate` DATE NOT NULL,
  `periodLockDate` DATE NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_branch_date` (`branchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_numbering_sequence` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sequenceCode` VARCHAR(50) NOT NULL UNIQUE,
  `prefix` VARCHAR(20) NOT NULL,
  `nextNumber` INT NOT NULL DEFAULT 1,
  `paddingLength` INT NOT NULL DEFAULT 6,
  `formatPattern` VARCHAR(50) NOT NULL DEFAULT '{PREFIX}-{YEAR}{MONTH}-{NUMBER}',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_batch_job` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobCode` VARCHAR(30) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `executionOrder` INT NOT NULL,
  `isEnabled` TINYINT(1) NOT NULL DEFAULT 1,
  `lastRunDate` DATE NULL,
  `lastStatus` VARCHAR(30) NOT NULL DEFAULT 'IDLE',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_batch_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `businessDate` DATE NOT NULL,
  `jobCode` VARCHAR(30) NOT NULL,
  `status` VARCHAR(30) NOT NULL,
  `recordsProcessed` INT NOT NULL DEFAULT 0,
  `recordsFailed` INT NOT NULL DEFAULT 0,
  `logMessage` LONGTEXT NULL,
  `executionTimeMs` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ln_batch_lock` (
  `lockName` VARCHAR(50) NOT NULL PRIMARY KEY,
  `acquiredAt` DATETIME NOT NULL,
  `acquiredBy` VARCHAR(100) NOT NULL,
  `expiresAt` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
