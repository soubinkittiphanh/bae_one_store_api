
//***********UNSTRUCTURE TABLE product**********//
ALTER TABLE product MODIFY COLUMN createdAt datetime null;     
ALTER TABLE product MODIFY COLUMN updateTimestamp datetime null;        
ALTER TABLE product MODIFY COLUMN isActive tinyint(1) null;
//***********SET VALUE DEFAULT**********//
update product set isActive=true;
UPDATE product SET createdAt = NOW();
UPDATE product SET updateTimestamp = NOW();
