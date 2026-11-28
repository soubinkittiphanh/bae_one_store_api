-- Bill discount entered in the POS payment dialog. ticket.total is stored net of it.
-- Also added on start by ensureCriticalColumns (src/models/index.js); this file is for manual deploys.
ALTER TABLE `ticket`
  ADD COLUMN `discount` DECIMAL(10,2) NOT NULL DEFAULT 0
  COMMENT 'Bill discount given at payment; total is net of it';
