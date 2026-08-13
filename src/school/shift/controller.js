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
    },

    async getShiftReport(req, res) {
        try {
            const shiftId = req.params.id;
            const models = require("../../models");

            const shift = await cashierShift.findByPk(shiftId, {
                include: [{ model: models.user, as: 'user', attributes: ['id', 'cus_name', 'username'] }]
            });

            if (!shift) {
                return res.status(404).json({ message: "Shift record not found" });
            }

            // Find all payments collected during this shift
            const payments = await models.schoolPayment.findAll({
                where: { cashierShiftId: shiftId, isActive: true },
                include: [{ model: models.payment, as: 'paymentMethod', attributes: ['id', 'payment_code', 'payment_name'] }]
            });

            // Group payments by payment method
            const paymentSummaryMap = {};
            let totalCollected = 0;
            let cashCollected = 0;

            payments.forEach(p => {
                const methodCode = p.paymentMethod ? p.paymentMethod.payment_code : 'UNKNOWN';
                const methodName = p.paymentMethod ? p.paymentMethod.payment_name : 'Unknown';

                if (!paymentSummaryMap[methodCode]) {
                    paymentSummaryMap[methodCode] = {
                        methodCode,
                        methodName,
                        totalAmount: 0,
                        transactionCount: 0
                    };
                }

                paymentSummaryMap[methodCode].totalAmount += p.amount;
                paymentSummaryMap[methodCode].transactionCount += 1;
                totalCollected += p.amount;

                // Cash payments affect expected closing cash in the drawer
                if (methodCode.toUpperCase() === 'CASH') {
                    cashCollected += p.amount;
                }
            });

            const expectedClosingCash = shift.openingCash + cashCollected;

            return res.status(200).json({
                shift: {
                    id: shift.id,
                    status: shift.status,
                    openTime: shift.openTime,
                    closeTime: shift.closeTime,
                    openingCash: shift.openingCash,
                    closingCash: shift.closingCash,
                    expectedClosingCash
                },
                cashier: shift.user ? {
                    id: shift.user.id,
                    name: shift.user.cus_name || shift.user.username,
                    username: shift.user.username
                } : null,
                payments: Object.values(paymentSummaryMap),
                totalCollected,
                expectedClosingCash
            });
        } catch (error) {
            logger.error("Error generating shift summary report:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
