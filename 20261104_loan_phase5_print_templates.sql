-- ==============================================================================
-- DCommerce Loan Module - Phase 5 Part B7, print templates (UP)
-- Idempotent. Run via: node loan_migrate.js up
-- Contract wording is an editable, maker-checker template (decision D11), never hard-coded in a screen.
-- The body is plain text with {{placeholders}} from a fixed list (paramRegistry 'print-template').
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `ln_print_template` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `templateCode` VARCHAR(40) NOT NULL COMMENT 'CONTRACT_SUMMARY / RECEIPT_FOOTER / STATEMENT_FOOTER',
  `title` VARCHAR(150) NOT NULL,
  `body` TEXT NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `authStatus` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `makerId` INT(11) NULL,
  `checkerId` INT(11) NULL,
  `authorizedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_print_template` (`templateCode`, `effectiveFrom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
