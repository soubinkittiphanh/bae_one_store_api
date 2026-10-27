-- =============================================================================
-- Migration: Car Parking Management Module Tables
-- Tables: parking_zones, parking_slots, parking_vehicles, parking_pricing_rules,
--         parking_monthly_passes, parking_tickets, parking_payments
-- Timezone: Asia/Vientiane (+07:00), Currency: LAK
-- =============================================================================

-- 1. parking_zones
CREATE TABLE IF NOT EXISTS `parking_zones` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `floor` VARCHAR(50) NULL,
  `description` VARCHAR(255) NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdById` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parking_zones_code` (`code`),
  KEY `idx_parking_zones_created_by` (`createdById`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. parking_slots
CREATE TABLE IF NOT EXISTS `parking_slots` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `zoneId` INT NOT NULL,
  `slotNumber` VARCHAR(50) NOT NULL,
  `slotType` ENUM('car', 'motorbike', 'vip', 'disabled', 'truck') NOT NULL DEFAULT 'car',
  `status` ENUM('available', 'occupied', 'reserved', 'out_of_service') NOT NULL DEFAULT 'available',
  `currentTicketId` INT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_zone_slot` (`zoneId`, `slotNumber`),
  KEY `idx_parking_slots_status` (`status`),
  KEY `idx_parking_slots_type` (`slotType`),
  KEY `idx_parking_slots_ticket` (`currentTicketId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. parking_vehicles
CREATE TABLE IF NOT EXISTS `parking_vehicles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `plateNumber` VARCHAR(50) NOT NULL UNIQUE,
  `vehicleType` ENUM('car', 'motorbike', 'vip', 'disabled', 'truck') NOT NULL DEFAULT 'car',
  `driverName` VARCHAR(100) NULL,
  `driverPhone` VARCHAR(50) NULL,
  `brand` VARCHAR(50) NULL,
  `color` VARCHAR(50) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parking_vehicles_plate` (`plateNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. parking_pricing_rules
CREATE TABLE IF NOT EXISTS `parking_pricing_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `vehicleType` ENUM('car', 'motorbike', 'vip', 'disabled', 'truck') NOT NULL,
  `gracePeriodMinutes` INT NOT NULL DEFAULT 15,
  `dayStartTime` VARCHAR(10) NOT NULL DEFAULT '06:00',
  `dayEndTime` VARCHAR(10) NOT NULL DEFAULT '18:00',
  `dayHourlyRate` DECIMAL(15, 2) NOT NULL DEFAULT 5000.00,
  `nightHourlyRate` DECIMAL(15, 2) NOT NULL DEFAULT 10000.00,
  `nightPricingType` ENUM('HOURLY', 'FLAT') NOT NULL DEFAULT 'HOURLY',
  `dailyCap` DECIMAL(15, 2) NOT NULL DEFAULT 50000.00,
  `lostTicketFee` DECIMAL(15, 2) NOT NULL DEFAULT 100000.00,
  `isDefault` TINYINT(1) NOT NULL DEFAULT 1,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdById` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pricing_vehicle_type` (`vehicleType`),
  KEY `idx_pricing_is_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. parking_monthly_passes
CREATE TABLE IF NOT EXISTS `parking_monthly_passes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `passNumber` VARCHAR(50) NOT NULL UNIQUE,
  `plateNumber` VARCHAR(50) NOT NULL,
  `vehicleType` ENUM('car', 'motorbike', 'vip', 'disabled', 'truck') NOT NULL DEFAULT 'car',
  `customerName` VARCHAR(100) NOT NULL,
  `customerPhone` VARCHAR(50) NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `feeAmount` DECIMAL(15, 2) NOT NULL DEFAULT 300000.00,
  `paymentStatus` ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'paid',
  `status` ENUM('active', 'expired', 'suspended', 'cancelled') NOT NULL DEFAULT 'active',
  `slotId` INT NULL,
  `notes` TEXT NULL,
  `createdById` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_monthly_pass_plate` (`plateNumber`),
  KEY `idx_monthly_pass_status_dates` (`status`, `startDate`, `endDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. parking_tickets
CREATE TABLE IF NOT EXISTS `parking_tickets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ticketNumber` VARCHAR(50) NOT NULL UNIQUE,
  `barcode` VARCHAR(100) NOT NULL UNIQUE,
  `vehicleId` INT NOT NULL,
  `plateNumber` VARCHAR(50) NOT NULL,
  `vehicleType` ENUM('car', 'motorbike', 'vip', 'disabled', 'truck') NOT NULL DEFAULT 'car',
  `zoneId` INT NOT NULL,
  `slotId` INT NOT NULL,
  `entryTime` DATETIME NOT NULL,
  `exitTime` DATETIME NULL,
  `durationMinutes` INT NOT NULL DEFAULT 0,
  `status` ENUM('active', 'paid', 'completed', 'lost', 'cancelled') NOT NULL DEFAULT 'active',
  `pricingRuleId` INT NULL,
  `monthlyPassId` INT NULL,
  `isMonthlyPass` TINYINT(1) NOT NULL DEFAULT 0,
  `isLostTicket` TINYINT(1) NOT NULL DEFAULT 0,
  `calculatedFee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `paidFee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `discountAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `penaltyFee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `entryUserId` INT NOT NULL,
  `exitUserId` INT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_plate_status` (`plateNumber`, `status`),
  KEY `idx_tickets_ticket_num` (`ticketNumber`),
  KEY `idx_tickets_barcode` (`barcode`),
  KEY `idx_tickets_entry_time` (`entryTime`),
  KEY `idx_tickets_slot_id` (`slotId`),
  KEY `idx_tickets_entry_user` (`entryUserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. parking_payments
CREATE TABLE IF NOT EXISTS `parking_payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `paymentNumber` VARCHAR(50) NOT NULL UNIQUE,
  `ticketId` INT NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `paymentMethod` ENUM('CASH', 'TRANSFER', 'QR', 'CARD', 'FREE_PASS') NOT NULL DEFAULT 'CASH',
  `paymentStatus` ENUM('completed', 'refunded', 'void') NOT NULL DEFAULT 'completed',
  `referenceNo` VARCHAR(100) NULL,
  `paidAt` DATETIME NOT NULL,
  `cashierId` INT NOT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payments_ticket` (`ticketId`),
  KEY `idx_payments_paid_at` (`paidAt`),
  KEY `idx_payments_cashier` (`cashierId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
