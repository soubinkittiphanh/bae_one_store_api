-- SQL script to fix card table inconsistencies
-- Set card_isused to 1 for all cards that are linked to a sale line but are marked as unused.

UPDATE card 
SET card_isused = 1, locking_session_id = '' 
WHERE card_isused = 0 AND saleLineId IS NOT NULL;

-- After running this, please run the "Rebuild Stock" utility in the application 
-- to update the product table's stock_count.
