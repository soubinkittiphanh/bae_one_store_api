-- =============================================================================
-- Parking: customer-maintained vehicle types (ປະເພດຍານພາຫະນະ)
-- Replaces the hard-coded ENUM('car','motorbike','vip','disabled','truck')
-- with a master table. Referencing columns become VARCHAR(30) codes.
-- Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `parking_vehicle_types` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(30) NOT NULL,
  `nameLa` VARCHAR(100) NOT NULL,
  `nameEn` VARCHAR(100) NULL,
  `icon` VARCHAR(50) NOT NULL DEFAULT 'mdi-car',
  `color` VARCHAR(20) NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isDefault` TINYINT(1) NOT NULL DEFAULT 0,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdById` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updateTimestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_parking_vehicle_types_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Match the other parking tables (utf8mb4_unicode_ci). The DB default is utf8mb4_general_ci, and a
-- mismatch makes joins on `code` fail with "Illegal mix of collations". Fixes tables created by the
-- first version of this script. Text is kept, only the collation/indexes are rebuilt.
-- (No semicolons in comments: seed_parking_data.js splits this file on them.)
ALTER TABLE `parking_vehicle_types` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the 5 types that were previously hard-coded
INSERT IGNORE INTO `parking_vehicle_types` (`code`, `nameLa`, `nameEn`, `icon`, `color`, `sortOrder`, `isDefault`, `isActive`) VALUES
  ('car',       'ລົດໃຫຍ່',       'Car',              'mdi-car',                      '#1E88E5', 1, 1, 1),
  ('motorbike', 'ລົດຈັກ',        'Motorbike',        'mdi-motorbike',                '#FB8C00', 2, 0, 1),
  ('truck',     'ລົດບັນທຸກ',      'Truck',            'mdi-truck',                    '#7C3AED', 3, 0, 1),
  ('vip',       'ລົດ VIP',       'VIP',              'mdi-star',                     '#F9A825', 4, 0, 1),
  ('disabled',  'ຄົນພິການ',      'Disabled',         'mdi-wheelchair-accessibility', '#0D9488', 5, 0, 1);

-- Convert ENUM columns to VARCHAR codes (existing values are preserved)
ALTER TABLE `parking_vehicles`       MODIFY `vehicleType` VARCHAR(30) NOT NULL DEFAULT 'car';
ALTER TABLE `parking_pricing_rules`  MODIFY `vehicleType` VARCHAR(30) NOT NULL;
ALTER TABLE `parking_monthly_passes` MODIFY `vehicleType` VARCHAR(30) NOT NULL DEFAULT 'car';
ALTER TABLE `parking_tickets`        MODIFY `vehicleType` VARCHAR(30) NOT NULL DEFAULT 'car';
ALTER TABLE `parking_slots`          MODIFY `slotType`    VARCHAR(30) NOT NULL DEFAULT 'car';

-- Safety net: register any code already used in data but missing from the master
INSERT IGNORE INTO `parking_vehicle_types` (`code`, `nameLa`, `nameEn`, `icon`, `sortOrder`, `isDefault`, `isActive`)
SELECT DISTINCT t.code, t.code, t.code, 'mdi-car', 99, 0, 1 FROM (
  SELECT `vehicleType` AS code FROM `parking_vehicles`
  UNION SELECT `vehicleType` FROM `parking_pricing_rules`
  UNION SELECT `vehicleType` FROM `parking_monthly_passes`
  UNION SELECT `vehicleType` FROM `parking_tickets`
  UNION SELECT `slotType` FROM `parking_slots`
) t WHERE t.code IS NOT NULL AND t.code <> '';
