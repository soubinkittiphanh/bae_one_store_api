-- =============================================================================
-- Rollback: parking vehicle types -> back to hard-coded ENUM.
-- WARNING: fails if any row uses a code outside the original 5 values.
-- Remap or delete those rows before running.
-- =============================================================================

ALTER TABLE `parking_vehicles`       MODIFY `vehicleType` ENUM('car','motorbike','vip','disabled','truck') NOT NULL DEFAULT 'car';
ALTER TABLE `parking_pricing_rules`  MODIFY `vehicleType` ENUM('car','motorbike','vip','disabled','truck') NOT NULL;
ALTER TABLE `parking_monthly_passes` MODIFY `vehicleType` ENUM('car','motorbike','vip','disabled','truck') NOT NULL DEFAULT 'car';
ALTER TABLE `parking_tickets`        MODIFY `vehicleType` ENUM('car','motorbike','vip','disabled','truck') NOT NULL DEFAULT 'car';
ALTER TABLE `parking_slots`          MODIFY `slotType`    ENUM('car','motorbike','vip','disabled','truck') NOT NULL DEFAULT 'car';

DROP TABLE IF EXISTS `parking_vehicle_types`;
