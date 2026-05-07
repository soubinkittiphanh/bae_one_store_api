const db = require('../../models/index.js');
const logger = require('../../api/logger');

const createEvent = async (eventData) => {
    try {
        const event = await db.CleaningEvent.create(eventData);
        logger.info(`Cleaning event created: ${event.id}`);
        return event;
    } catch (error) {
        logger.error(`Error creating cleaning event: ${error}`);
        throw error;
    }
};

const getImpactStats = async () => {
    try {
        const totalVolunteers = await db.Attendance.count({
            distinct: true,
            col: 'userId'
        });

        const totalCompletedEvents = await db.CleaningEvent.count({
            where: {
                status: 'completed'
            }
        });

        return {
            totalVolunteers,
            totalCompletedEvents
        };
    } catch (error) {
        logger.error(`Error fetching impact stats: ${error}`);
        throw error;
    }
};

const getUpcomingEvents = async () => {
    try {
        const events = await db.CleaningEvent.findAll({
            where: {
                status: {
                    [db.Sequelize.Op.in]: ['upcoming', 'ongoing']
                }
            },
            order: [['startTime', 'ASC']]
        });
        return events;
    } catch (error) {
        logger.error(`Error fetching upcoming events: ${error}`);
        throw error;
    }
};

module.exports = {
    createEvent,
    getImpactStats,
    getUpcomingEvents
};
