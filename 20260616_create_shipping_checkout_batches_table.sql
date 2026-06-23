CREATE TABLE IF NOT EXISTS `shipping_checkout_batches` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `total_price` DECIMAL(12, 2) NOT NULL,
  `createdAt` DATETIME NOT NULL,
  `updateTimestamp` DATETIME NOT NULL,
  CONSTRAINT `fk_checkout_batches_client` 
    FOREIGN KEY (`customer_id`) 
    REFERENCES `client` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `shipping_orders` 
  ADD COLUMN IF NOT EXISTS `checkout_batch_id` INT DEFAULT NULL,
  ADD CONSTRAINT `fk_shipping_orders_checkout_batch` 
    FOREIGN KEY (`checkout_batch_id`) 
    REFERENCES `shipping_checkout_batches` (`id`) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;

ALTER TABLE `salePayment`
  ADD COLUMN IF NOT EXISTS `shippingCheckoutBatchId` INT DEFAULT NULL,
  ADD CONSTRAINT `fk_sale_payment_shipping_checkout_batch`
    FOREIGN KEY (`shippingCheckoutBatchId`)
    REFERENCES `shipping_checkout_batches` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
