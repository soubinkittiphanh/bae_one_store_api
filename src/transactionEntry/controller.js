const { bankAccount, transactionEntry, sequelize } = require("../models");
const { v4: uuidv4 } = require('uuid');

module.exports = {
    async processSettlement(req, res) {
        const t = await sequelize.transaction();
        try {
            const { studentAccountId, shopAccountId, amount, saleHeaderId } = req.body;
            const refId = uuidv4(); // Unique ID for this specific transaction pair

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
                saleHeaderId: saleHeaderId
            }, { transaction: t });

            // 3. LEG 2: CREDIT the Shop
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: shopAccountId,
                debit: 0,
                credit: amount,
                transactionType: 'PURCHASE',
                description: `Sale to Student ID: ${studentAccountId}`,
                saleHeaderId: saleHeaderId
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
                userId: userId
            }, { transaction: t });

            // 2. LEG 2: CREDIT the Student Wallet
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: studentAccountId,
                debit: 0,
                credit: amount,
                transactionType: 'TOPUP',
                description: description || 'Top-up Wallet at Counter',
                userId: userId
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
                userId: userId
            }, { transaction: t });

            // 2. LEG 2: CREDIT Cash Account (Drawer gives money)
            await transactionEntry.create({
                referenceId: refId,
                bankAccountId: cashAccountId,
                debit: 0,
                credit: amount,
                transactionType: 'REFUND',
                description: `Cash withdrawn by student (ID: ${studentAccountId})`,
                userId: userId
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
    }
};