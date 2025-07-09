const logger = require('../api/logger');
const BankAccount = require('../models').bank_account;

module.exports = {
    async create(req, res) {
        try {
            const {
                accountNumber,
                accountName,
                bankName,
                bankBranch,
                accountType,
                currency,
                isActive
            } = req.body;

            const bankAccount = await BankAccount.create({
                accountNumber,
                accountName,
                bankName,
                bankBranch,
                accountType,
                currency,
                isActive
            });

            return res.status(201).json(bankAccount);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async upload(req, res) {
        try {
            const bankAccounts = await BankAccount.bulkCreate(req.body);
            res.status(200).json(bankAccounts);
        } catch (error) {
            logger.error(`Cannot upload bank accounts: ${error}`);
            res.status(500).json({ message: 'Server error' });
        }
    },

    async getAll(req, res) {
        try {
            const bankAccounts = await BankAccount.findAll();
            res.status(200).json(bankAccounts);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async getAllActive(req, res) {
        try {
            const bankAccounts = await BankAccount.findAll({ where: { isActive: true } });
            res.status(200).json(bankAccounts);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async getById(req, res) {
        try {
            const { id } = req.params;
            const bankAccount = await BankAccount.findByPk(id);
            if (!bankAccount) {
                return res.status(404).json({ message: 'Bank account not found' });
            }
            return res.status(200).json(bankAccount);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const {
                accountNumber,
                accountName,
                bankName,
                bankBranch,
                accountType,
                currency,
                isActive
            } = req.body;

            const bankAccount = await BankAccount.findByPk(id);
            if (!bankAccount) {
                return res.status(404).json({ message: 'Bank account not found' });
            }

            bankAccount.accountNumber = accountNumber;
            bankAccount.accountName = accountName;
            bankAccount.bankName = bankName;
            bankAccount.bankBranch = bankBranch;
            bankAccount.accountType = accountType;
            bankAccount.currency = currency;
            bankAccount.isActive = isActive;

            await bankAccount.save();
            return res.status(200).json(bankAccount);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const bankAccount = await BankAccount.findByPk(id);
            if (!bankAccount) {
                return res.status(404).json({ message: 'Bank account not found' });
            }
            await bankAccount.destroy();
            return res.status(200).json({ message: 'Bank account deleted' });
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
