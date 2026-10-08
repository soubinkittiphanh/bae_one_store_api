-- Create Annual Expense Budget table and alter payment_header
CREATE TABLE IF NOT EXISTS `annual_expense_budget` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `year` INT NOT NULL,
  `allocatedAmount` DECIMAL(30, 2) NOT NULL DEFAULT 0.00,
  `exchangeRate` DECIMAL(30, 2) NOT NULL DEFAULT 1.00,
  `thresholdWarningPercent` INT NOT NULL DEFAULT 80,
  `drAccountId` INT NULL,
  `ministryId` INT NULL,
  `currencyId` INT NOT NULL,
  `remark` VARCHAR(255) NULL DEFAULT '',
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expense_budget_year` (`year`),
  KEY `idx_expense_budget_account` (`drAccountId`),
  KEY `idx_expense_budget_currency` (`currencyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Safely add columns to payment_header (apPaymentHeader)
ALTER TABLE `payment_header`
  ADD COLUMN IF NOT EXISTS `expenseSource` VARCHAR(50) NOT NULL DEFAULT 'POS_SALE',
  ADD COLUMN IF NOT EXISTS `budgetId` INT NULL,
  ADD COLUMN IF NOT EXISTS `budgetImpactYear` INT NULL;

ALTER TABLE `payment_header`
  ADD INDEX IF NOT EXISTS `idx_payment_expense_source` (`expenseSource`),
  ADD INDEX IF NOT EXISTS `idx_payment_budget_id` (`budgetId`);
