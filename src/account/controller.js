const logger = require('../api/logger');

const ChartOfAccount = require('../models').chartAccount;

module.exports = {
    async create(req, res) {
        try {
            const { accountNumber, accountName, accountLLName, accountType, isActive } = req.body;
            const chartOfAccount = await ChartOfAccount.create({
                accountNumber,
                accountName,
                accountLLName,
                accountType,
                isActive
            });
            return res.status(201).json(chartOfAccount);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async getAll(req, res) {
        try {
            const chartOfAccounts = await ChartOfAccount.findAll();
            res.status(200).json(chartOfAccounts);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    async getAllActive(req, res) {
        try {
            const chartOfAccounts = await ChartOfAccount.findAll({ where: { isActive: true } });
            res.status(200).json(chartOfAccounts);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async getById(req, res) {
        try {
            const { id } = req.params;
            const chartOfAccount = await ChartOfAccount.findByPk(id);
            if (!chartOfAccount) {
                return res.status(404).json({ message: 'Chart of account not found' });
            }
            return res.status(200).json(chartOfAccount);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const { accountNumber, accountName, accountLLName, accountType, isActive } = req.body;
            const chartOfAccount = await ChartOfAccount.findByPk(id);
            if (!chartOfAccount) {
                return res.status(404).json({ message: 'Chart of account not found' });
            }
            chartOfAccount.accountNumber = accountNumber;
            chartOfAccount.accountName = accountName;
            chartOfAccount.accountLLName = accountLLName;
            chartOfAccount.accountType = accountType;
            chartOfAccount.isActive = isActive;
            await chartOfAccount.save();
            return res.status(200).json(chartOfAccount);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const chartOfAccount = await ChartOfAccount.findByPk(id);
            if (!chartOfAccount) {
                return res.status(404).json({ message: 'Chart of account not found' });
            }
            await chartOfAccount.destroy();
            return res.status(200).json({ message: 'Chart of account deleted' });
        } catch (error) {
            logger.error(error)
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
