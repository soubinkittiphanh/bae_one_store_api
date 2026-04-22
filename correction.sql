-- Correction for card stock not correct --
UPDATE card SET card_isused=1 WHERE saleLineId IS not NULL and  card_isused=0;

-- sale cost validation 

SELECT 
    p.pro_name AS product_name,
    sl.quantity,
    sl.price AS sale_price,
    c.cost AS card_cost,
    c.costPerUnit,
    (c.cost * sl.quantity) AS total_cost_of_sale,
    sl.createdAt AS sale_time
FROM saleLine sl
JOIN product p ON sl.productId = p.id
JOIN card c ON c.saleLineId = sl.id
WHERE DATE(sl.createdAt) = CURDATE()
  AND sl.isActive = 1;

-- validation the sale cost and profit

SELECT 
    COUNT(sl.id) AS total_items_sold,
    SUM(sl.total) AS total_revenue,
    SUM(c.cost * sl.quantity) AS total_cost,
    (SUM(sl.total) - SUM(c.cost * sl.quantity)) AS estimated_profit
FROM saleLine sl
JOIN card c ON c.saleLineId = sl.id
WHERE DATE(sl.createdAt) = CURDATE()
  AND sl.isActive = 1;

-- export sale line with card specific date
SELECT 
    'Product Name', 'Card ID', 'Card Number', 'Sale Line ID', 'Sale Header ID', 'Cost at Sale', 'Master Cost', 'Sale Price', 'Booking Date'
UNION ALL
SELECT 
    p.pro_name,
    c.id,
    c.card_number,
    c.saleLineId,
    sl.saleHeaderId,
    c.cost,
    p.cost_price,
    sl.price,             -- This is the 8th column
    sh.bookingDate        -- This is the 9th column
FROM card c
JOIN saleLine sl ON c.saleLineId = sl.id
JOIN saleHeader sh ON sl.saleHeaderId = sh.id
JOIN product p ON c.productId = p.id
WHERE DATE(sh.bookingDate) = '2026-03-17'
    AND c.card_isused = 1
    AND sh.isActive = 1
INTO OUTFILE '/tmp/DCOMMERCE_Sale_Validation_17-MAR.csv'
FIELDS TERMINATED BY ',' 
ENCLOSED BY '"'
LINES TERMINATED BY '\n';


-- scan sale without hitting card stock table
SELECT 
    sl.id AS sale_line_id,
    sl.saleHeaderId,
    p.pro_name AS product_name,
    sl.quantity,
    sl.createdAt,
    p.id AS productId,
    p.pro_id,
    p.createdAt AS product_create_time,
    p.updateTimestamp
FROM saleLine sl
JOIN product p ON sl.productId = p.id
LEFT JOIN card c ON c.saleLineId = sl.id
WHERE c.id IS NULL 
    AND sl.isActive = 1;

-- correction link saleLine without card hitting scrip procedure

    DELIMITER //

    CREATE OR REPLACE PROCEDURE LinkOrphanSales()
    BEGIN
        DECLARE done INT DEFAULT FALSE;
        DECLARE v_saleLineId INT;
        DECLARE v_productId INT;
        DECLARE v_qty INT;
        
        -- Cursor to find all saleLines that have no linked cards
        DECLARE cur CURSOR FOR 
            SELECT sl.id, sl.productId, CAST(sl.quantity AS UNSIGNED)
            FROM saleLine sl
            LEFT JOIN card c ON c.saleLineId = sl.id
            WHERE c.id IS NULL AND sl.isActive = 1;
            
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

        OPEN cur;

        read_loop: LOOP
            FETCH cur INTO v_saleLineId, v_productId, v_qty;
            IF done THEN
                LEAVE read_loop;
            END IF;

            -- For each saleLine, find X available cards and link them
            -- We use a subquery to get the IDs first to ensure we hit the LIMIT
            UPDATE card 
            SET saleLineId = v_saleLineId, 
                card_isused = 1, 
                update_time = NOW()
            WHERE productId = v_productId 
              AND card_isused = 0 
              AND isActive = 1
            ORDER BY id ASC
            LIMIT v_qty;

        END LOOP;

        CLOSE cur;
    END //

    DELIMITER ;
-- execute procedure
  CALL LinkOrphanSales();

-- check exact profit specific date

  SELECT 
    SUM(sl.price * sl.quantity) AS total_revenue,
    (SELECT SUM(cost) FROM card WHERE saleLineId IN (SELECT id FROM saleLine WHERE DATE(createdAt) = '2026-03-17')) AS total_cost,
    (SUM(sl.price * sl.quantity) - (SELECT SUM(cost) FROM card WHERE saleLineId IN (SELECT id FROM saleLine WHERE DATE(createdAt) = '2026-03-17'))) AS total_profit
FROM saleLine sl
WHERE DATE(sl.createdAt) = '2026-03-17' AND sl.isActive = 1;