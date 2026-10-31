-- ==============================================================================
-- DCommerce Loan Module - Phase 5 Part B0 (DOWN): per-currency limits and fixed amounts are removed;
-- the product-level minAmount/maxAmount and component values were never changed by the UP.
-- ==============================================================================
ALTER TABLE `ln_approval_matrix` DROP COLUMN IF EXISTS `currencyId`;
ALTER TABLE `ln_fee_master` DROP COLUMN IF EXISTS `currencyId`;
ALTER TABLE `ln_rate_tier` DROP COLUMN IF EXISTS `currencyId`;
DROP TABLE IF EXISTS `ln_product_amount`;
ALTER TABLE `ln_product_currency` DROP COLUMN IF EXISTS `maxAmount`, DROP COLUMN IF EXISTS `minAmount`;
