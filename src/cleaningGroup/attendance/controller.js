const service = require('./service');

const attendanceController = {
    async registerForEvent(req, res) {
        try {
            const { userId, eventId, notes } = req.body;
            const attendance = await service.registerForEvent(userId, eventId, notes);
            return res.status(201).json(attendance);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    },

    async verifyCheckIn(req, res) {
        try {
            const { userId, eventId } = req.body;
            const attendance = await service.verifyCheckIn(userId, eventId);
            return res.status(200).json(attendance);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    }
};

module.exports = attendanceController;
