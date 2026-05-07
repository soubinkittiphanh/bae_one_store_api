const db = require('../../models/index.js');
const logger = require('../../api/logger');

const registerForEvent = async (userId, eventId, notes = '') => {
    try {
        const attendance = await db.Attendance.create({
            userId,
            CleaningEventId: eventId,
            isVerified: false,
            notes
        });
        logger.info(`User ${userId} registered for event ${eventId}`);
        return attendance;
    } catch (error) {
        logger.error(`Error registering for event: ${error}`);
        throw error;
    }
};

const verifyCheckIn = async (userId, eventId) => {
    const transaction = await db.sequelize.transaction();
    try {
        // 1. Verify Event exists
        const event = await db.CleaningEvent.findByPk(eventId, { transaction });
        if (!event) {
            throw new Error('Cleaning Event not found');
        }

        // 2. Find and update attendance
        const attendance = await db.Attendance.findOne({
            where: {
                userId,
                CleaningEventId: eventId
            },
            transaction
        });

        if (!attendance) {
            throw new Error('Attendance record not found. User must register first.');
        }

        if (attendance.isVerified) {
            await transaction.rollback();
            return attendance; // Already verified
        }

        await attendance.update({
            isVerified: true,
            checkInTime: new Date()
        }, { transaction });

        // 3. Increment currentVolunteerCount in Event
        await event.increment('currentVolunteerCount', { by: 1, transaction });

        await transaction.commit();
        logger.info(`Check-in verified for user ${userId} at event ${eventId}. Total volunteers: ${event.currentVolunteerCount + 1}`);
        
        // Reload attendance to get updated fields if needed
        return attendance;
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error verifying check-in: ${error}`);
        throw error;
    }
};

module.exports = {
    registerForEvent,
    verifyCheckIn
};
