SHOW CREATE TABLE product; -- check relation key in the table;
ALTER TABLE product DROP FOREIGN KEY product_ibfk_31; -- drop outletId key
ALTER TABLE product DROP FOREIGN KEY product_ibfk_32; -- drop outlet key
ALTER TABLE product DROP KEY outletId;      -- drop key
ALTER TABLE product DROP KEY outlet;      -- drop key
ALTER TABLE product drop column outletId; -- drop this column to avoid error outletId key
ALTER TABLE product drop column outlet; -- drop this column to avoid error outletId key

insert into GroupMenuHeader select * from dcommerce_pro_chithanh_migration.GroupMenuHeader;
insert into MenuHeaderLines SELECT * FROM dcommerce_pro_chithanh_migration.MenuHeaderLines;
insert into menuHeader SELECT * FROM dcommerce_pro_chithanh_migration.menuHeader;
insert into menuLine SELECT * FROM dcommerce_pro_chithanh_migration.menuLine;


-- Migrate image_path table script (since before we join image with product by pro_code now we want to join with product.id for better performance) --

UPDATE image_path
INNER JOIN product ON image_path.pro_id = product.pro_id
SET image_path.productId = product.id;

-- Migrade accouting ap and ar
alter table payment_header drop column paymentMethod;
alter table payment_header drop column currency;
alter table receive_header drop column paymentMethod;
alter table receive_header drop column currency;

alter table payment_header drop column drAccount;
alter table payment_header drop column crAccount;
alter table receive_header drop column drAccount;
alter table receive_header drop column crAccount;

-- Migrate GL transaction table 
alter table general_ledger drop column currency;
ALTER TABLE general_ledger DROP FOREIGN KEY general_ledger_ibfk_1; 
ALTER TABLE general_ledger DROP FOREIGN KEY general_ledger_ibfk_2; 
ALTER TABLE general_ledger DROP KEY chartOfAccountId;    
alter table general_ledger drop column chartOfAccountId;

ALTER TABLE general_ledger DROP KEY account_id;    
alter table general_ledger drop column account_id;

alter table general_ledger drop column debit;
alter table general_ledger drop column credit;


UPDATE card
INNER JOIN product ON card.product_id = product.pro_id  -- This condition should be modified to match your specific case
SET card.productId = product.id;