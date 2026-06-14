-- delete salePayment that not in saleHeader
DELETE FROM salePayment 
WHERE saleHeaderId NOT IN (SELECT id FROM saleHeader) 
AND saleHeaderId IS NOT NULL;

DELETE FROM image_path 
WHERE productId NOT IN (SELECT id FROM product) 
AND productId IS NOT NULL;

drop table recipe;
truncate table recipe;



UPDATE transactionEntry 
SET bankAccountId = NULL 
WHERE bankAccountId IS NOT NULL 
AND bankAccountId NOT IN (SELECT id FROM bankAccount);

-- Seed STOCK.VAR SPF Configuration (Y = enabled, N = disabled)
INSERT INTO SPF (code, value, remark, isActive, createdAt, updateTimestamp)
VALUES ('STOCK.VAR', 'Y', 'Enable POS variant-level stock validation (Size/Color) [Y/N]', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE value = 'Y';