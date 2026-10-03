const { bankAccount, transactionEntry, accountDailyBalance, businessDate, sequelize } = require("../models");
const { v4: uuidv4 } = require('uuid');

// We dynamically map IN/OUT based strictly on the backend increment/decrement behaviors
// instead of standard accounting classifications, to guarantee precision with the ledger.
function getLedgerEffect(type, debit, credit) {
    let amountIn = 0;
    let amountOut = 0;
    if (type === 'TOPUP') {
        // Topup always increments balances (Cash receives money, Wallet receives money)
        amountIn = debit > 0 ? debit : credit;
    } else if (type === 'REFUND' || type === 'WITHDRAW') { // Withdrawal logic
        // Withdrawal always decrements balances (Cash gives money, Wallet gives money)
        amountOut = debit > 0 ? debit : credit;
    } else if (type === 'PURCHASE') {
        // Student debited (Out), Shop credited (In)
        if (debit > 0) amountOut = debit;
        if (credit > 0) amountIn = credit;
    } else if (type === 'TRANSFER' || type === 'SWEEP') {
        if (debit > 0) amountIn = debit;
        if (credit > 0) amountOut = credit;
    } else {
        // Fallback
        amountIn = credit;
        amountOut = debit;
    }
    return { amountIn, amountOut };
}

module.exports = {
    async processSettlement(req, res) {
        const t = await sequelize.transaction();
        try {
            const { studentAccountId, shopAccountId, amount, saleHeaderId, externalRefno } = req.body;
            const refId = uuidv4();
            const currentBD = await businessDate.findOne({ order: [['id', 'DESC']], transaction: t });
            const bDate = currentBD ? currentBD.currentDate : new Date().toISOString().split('T')[0];

            // 1. Check Student Balance
            const studentWallet = await bankAccount.findByPk(studentAccountId, { transaction: t });
            if (studentWallet.balance < amount) {
                return res.status(400).json({ message: "Insufficient Funds" });
            }

            // 2. LEG 1: DEBIT the Student
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: studentAccountId,
                debit: amount,
                credit: 0,
                transactionType: 'PURCHASE',
                description: `Purchase at Mini-mart`,
                saleHeaderId: saleHeaderId,
                externalRefno: externalRefno,
                businessDate: bDate
            }, { transaction: t });

            // 3. LEG 2: CREDIT the Shop
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: shopAccountId,
                debit: 0,
                credit: amount,
                transactionType: 'PURCHASE',
                description: `Sale to Student ID: ${studentAccountId}`,
                saleHeaderId: saleHeaderId,
                externalRefno: externalRefno,
                businessDate: bDate
            }, { transaction: t });

            // 4. Update Balances in the Account Table
            await studentWallet.decrement('balance', { by: amount, transaction: t });
            await bankAccount.increment('balance', { by: amount, where: { id: shopAccountId }, transaction: t });

            await t.commit();
            return res.status(200).json({ message: "Settlement Successful", referenceId: refId });

        } catch (error) {
            await t.rollback();
            return res.status(500).json({ error: error.message });
        }
    },

    async processTopup(req, res) {
        const t = await sequelize.transaction();
        try {
            const { studentAccountId, cashAccountId, amount, description, userId } = req.body;
            const refId = uuidv4();
            const currentBD = await businessDate.findOne({ order: [['id', 'DESC']], transaction: t });
            const bDate = currentBD ? currentBD.currentDate : new Date().toISOString().split('T')[0];

            if (!cashAccountId) {
                return res.status(400).json({ message: "Missing cash account ID" });
            }

            // 1. LEG 1: DEBIT Cash Account (Drawer receives money)
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: cashAccountId,
                debit: amount,
                credit: 0,
                transactionType: 'TOPUP',
                description: `Cash received for student top-up (ID: ${studentAccountId})`,
                userId: userId,
                businessDate: bDate
            }, { transaction: t });

            // 2. LEG 2: CREDIT the Student Wallet
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: studentAccountId,
                debit: 0,
                credit: amount,
                transactionType: 'TOPUP',
                description: description || 'Top-up Wallet at Counter',
                userId: userId,
                businessDate: bDate
            }, { transaction: t });

            // 3. Update Balance
            await bankAccount.increment('balance', { by: amount, where: { id: studentAccountId }, transaction: t });
            await bankAccount.increment('balance', { by: amount, where: { id: cashAccountId }, transaction: t });

            await t.commit();
            return res.status(200).json({ message: "Top-up Successful", referenceId: refId });
        } catch (error) {
            await t.rollback();
            return res.status(500).json({ error: error.message });
        }
    },

    async processWithdrawal(req, res) {
        const t = await sequelize.transaction();
        try {
            const { studentAccountId, cashAccountId, amount, description, userId } = req.body;
            const refId = uuidv4();
            const currentBD = await businessDate.findOne({ order: [['id', 'DESC']], transaction: t });
            const bDate = currentBD ? currentBD.currentDate : new Date().toISOString().split('T')[0];

            if (!cashAccountId) {
                return res.status(400).json({ message: "Missing cash account ID" });
            }

            const studentWallet = await bankAccount.findByPk(studentAccountId, { transaction: t });
            if (studentWallet.balance < amount) {
                return res.status(400).json({ message: "Insufficient Funds" });
            }

            // 1. LEG 1: DEBIT the Student Wallet
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: studentAccountId,
                debit: amount,
                credit: 0,
                transactionType: 'REFUND', // Using refund type or adjustment
                description: description || 'Withdrawal at Counter',
                userId: userId,
                businessDate: bDate
            }, { transaction: t });

            // 2. LEG 2: CREDIT Cash Account (Drawer gives money)
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: cashAccountId,
                debit: 0,
                credit: amount,
                transactionType: 'REFUND',
                description: `Cash withdrawn by student (ID: ${studentAccountId})`,
                userId: userId,
                businessDate: bDate
            }, { transaction: t });

            // 3. Update Balance
            await studentWallet.decrement('balance', { by: amount, transaction: t });
            await bankAccount.decrement('balance', { by: amount, where: { id: cashAccountId }, transaction: t });

            await t.commit();
            return res.status(200).json({ message: "Withdrawal Successful", referenceId: refId });
        } catch (error) {
            await t.rollback();
            return res.status(500).json({ error: error.message });
        }
    },

    async getAccountStatement(req, res) {
        try {
            const { accountId } = req.params;
            const { startDate, endDate } = req.query;

            if (!accountId) {
                return res.status(400).json({ message: "Account ID is required" });
            }

            const { Op } = require('sequelize');

            // 1. Get Account Info to know its type
            const account = await bankAccount.findByPk(accountId);
            if (!account) {
                return res.status(404).json({ message: "Account not found" });
            }

            // We dynamically map IN/OUT based strictly on the backend increment/decrement behaviors
            // instead of standard accounting classifications, to guarantee precision with the ledger.

            let dateFilter = {};
            let previousDateFilter = {};
            
            if (startDate) {
                dateFilter[Op.gte] = startDate;
                previousDateFilter[Op.lt] = startDate;
            }
            if (endDate) {
                if (dateFilter[Op.gte]) {
                   dateFilter = { [Op.between]: [startDate, endDate] };
                } else {
                   dateFilter[Op.lte] = endDate;
                }
            }

            // 2. Calculate Opening Balance
            let openingBalance = 0;
            if (startDate) {
                const sDate = new Date(startDate);
                const isoDate = sDate.toISOString().split('T')[0];

                // Check for latest snapshot before the start date
                const latestSnapshot = await accountDailyBalance.findOne({
                    where: {
                        bankAccountId: accountId,
                        date: { [Op.lt]: isoDate }
                    },
                    order: [['date', 'DESC']],
                    raw: true
                });

                let lastSnapshotDate = null;

                if (latestSnapshot) {
                    openingBalance = latestSnapshot.closingBalance;
                    lastSnapshotDate = latestSnapshot.date;
                }

                // Calculate any transactions between the last snapshot and the start date
                let gapFilter = { bankAccountId: accountId };
                if (lastSnapshotDate) {
                    const dayAfterSnapshot = new Date(lastSnapshotDate);
                    dayAfterSnapshot.setDate(dayAfterSnapshot.getDate() + 1);
                    dayAfterSnapshot.setHours(0, 0, 0, 0);
                    gapFilter.createdAt = { [Op.between]: [dayAfterSnapshot, new Date(sDate.setHours(0, 0, 0, 0))] };
                } else {
                    gapFilter.createdAt = previousDateFilter;
                }

                const gapEntries = await transactionEntry.findAll({
                    where: gapFilter,
                    raw: true
                });

                for (const t of gapEntries) {
                    const effect = getLedgerEffect(t.transactionType, t.debit, t.credit);
                    openingBalance += (effect.amountIn - effect.amountOut);
                }
            }

            // 3. Get Transactions for the period
            let whereClause = { bankAccountId: accountId };
            if (startDate || endDate) {
                whereClause.businessDate = dateFilter;
            }

            const transactions = await transactionEntry.findAll({
                where: whereClause,
                order: [['createdAt', 'ASC']],
                include: [
                    { 
                        model: sequelize.models.user, 
                        as: 'creator', 
                        attributes: ['id', 'cus_name'],
                        required: false 
                    }
                ]
            });

            // 4. Map them to Amount In / Amount Out and Running Balance
            let runningBalance = openingBalance;
            let totalIn = 0;
            let totalOut = 0;

            const mappedTransactions = transactions.map(t => {
                const effect = getLedgerEffect(t.transactionType, t.debit, t.credit);
                const amountIn = effect.amountIn;
                const amountOut = effect.amountOut;

                totalIn += amountIn;
                totalOut += amountOut;
                runningBalance += (amountIn - amountOut);

                return {
                    id: t.id,
                    referenceId: t.referenceId,
                    transactionType: t.transactionType,
                    description: t.description,
                    createdAt: t.createdAt,
                    businessDate: t.businessDate,
                    debit: t.debit,
                    credit: t.credit,
                    amountIn,
                    amountOut,
                    runningBalance,
                    externalRefno: t.externalRefno,
                    saleHeaderId: t.saleHeaderId,
                    creator: t.creator ? t.creator.cus_name : null
                };
            });

            return res.status(200).json({
                success: true,
                account: {
                    id: account.id,
                    accountName: account.accountName,
                    accountNumber: account.accountNumber,
                    accountType: account.accountType,
                    currentBalance: account.balance // Current live balance in DB
                },
                statement: {
                    openingBalance,
                    totalIn,
                    totalOut,
                    closingBalance: runningBalance,
                    transactions: mappedTransactions
                }
            });

        } catch (error) {
            console.error("Statement Error:", error);
            return res.status(500).json({ error: error.message });
        }
    },
    
    async getUserActivity(req, res) {
        try {
            const { userId } = req.params;
            const { startDate, endDate } = req.query;

            if (!userId) {
                return res.status(400).json({ message: "User ID is required" });
            }

            const { Op } = require('sequelize');

            let dateFilter = {};
            if (startDate) {
                dateFilter[Op.gte] = startDate;
            }
            if (endDate) {
                if (dateFilter[Op.gte]) {
                   dateFilter = { [Op.between]: [startDate, endDate] };
                } else {
                   dateFilter[Op.lte] = endDate;
                }
            }

            let whereClause = { userId: userId };
            if (startDate || endDate) {
                whereClause.businessDate = dateFilter;
            }

            const transactions = await transactionEntry.findAll({
                where: whereClause,
                order: [['createdAt', 'DESC']],
                include: [
                    {
                        model: bankAccount,
                        as: 'account',
                        attributes: ['id', 'accountName', 'accountNumber'],
                        required: false
                    },
                    { 
                        model: sequelize.models.user, 
                        as: 'creator', 
                        attributes: ['id', 'cus_name'],
                        required: false 
                    }
                ]
            });

            let totalIn = 0;
            let totalOut = 0;

            const mappedTransactions = transactions.map(t => {
                const effect = getLedgerEffect(t.transactionType, t.debit, t.credit);
                const amountIn = effect.amountIn;
                const amountOut = effect.amountOut;

                totalIn += amountIn;
                totalOut += amountOut;

                return {
                    id: t.id,
                    referenceId: t.referenceId,
                    transactionType: t.transactionType,
                    description: t.description,
                    createdAt: t.createdAt,
                    businessDate: t.businessDate,
                    debit: t.debit,
                    credit: t.credit,
                    amountIn,
                    amountOut,
                    account: t.account,
                    externalRefno: t.externalRefno,
                    saleHeaderId: t.saleHeaderId,
                    creator: t.creator ? t.creator.cus_name : null
                };
            });

            return res.status(200).json({
                success: true,
                summary: {
                    totalIn,
                    totalOut,
                    count: mappedTransactions.length
                },
                transactions: mappedTransactions
            });

        } catch (error) {
            console.error("User Activity Error:", error);
            return res.status(500).json({ error: error.message });
        }
    },

    async processTransfer(req, res) {
        const t = await sequelize.transaction();
        try {
            const { fromAccountId, toAccountId, amount, description, userId, receiverName } = req.body;
            const refId = uuidv4();
            const currentBD = await businessDate.findOne({ order: [['id', 'DESC']], transaction: t });
            const bDate = currentBD ? currentBD.currentDate : new Date().toISOString().split('T')[0];

            if (!fromAccountId || !toAccountId) {
                return res.status(400).json({ message: "Both source (From) and destination (To) account IDs are required" });
            }
            if (fromAccountId == toAccountId) {
                return res.status(400).json({ message: "Source and destination accounts must be different" });
            }
            if (!amount || amount <= 0) {
                return res.status(400).json({ message: "Amount must be greater than 0" });
            }

            const sourceAccount = await bankAccount.findByPk(fromAccountId, { transaction: t });
            const destAccount = await bankAccount.findByPk(toAccountId, { transaction: t });

            if (!sourceAccount) {
                return res.status(404).json({ message: "Source account not found" });
            }
            if (!destAccount) {
                return res.status(404).json({ message: "Destination account not found" });
            }
            if (sourceAccount.balance < amount) {
                return res.status(400).json({ 
                    message: `Insufficient balance in source account (${sourceAccount.accountName}). Available: ${sourceAccount.balance} LAK, Requested: ${amount} LAK` 
                });
            }

            const senderDesc = description || `End-of-day Cash Drop to ${destAccount.accountName}` + (receiverName ? ` (Received by: ${receiverName})` : '');
            const receiverDesc = `Cash received from ${sourceAccount.accountName}` + (receiverName ? ` (Handed to: ${receiverName})` : '');

            // 1. LEG 1: CREDIT the Sending Account (Cashier Drawer / Cash Till decreases)
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: fromAccountId,
                debit: 0,
                credit: amount,
                transactionType: 'TRANSFER',
                description: senderDesc,
                userId: userId || null,
                businessDate: bDate
            }, { transaction: t });

            // 2. LEG 2: DEBIT the Receiving Account (Central Cash / Vault / Bank increases)
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: toAccountId,
                debit: amount,
                credit: 0,
                transactionType: 'TRANSFER',
                description: receiverDesc,
                userId: userId || null,
                businessDate: bDate
            }, { transaction: t });

            // 3. Update account balances
            await sourceAccount.decrement('balance', { by: amount, transaction: t });
            await destAccount.increment('balance', { by: amount, transaction: t });

            await t.commit();

            return res.status(200).json({
                success: true,
                message: "Cash Transfer Successful",
                referenceId: refId,
                transfer: {
                    referenceId: refId,
                    amount,
                    fromAccount: {
                        id: sourceAccount.id,
                        name: sourceAccount.accountName,
                        number: sourceAccount.accountNumber,
                        newBalance: sourceAccount.balance - amount
                    },
                    toAccount: {
                        id: destAccount.id,
                        name: destAccount.accountName,
                        number: destAccount.accountNumber,
                        newBalance: destAccount.balance + amount
                    },
                    receiverName,
                    createdAt: new Date().toISOString()
                }
            });

        } catch (error) {
            await t.rollback();
            return res.status(500).json({ message: "Transfer failed", error: error.message });
        }
    },
};
