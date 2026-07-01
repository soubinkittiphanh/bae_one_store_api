CREATE TABLE IF NOT EXISTS `pwt_projects` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(100) NOT NULL UNIQUE,
  `name_lo` VARCHAR(255) NOT NULL,
  `name_en` VARCHAR(255) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `donor` VARCHAR(100) DEFAULT 'ADB',
  `total_budget` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `counterpart_ratio` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  `currency_id` INT DEFAULT NULL,
  `status` ENUM('ACTIVE', 'COMPLETED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  CONSTRAINT `fk_pwt_projects_currency`
    FOREIGN KEY (`currency_id`) 
    REFERENCES `currency` (`id`) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pwt_project_budgets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `category_name` VARCHAR(150) NOT NULL,
  `allocated_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `committed_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `spent_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  CONSTRAINT `fk_pwt_project_budgets_project`
    FOREIGN KEY (`project_id`) 
    REFERENCES `pwt_projects` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pwt_project_contracts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `contract_number` VARCHAR(100) NOT NULL UNIQUE,
  `contractor_name` VARCHAR(255) NOT NULL,
  `total_value` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `committed_value` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `spent_value` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `currency_id` INT DEFAULT NULL,
  `retention_rate` DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
  `status` ENUM('ACTIVE', 'COMPLETED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  CONSTRAINT `fk_pwt_project_contracts_project`
    FOREIGN KEY (`project_id`) 
    REFERENCES `pwt_projects` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pwt_project_contracts_currency`
    FOREIGN KEY (`currency_id`) 
    REFERENCES `currency` (`id`) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pwt_withdrawal_applications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `wa_number` VARCHAR(100) NOT NULL UNIQUE,
  `wa_date` DATE NOT NULL,
  `amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('DRAFT', 'SUBMITTED', 'DISBURSED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  CONSTRAINT `fk_pwt_wa_project`
    FOREIGN KEY (`project_id`) 
    REFERENCES `pwt_projects` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pwt_project_invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `contract_id` INT NOT NULL,
  `invoice_number` VARCHAR(100) NOT NULL,
  `claim_number` INT NOT NULL,
  `invoice_date` DATE NOT NULL,
  `gross_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `retention_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `net_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `adb_funding_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `counterpart_funding_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `withdrawal_application_id` INT DEFAULT NULL,
  `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  CONSTRAINT `fk_pwt_project_invoices_contract`
    FOREIGN KEY (`contract_id`) 
    REFERENCES `pwt_project_contracts` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  CONSTRAINT `fk_pwt_project_invoices_wa`
    FOREIGN KEY (`withdrawal_application_id`) 
    REFERENCES `pwt_withdrawal_applications` (`id`) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
