
-- Up Migration
CREATE TABLE IF NOT EXISTS `CleaningEvent` (
    `id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `locationName` VARCHAR(255) NOT NULL,
    `coordinates` POINT,
    `startTime` DATETIME NOT NULL,
    `endTime` DATETIME NOT NULL,
    `status` ENUM('upcoming', 'ongoing', 'completed') NOT NULL DEFAULT 'upcoming',
    `createdAt` DATETIME NOT NULL,
    `updateTimestamp` DATETIME NOT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `Attendance` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `checkInTime` DATETIME,
    `isVerified` TINYINT(1) NOT NULL DEFAULT 0,
    `notes` VARCHAR(255),
    `userId` INT NOT NULL,
    `CleaningEventId` CHAR(36) NOT NULL,
    `createdAt` DATETIME NOT NULL,
    `updateTimestamp` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_attendance_user` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_attendance_event` FOREIGN KEY (`CleaningEventId`) REFERENCES `CleaningEvent` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Down Migration
-- DROP TABLE IF EXISTS `Attendance`;
-- DROP TABLE IF EXISTS `CleaningEvent`;
