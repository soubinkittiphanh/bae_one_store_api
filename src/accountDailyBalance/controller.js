const { bankAccount, transactionEntry, accountDailyBalance, businessDate, sequelize } = require('../models');
const { Op } = require('sequelize');

module.exports = {
    async runCOBBatch(req, res) {
        let transaction;
        try {
            // 0. Get current Business Date
            let currentBD = await businessDate.findOne({ order: [['id', 'DESC']] });

            if (!currentBD) {
                // Auto-initialize if first time (Option B)
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

                currentBD = await businessDate.create({
                    currentDate: startDate,
                    status: 'OPEN'
                });
            }

            const displayDate = currentBD.currentDate;
            const batchDate = new Date(displayDate);
            batchDate.setHours(0, 0, 0, 0);

            // Start SQL transaction
            transaction = await sequelize.transaction();

            // 1. Get all active bank accounts
            const accounts = await bankAccount.findAll({
                where: { isActive: true },
                transaction
            });

            const results = [];

            for (const account of accounts) {
                // 2. Find Opening Balance (Last snapshot before this date)
                const lastSnapshot = await accountDailyBalance.findOne({
                    where: {
                        bankAccountId: account.id,
                        date: { [Op.lt]: displayDate }
                    },
                    order: [['date', 'DESC']],
                    transaction
                });

                const openingBalance = lastSnapshot ? lastSnapshot.closingBalance : 0;

                // 3. Find transactions for the business date
                const transactions = await transactionEntry.findAll({
                    where: {
                        bankAccountId: account.id,
                        businessDate: displayDate
                    },
                    transaction
                });

                // Helper to map IN/OUT (same logic as statement controller)
                function getLedgerEffect(type, debit, credit) {
                    let amountIn = 0;
                    let amountOut = 0;
                    if (type === 'TOPUP') {
                        amountIn = debit > 0 ? debit : credit;
                    } else if (type === 'REFUND' || type === 'WITHDRAW') {
                        amountOut = debit > 0 ? debit : credit;
                    } else if (type === 'PURCHASE') {
                        if (debit > 0) amountOut = debit;
                        if (credit > 0) amountIn = credit;
                    } else {
                        amountIn = credit;
                        amountOut = debit;
                    }
                    return { amountIn, amountOut };
                }

                let totalInForDay = 0;
                let totalOutForDay = 0;

                for (const t of transactions) {
                    const { amountIn, amountOut } = getLedgerEffect(t.transactionType, t.debit, t.credit);
                    totalInForDay += amountIn;
                    totalOutForDay += amountOut;
                }

                const closingBalance = openingBalance + (totalInForDay - totalOutForDay);

                // 4. Save/Update snapshot
                const [snapshot, created] = await accountDailyBalance.findOrCreate({
                    where: {
                        date: displayDate,
                        bankAccountId: account.id
                    },
                    defaults: {
                        openingBalance,
                        totalIn: totalInForDay,
                        totalOut: totalOutForDay,
                        closingBalance,
                        isClosed: true
                    },
                    transaction
                });

                if (!created) {
                    await snapshot.update({
                        openingBalance,
                        totalIn: totalInForDay,
                        totalOut: totalOutForDay,
                        closingBalance,
                        isClosed: true
                    }, { transaction });
                }

                results.push({
                    accountId: account.id,
                    accountName: account.accountName,
                    openingBalance,
                    totalIn: totalInForDay,
                    totalOut: totalOutForDay,
                    closingBalance
                });
            }

            // 5. Advance Business Date
            const nextDay = new Date(displayDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = nextDay.toISOString().split('T')[0];

            await businessDate.create({
                currentDate: nextDayStr,
                lastWorkingDate: displayDate,
                status: 'OPEN'
            }, { transaction });

            await transaction.commit();

            return res.status(200).json({
                success: true,
                message: `COB Batch completed for ${displayDate}`,
                date: displayDate,
                summary: results
            });

        } catch (error) {
            if (transaction) await transaction.rollback();
            console.error("COB Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    },

    async getHistory(req, res) {
        try {
            const { limit = 10, offset = 0 } = req.query;
            const history = await accountDailyBalance.findAll({
                include: [{ model: bankAccount, as: 'bankAccount', attributes: ['accountName', 'accountNumber'] }],
                order: [['date', 'DESC'], ['bankAccountId', 'ASC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            return res.status(200).json({ success: true, data: history });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }
};
