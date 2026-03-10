-- delete salePayment that not in saleHeader
DELETE FROM salePayment 
WHERE saleHeaderId NOT IN (SELECT id FROM saleHeader) 
AND saleHeaderId IS NOT NULL;

DELETE FROM image_path 
WHERE productId NOT IN (SELECT id FROM product) 
AND productId IS NOT NULL;

drop table recipe;
truncate table recipe;