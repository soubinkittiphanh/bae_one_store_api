-- ==============================================================================
-- DCommerce Loan Module - Phase 5 Part B1, loan account documents (UP)
-- Idempotent. Run via: node loan_migrate.js up
-- Files are stored by the API under a random name (no customer data in the stored name); the original
-- file name is not kept, only its extension. Viewing needs LN_DOCUMENT VIEW, uploading LN_DOCUMENT CREATE.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `ln_account_document` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `loanAccountId` INT(11) NOT NULL,
  `docType` VARCHAR(30) NOT NULL COMMENT 'CONTRACT / ID_CARD / VEHICLE_REG / INSURANCE / RECEIPT / OTHER',
  `storedName` VARCHAR(80) NOT NULL COMMENT 'random file name with the extension',
  `fileExt` VARCHAR(10) NOT NULL,
  `mimeType` VARCHAR(80) NOT NULL,
  `sizeBytes` INT(11) NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `remarks` VARCHAR(255) NULL,
  `uploadedBy` INT(11) NOT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_document_stored` (`storedName`),
  KEY `idx_account_document_account` (`loanAccountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
