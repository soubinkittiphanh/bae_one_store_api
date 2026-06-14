-- This script ensures that any existing `card` records that define `product_id` 
-- but have a NULL `productId` are updated. 
-- Since we now strictly use `productId` for matching in stock updates, 
-- running this ensures existing stock remains sellable.

START TRANSACTION;

UPDATE `card` 
SET `productId` = `product_id` 
WHERE `productId` IS NULL 
  AND `product_id` IS NOT NULL;

COMMIT;
