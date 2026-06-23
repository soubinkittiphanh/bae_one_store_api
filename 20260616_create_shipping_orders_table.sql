CREATE TABLE IF NOT EXISTS `shipping_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `currency_id` INT DEFAULT NULL,
  `barcode` VARCHAR(255) NOT NULL,
  `final_price` DECIMAL(12, 2) DEFAULT NULL,
  `status` ENUM('PENDING', 'ARRIVED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  `arrived_at` DATETIME DEFAULT NULL,
  `picked_up_at` DATETIME DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  INDEX `idx_shipping_orders_barcode` (`barcode`),
  INDEX `idx_shipping_orders_status` (`status`),
  CONSTRAINT `fk_shipping_orders_client` 
    FOREIGN KEY (`customer_id`) 
    REFERENCES `client` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  CONSTRAINT `fk_shipping_orders_currency`
    FOREIGN KEY (`currency_id`) 
    REFERENCES `currency` (`id`) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
