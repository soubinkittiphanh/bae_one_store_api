insert into dcommerce_pro_sikhai01.shipping select * from shipping;
insert into dcommerce_pro_sikhai01.payment select * from payment;
insert into dcommerce_pro_sikhai01.geography select * from geography;

update outlet set name='', tel='';