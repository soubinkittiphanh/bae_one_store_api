-- Correction for card stock not correct --
UPDATE card SET card_isused=0 WHERE saleLineId IS NULL 