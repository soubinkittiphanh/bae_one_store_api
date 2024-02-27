SHOW CREATE TABLE product; -- check relation key in the table;
ALTER TABLE product DROP FOREIGN KEY product_ibfk_3171; -- drop outletId key
ALTER TABLE product DROP FOREIGN KEY product_ibfk_1955; -- drop outlet key
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