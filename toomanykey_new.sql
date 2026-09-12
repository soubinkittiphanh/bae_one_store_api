-- Disable foreign key checks to prevent dependency lock errors
SET FOREIGN_KEY_CHECKS = 0;

-- 1. company table
ALTER TABLE `company` DROP COLUMN `customer_welcome_text`;

-- 2. student table
ALTER TABLE `student` DROP COLUMN `photoPath`;

-- 3. feeStructure table
ALTER TABLE `feeStructure` DROP COLUMN `isOptional`;

-- 4. schoolInvoice table
ALTER TABLE `schoolInvoice` DROP COLUMN `billingMonth`;

-- 5. card table
ALTER TABLE `card` DROP COLUMN `unitId`;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;