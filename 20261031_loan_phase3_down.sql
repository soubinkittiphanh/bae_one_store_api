-- ==============================================================================
-- DCommerce Loan Module - Phase 3 calculation engines (DOWN)
-- Reverses 20261031_loan_phase3.sql. loan_migrate.js refuses while applications or accounts exist.
-- ==============================================================================
ALTER TABLE `ln_holiday_calendar` DROP COLUMN IF EXISTS `weekendDays`;
ALTER TABLE `ln_account`
  DROP COLUMN IF EXISTS `gracePeriods`, DROP COLUMN IF EXISTS `graceType`,
  DROP COLUMN IF EXISTS `repaymentMethodCode`, DROP COLUMN IF EXISTS `accountStage`;
ALTER TABLE `ln_application`
  DROP COLUMN IF EXISTS `authorizedAt`, DROP COLUMN IF EXISTS `checkerId`, DROP COLUMN IF EXISTS `makerId`,
  DROP COLUMN IF EXISTS `remarks`, DROP COLUMN IF EXISTS `gracePeriods`, DROP COLUMN IF EXISTS `graceType`,
  DROP COLUMN IF EXISTS `firstDueDate`, DROP COLUMN IF EXISTS `valueDate`;
ALTER TABLE `ln_product`
  DROP COLUMN IF EXISTS `firstPeriodMaxDays`, DROP COLUMN IF EXISTS `firstPeriodMinDays`,
  DROP COLUMN IF EXISTS `maxGracePeriods`, DROP COLUMN IF EXISTS `repaymentMethodCode`;
DROP TABLE IF EXISTS `ln_lookup_repayment_method`;
DROP TABLE IF EXISTS `ln_currency_rule`;
