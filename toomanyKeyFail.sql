ALTER TABLE `ARInvoiceHeader` DROP FOREIGN KEY `ARInvoiceHeader_ibfk_401`;
ALTER TABLE `ARInvoiceHeader` DROP INDEX `a_r_invoice_header_customer_id`;
ALTER TABLE `ARInvoiceHeader` DROP COLUMN `customerId`;