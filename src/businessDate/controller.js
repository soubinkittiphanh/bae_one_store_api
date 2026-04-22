const { businessDate, transactionEntry, sequelize } = require('../models');
const { Op } = require('sequelize');

module.exports = {
    async getBusinessDate(req, res) {
        try {
            let current = await businessDate.findOne({ order: [['id', 'DESC']] });

            if (!current) {
                // Option B: Initialize from last transaction
                const lastTxn = await transactionEntry.findOne({
                    order: [['createdAt', 'DESC']],
                    attributes: ['createdAt']
                });

                let startDate;
                if (lastTxn) {
                    startDate = new Date(lastTxn.createdAt).toISOString().split('T')[0];
                } else {
                    startDate = new Date().toISOString().split('T')[0];
                }

                current = await businessDate.create({
                    currentDate: startDate,
                    status: 'OPEN'
                });
            }

            return res.status(200).json({ success: true, data: current });
        } catch (error) {
            console.error("Get Business Date Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    },

    async advanceBusinessDate(req, res) {
        const t = await sequelize.transaction();
        try {
            const current = await businessDate.findOne({ 
                order: [['id', 'DESC']],
                transaction: t 
            });

            if (!current) {
                throw new Error("No active business date found to advance.");
            }

            const nextDate = new Date(current.currentDate);
            nextDate.setDate(nextDate.getDate() + 1);
            const nextDateStr = nextDate.toISOString().split('T')[0];

            const newDate = await businessDate.create({
                currentDate: nextDateStr,
                lastWorkingDate: current.currentDate,
                status: 'OPEN'
            }, { transaction: t });

            await t.commit();
            return res.status(200).json({ success: true, data: newDate });
        } catch (error) {
            await t.rollback();
            console.error("Advance Business Date Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    },

    async syncHistoricalData(req, res) {
        try {
            const [results, metadata] = await sequelize.query(
                "UPDATE transactionEntry SET businessDate = DATE(createdAt) WHERE businessDate IS NULL"
            );
            return res.status(200).json({ success: true, message: "History synced successfully", metadata });
        } catch (error) {
            console.error("Sync Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    },

    // Internal helper for initialization
    async internalInitialize() {
        try {
            const count = await businessDate.count();
            if (count === 0) {
                const lastTxn = await transactionEntry.findOne({
                    order: [['createdAt', 'DESC']],
                    attributes: ['createdAt']
                });

                let startDate;
                if (lastTxn) {
                    startDate = new Date(lastTxn.createdAt).toISOString().split('T')[0];
                } else {
                    startDate = new Date().toISOString().split('T')[0];
                }

                await businessDate.create({
                    currentDate: startDate,
                    status: 'OPEN'
                });
                console.log(`Business Date initialized to ${startDate}`);
            }
        } catch (error) {
            console.error("Internal Initialization Error:", error);
        }
    }
};
