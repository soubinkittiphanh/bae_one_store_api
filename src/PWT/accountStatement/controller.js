// controllers/accountStatementController.js
const logger = require("../../api/logger");
const { AccountStatement, bankAccount, user } = require("../../models");
const { Op } = require("sequelize");

// ===============================================================
// CREATE ACCOUNT STATEMENT
// ===============================================================
exports.createAccountStatement = async (req, res) => {
    try {
        const {
            bankAccountId,
            bookingDate,
            creditAmount,
            debitAmount,
            description,
            endingBalance,
            referenceNo,
            transactionType,
            status,
            exchangeRate
        } = req.body;

        // Validation
        if (!bankAccountId || !bookingDate) {
            return res.status(400).json({
                success: false,
                message: 'Bank Account ID and Booking Date are required'
            });
        }

        // Verify bank account exists
        const bankAcc = await bankAccount.findByPk(bankAccountId);
        if (!bankAcc) {
            return res.status(404).json({
                success: false,
                message: 'Bank account not found'
            });
        }

        // Create statement
        const statement = await AccountStatement.create({
            bankAccountId,
            bookingDate,
            creditAmount: creditAmount || 0.00,
            debitAmount: debitAmount || 0.00,
            description,
            endingBalance,
            referenceNo,
            transactionType,
            status: status || 'cleared',
            exchangeRate: exchangeRate || 1.00,
            makerId: req.user?.id // Assuming user is in request
        });

        logger.info(`Account statement created: ID ${statement.id}`);

        res.status(201).json({
            success: true,
            message: 'Account statement created successfully',
            data: statement
        });

    } catch (error) {
        logger.error('Error creating account statement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create account statement',
            error: error.message
        });
    }
};

// ===============================================================
// GET ALL ACCOUNT STATEMENTS (with filters)
// ===============================================================
exports.getAllAccountStatements = async (req, res) => {
    try {
        const {
            bankAccountId,
            startDate,
            endDate,
            status,
            transactionType,
            page = 1,
            limit = 50,
            sortBy = 'bookingDate',
            sortOrder = 'DESC'
        } = req.query;

        // Build where clause
        const whereClause = {};

        if (bankAccountId) {
            whereClause.bankAccountId = bankAccountId;
        }

        if (startDate && endDate) {
            whereClause.bookingDate = {
                [Op.between]: [startDate, endDate]
            };
        } else if (startDate) {
            whereClause.bookingDate = {
                [Op.gte]: startDate
            };
        } else if (endDate) {
            whereClause.bookingDate = {
                [Op.lte]: endDate
            };
        }

        if (status) {
            whereClause.status = status;
        }

        if (transactionType) {
            whereClause.transactionType = transactionType;
        }

        // Pagination
        const offset = (page - 1) * limit;

        // Fetch statements
        const { count, rows: statements } = await AccountStatement.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: bankAccount,
                    as: 'bankAccount',
                    attributes: ['id', 'accountName', 'accountNumber', 'bankName']
                },
                {
                    model: user,
                    as: 'maker',
                    // attributes: ['id', 'username', 'firstName', 'lastName']
                }
            ],
            order: [[sortBy, sortOrder]],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.status(200).json({
            success: true,
            data: statements,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / limit)
            }
        });

    } catch (error) {
        logger.error('Error fetching account statements:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account statements',
            error: error.message
        });
    }
};

// ===============================================================
// GET ACCOUNT STATEMENT BY ID
// ===============================================================
exports.getAccountStatementById = async (req, res) => {
    try {
        const { id } = req.params;

        const statement = await AccountStatement.findByPk(id, {
            include: [
                {
                    model: bankAccount,
                    as: 'bankAccount'
                },
                {
                    model: user,
                    as: 'maker',
                    // attributes: ['id', 'username', 'firstName', 'lastName']
                },
                {
                    model: user,
                    as: 'updateUser',
                    // attributes: ['id', 'username', 'firstName', 'lastName']
                },
                {
                    model: user,
                    as: 'reconciledBy',
                    // attributes: ['id', 'username', 'firstName', 'lastName']
                }
            ]
        });

        if (!statement) {
            return res.status(404).json({
                success: false,
                message: 'Account statement not found'
            });
        }

        res.status(200).json({
            success: true,
            data: statement
        });

    } catch (error) {
        logger.error('Error fetching account statement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account statement',
            error: error.message
        });
    }
};

// ===============================================================
// UPDATE ACCOUNT STATEMENT
// ===============================================================
exports.updateAccountStatement = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const statement = await AccountStatement.findByPk(id);

        if (!statement) {
            return res.status(404).json({
                success: false,
                message: 'Account statement not found'
            });
        }

        // Add update user info
        updateData.updateUserId = req.user?.id;

        // Ensure exchangeRate has a default value if not provided
        if (updateData.exchangeRate === undefined || updateData.exchangeRate === null) {
            updateData.exchangeRate = 1.00;
        }

        await statement.update(updateData);

        logger.info(`Account statement updated: ID ${id}`);

        res.status(200).json({
            success: true,
            message: 'Account statement updated successfully',
            data: statement
        });

    } catch (error) {
        logger.error('Error updating account statement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update account statement',
            error: error.message
        });
    }
};

// ===============================================================
// DELETE ACCOUNT STATEMENT
// ===============================================================
exports.deleteAccountStatement = async (req, res) => {
    try {
        const { id } = req.params;

        const statement = await AccountStatement.findByPk(id);

        if (!statement) {
            return res.status(404).json({
                success: false,
                message: 'Account statement not found'
            });
        }

        await statement.destroy();

        logger.info(`Account statement deleted: ID ${id}`);

        res.status(200).json({
            success: true,
            message: 'Account statement deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting account statement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete account statement',
            error: error.message
        });
    }
};

// ===============================================================
// RECONCILE ACCOUNT STATEMENT
// ===============================================================
exports.reconcileAccountStatement = async (req, res) => {
    try {
        const { id } = req.params;

        const statement = await AccountStatement.findByPk(id);

        if (!statement) {
            return res.status(404).json({
                success: false,
                message: 'Account statement not found'
            });
        }

        await statement.update({
            status: 'reconciled',
            reconciledAt: new Date(),
            reconciledById: req.user?.id
        });

        logger.info(`Account statement reconciled: ID ${id}`);

        res.status(200).json({
            success: true,
            message: 'Account statement reconciled successfully',
            data: statement
        });

    } catch (error) {
        logger.error('Error reconciling account statement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reconcile account statement',
            error: error.message
        });
    }
};

// ===============================================================
// GET ACCOUNT BALANCE SUMMARY
// ===============================================================
exports.getAccountBalanceSummary = async (req, res) => {
    try {
        const { bankAccountId, startDate, endDate } = req.query;

        if (!bankAccountId) {
            return res.status(400).json({
                success: false,
                message: 'Bank Account ID is required'
            });
        }

        const whereClause = { bankAccountId };

        if (startDate && endDate) {
            whereClause.bookingDate = {
                [Op.between]: [startDate, endDate]
            };
        }

        const statements = await AccountStatement.findAll({
            where: whereClause,
            order: [['bookingDate', 'ASC']],
            attributes: ['bookingDate', 'creditAmount', 'debitAmount', 'endingBalance', 'exchangeRate']
        });

        // Calculate summary
        const summary = {
            totalCredit: 0,
            totalDebit: 0,
            openingBalance: 0,
            closingBalance: 0,
            transactionCount: statements.length,
            averageExchangeRate: 0
        };

        let totalExchangeRate = 0;
        let exchangeRateCount = 0;

        statements.forEach((stmt, index) => {
            summary.totalCredit += parseFloat(stmt.creditAmount || 0);
            summary.totalDebit += parseFloat(stmt.debitAmount || 0);
            
            if (index === 0) {
                summary.openingBalance = parseFloat(stmt.endingBalance) - 
                    parseFloat(stmt.creditAmount || 0) + 
                    parseFloat(stmt.debitAmount || 0);
            }
            
            if (index === statements.length - 1) {
                summary.closingBalance = parseFloat(stmt.endingBalance);
            }

            // Calculate average exchange rate
            if (stmt.exchangeRate) {
                totalExchangeRate += parseFloat(stmt.exchangeRate);
                exchangeRateCount++;
            }
        });

        // Calculate average exchange rate
        if (exchangeRateCount > 0) {
            summary.averageExchangeRate = totalExchangeRate / exchangeRateCount;
        } else {
            summary.averageExchangeRate = 1.00;
        }

        res.status(200).json({
            success: true,
            data: {
                summary,
                statements
            }
        });

    } catch (error) {
        logger.error('Error fetching balance summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch balance summary',
            error: error.message
        });
    }
};

// ===============================================================
// BULK CREATE ACCOUNT STATEMENTS (for importing)
// ===============================================================
exports.bulkCreateAccountStatements = async (req, res) => {
    try {
        const { statements } = req.body;

        if (!Array.isArray(statements) || statements.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Statements array is required'
            });
        }

        // Add makerId and ensure exchangeRate defaults to all statements
        const statementsWithMaker = statements.map(stmt => ({
            ...stmt,
            makerId: req.user?.id,
            exchangeRate: stmt.exchangeRate || 1.00
        }));

        const createdStatements = await AccountStatement.bulkCreate(statementsWithMaker, {
            validate: true
        });

        logger.info(`Bulk created ${createdStatements.length} account statements`);

        res.status(201).json({
            success: true,
            message: `${createdStatements.length} account statements created successfully`,
            data: createdStatements
        });

    } catch (error) {
        logger.error('Error bulk creating account statements:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to bulk create account statements',
            error: error.message
        });
    }
};

// ===============================================================
// GET EXCHANGE RATE ANALYSIS (new endpoint for exchange rate insights)
// ===============================================================
exports.getExchangeRateAnalysis = async (req, res) => {
    try {
        const { bankAccountId, startDate, endDate } = req.query;

        if (!bankAccountId) {
            return res.status(400).json({
                success: false,
                message: 'Bank Account ID is required'
            });
        }

        const whereClause = { 
            bankAccountId,
            exchangeRate: {
                [Op.ne]: null
            }
        };

        if (startDate && endDate) {
            whereClause.bookingDate = {
                [Op.between]: [startDate, endDate]
            };
        }

        const statements = await AccountStatement.findAll({
            where: whereClause,
            order: [['bookingDate', 'ASC']],
            attributes: ['bookingDate', 'exchangeRate', 'creditAmount', 'debitAmount']
        });

        if (statements.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    analysis: {
                        minExchangeRate: 1.00,
                        maxExchangeRate: 1.00,
                        averageExchangeRate: 1.00,
                        totalTransactions: 0,
                        rateVariation: 0
                    },
                    statements: []
                }
            });
        }

        // Calculate exchange rate analysis
        const exchangeRates = statements.map(s => parseFloat(s.exchangeRate));
        const minRate = Math.min(...exchangeRates);
        const maxRate = Math.max(...exchangeRates);
        const avgRate = exchangeRates.reduce((a, b) => a + b, 0) / exchangeRates.length;
        const rateVariation = ((maxRate - minRate) / avgRate) * 100;

        const analysis = {
            minExchangeRate: minRate,
            maxExchangeRate: maxRate,
            averageExchangeRate: avgRate,
            totalTransactions: statements.length,
            rateVariation: rateVariation
        };

        res.status(200).json({
            success: true,
            data: {
                analysis,
                statements
            }
        });

    } catch (error) {
        logger.error('Error fetching exchange rate analysis:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch exchange rate analysis',
            error: error.message
        });
    }
};