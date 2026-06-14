
-- Up Migration
ALTER TABLE `CleaningEvent` 
ADD COLUMN `beforePhotoUrl` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `afterPhotoUrl` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `estimatedTrashWeight` DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN `volunteerCount` INT DEFAULT 0,
ADD COLUMN `currentVolunteerCount` INT DEFAULT 0,
ADD COLUMN `category` VARCHAR(100) DEFAULT NULL;

ALTER TABLE `Attendance` 
ADD COLUMN `participationDuration` INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS `CleaningEventPhoto` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `CleaningEventId` CHAR(36) NOT NULL,
    `photoUrl` VARCHAR(255) NOT NULL,
    `caption` VARCHAR(255) DEFAULT NULL,
    `createdAt` DATETIME NOT NULL,
    `updateTimestamp` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_photo_event` FOREIGN KEY (`CleaningEventId`) REFERENCES `CleaningEvent` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Down Migration
-- ALTER TABLE `CleaningEvent` DROP COLUMN `beforePhotoUrl`, DROP COLUMN `afterPhotoUrl`, DROP COLUMN `estimatedTrashWeight`, DROP COLUMN `volunteerCount`, DROP COLUMN `currentVolunteerCount`, DROP COLUMN `category`;
-- ALTER TABLE `Attendance` DROP COLUMN `participationDuration`;
-- DROP TABLE IF EXISTS `CleaningEventPhoto`;
