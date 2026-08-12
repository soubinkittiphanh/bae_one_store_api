const { cashierShift } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    async open(req, res) {
        try {
            const userId = req.user ? req.user.id : 1;
            const { openingCash } = req.body;

            // Check if there is already an open shift
            const activeShift = await cashierShift.findOne({
                where: { userId, status: 'OPEN' }
            });

            if (activeShift) {
                return res.status(200).json({
                    message: "You already have an open shift",
                    shift: activeShift
                });
            }

            const shift = await cashierShift.create({
                userId,
                openingCash: openingCash || 0.00,
                status: 'OPEN',
                openTime: new Date()
            });

            logger.info(`Opened cashier shift ${shift.id} for user ${userId}`);
            return res.status(201).json(shift);
        } catch (error) {
            logger.error("Error opening cashier shift:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async close(req, res) {
        try {
            const userId = req.user ? req.user.id : 1;
            const { closingCash } = req.body;
            const shiftId = req.params.id;

            const shift = await cashierShift.findOne({
                where: { id: shiftId, userId, status: 'OPEN' }
            });

            if (!shift) {
                return res.status(404).json({ message: "Active shift not found" });
            }

            await cashierShift.update({
                status: 'CLOSED',
                closeTime: new Date(),
                closingCash: closingCash || 0.00
            }, {
                where: { id: shiftId }
            });

            logger.info(`Closed cashier shift ${shiftId} for user ${userId}`);
            return res.status(200).json({ message: "Shift closed successfully" });
        } catch (error) {
            logger.error("Error closing cashier shift:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async getActive(req, res) {
        try {
            const userId = req.user ? req.user.id : 1;
            const activeShift = await cashierShift.findOne({
                where: { userId, status: 'OPEN' }
            });

            if (!activeShift) {
                return res.status(404).json({ message: "No active shift found" });
            }

            return res.status(200).json(activeShift);
        } catch (error) {
            logger.error("Error fetching active shift:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
