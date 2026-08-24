CREATE TABLE IF NOT EXISTS `product_units` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,
  `unitId` INT NOT NULL,
  `price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `barCode` VARCHAR(100) DEFAULT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `isBaseUnit` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  INDEX `idx_product_units_barcode` (`barCode`),
  INDEX `idx_product_units_product` (`productId`),
  INDEX `idx_product_units_unit` (`unitId`),
  CONSTRAINT `fk_product_units_product` 
    FOREIGN KEY (`productId`) 
    REFERENCES `product` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  CONSTRAINT `fk_product_units_unit` 
    FOREIGN KEY (`unitId`) 
    REFERENCES `unitModel` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add unitId to card table
ALTER TABLE `card` ADD COLUMN IF NOT EXISTS `unitId` INT DEFAULT NULL;

-- Add foreign key constraint to card table for unitId if not exists
ALTER TABLE `card` 
  ADD CONSTRAINT `fk_card_unit` 
  FOREIGN KEY IF NOT EXISTS (`unitId`) 
  REFERENCES `unitModel` (`id`) 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;
