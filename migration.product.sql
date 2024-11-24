
INSERT into company select * from dcommerce_pro_peeair4_2024.company;

INSERT INTO product (id, pro_id, pro_name, pro_price, pro_desc, pro_status, pro_image_path, retail_cost_percent, cost_price, stock_count, locking_session_id, isActive, createdAt, updateTimestamp, categoryCategId, pro_category, companyId)
SELECT
  source.id,
  source.pro_id,
  source.pro_name,
  source.pro_price,
  source.pro_desc,
  source.pro_status,
  source.pro_image_path,
  source.retail_cost_percent,
  source.cost_price,
  source.stock_count,
  source.locking_session_id,
  source.isActive,
  source.createdAt,
  source.updateTimestamp,
  source.categoryCategId,
  source.pro_category,
  source.outlet
FROM dcommerce_pro_sikhai01.product AS source;
insert into currency select * from dcommerce_pro_peeair4_2024.currency;  
update product set costCurrencyId=1, saleCurrencyId=1;
truncate image_path;
insert into image_path select * from dcommerce_pro_sikhai01.image_path;