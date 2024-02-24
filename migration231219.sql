delete from dynamic_customer;
SHOW CREATE TABLE dynamic_customer;
alter table dynamic_customer drop foreign key dynamic_customer_ibfk_377;
alter table dynamic_customer drop foreign key dynamic_customer_ibfk_378;
alter table dynamic_customer drop foreign key dynamic_customer_saleHeaderId_foreign_idx;
alter table dynamic_customer drop foreign key dynamic_customer_shippingId_foreign_idx;
alter table saleHeader drop foreign key saleHeader_ibfk_1121;
drop table dynamic_customer;
-- CREATE USER GROUP: 
insert into dcommerce_pro_little_boutique.userGroup SELECT * FROM dcommerce_uat_1.userGroup;
-- ASSIGN USER TO GROUP JUST CREATED: 
update user set groupId = 1;
-- GENERATE AUTHORITY
insert into dcommerce_pro_little_boutique.authority SELECT * FROM dcommerce_uat_1.authority;
-- ASSIGN AUTHORITY JUST CREATED TO GROUP JUST CREATE
-- insert into dcommerce_pro_chithanh.GroupAuthorities SELECT * FROM dcommerce_uat_1.GroupAuthorities;
insert into dcommerce_pro_little_boutique.GroupAuthorities SELECT * FROM dcommerce_uat_1.GroupAuthorities;
insert into dcommerce_pro_little_boutique.GroupMenuHeader SELECT * FROM dcommerce_pro_beverhome.GroupMenuHeader;
insert into dcommerce_pro_little_boutique.MenuHeaderLines SELECT * FROM dcommerce_uat_1.MenuHeaderLines;
insert into dcommerce_pro_little_boutique.menuHeader SELECT * FROM dcommerce_pro_beverhome.menuHeader;
insert into dcommerce_pro_little_boutique.menuLine SELECT * FROM dcommerce_uat_1.menuLine;
insert into dcommerce_pro_little_boutique.category select * from dcommerce_pro_sikhai01.category;     

delete from shipping;
delete from payment; 
delete from geography;
insert into dcommerce_pro_little_boutique.shipping select * from dcommerce_uat_1.shipping;
insert into dcommerce_pro_little_boutique.payment select * from dcommerce_uat_1.payment;
insert into dcommerce_pro_little_boutique.geography select * from dcommerce_uat_1.geography;

update outlet set name='', tel='';
-- CREATE BRANCH
-- ASSIGN SINGLE LOCATION TO BRANCH
alter table dynamic_customer drop column riderId;
alter table dynamic_customer drop column geoId;
alter table dynamic_customer drop column saleHeaderId;
alter table dynamic_customer drop column shippingId;

SHOW CREATE TABLE rider; 
SHOW CREATE TABLE shipping; 
SHOW CREATE TABLE saleHeader; 
SHOW CREATE TABLE geography; 
delete from user_order; 







-- CREATE USER GROUP: 
insert into dcommerce_pro_jnong.userGroup SELECT * FROM dcommerce_uat_1.userGroup;
-- ASSIGN USER TO GROUP JUST CREATED: 
update user set groupId = 1;
-- GENERATE AUTHORITY
insert into dcommerce_pro_jnong.authority SELECT * FROM dcommerce_uat_1.authority;
-- ASSIGN AUTHORITY JUST CREATED TO GROUP JUST CREATE
-- insert into dcommerce_pro_chithanh.GroupAuthorities SELECT * FROM dcommerce_uat_1.GroupAuthorities;
insert into dcommerce_pro_jnong.GroupAuthorities SELECT * FROM dcommerce_uat_1.GroupAuthorities;
-- CREATE BRANCH

alter table product drop column outlet;