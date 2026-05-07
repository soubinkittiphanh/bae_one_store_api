const service = require('./service');

const eventController = {
    async createEvent(req, res) {
        try {
            const event = await service.createEvent(req.body);
            return res.status(201).json(event);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    },

    async getImpactStats(req, res) {
        try {
            const stats = await service.getImpactStats();
            return res.status(200).json(stats);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    },

    async getUpcomingEvents(req, res) {
        console.log(`[DEBUG] Reached getUpcomingEvents controller`);
        try {
            const events = await service.getUpcomingEvents();
            return res.status(200).json(events);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    }
};

module.exports = eventController;
