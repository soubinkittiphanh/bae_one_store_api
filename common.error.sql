-- delete salePayment that not in saleHeader
DELETE FROM salePayment 
WHERE saleHeaderId NOT IN (SELECT id FROM saleHeader) 
AND saleHeaderId IS NOT NULL;