const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const db = require('../models');
const AnnualExpenseBudget = db.annualExpenseBudget;
const ApPaymentHeader = db.apPaymentHeader;
const Currency = db.currency;
const ChartAccount = db.chartAccount;
const Ministry = db.ministry;
const logger = require('../api/logger');

/**
 * Get all expense budgets with optional filtering
 */
const getAllBudgets = async (req, res) => {
    try {
        const { year, drAccountId, ministryId, currencyId, isActive } = req.query;
        const whereClause = {};

        if (year) whereClause.year = parseInt(year);
        if (drAccountId) whereClause.drAccountId = parseInt(drAccountId);
        if (ministryId) whereClause.ministryId = parseInt(ministryId);
        if (currencyId) whereClause.currencyId = parseInt(currencyId);
        if (isActive !== undefined) whereClause.isActive = isActive === 'true' || isActive === true;

        const budgets = await AnnualExpenseBudget.findAll({
            where: whereClause,
            include: [
                { model: Currency, as: 'currency' },
                { model: ChartAccount, as: 'expenseAccount' },
                { model: Ministry, as: 'ministry' }
            ],
            order: [['year', 'DESC'], ['id', 'ASC']]
        });

        // Compute spent amounts for each budget
        const result = await Promise.all(budgets.map(async (budget) => {
            const budgetData = budget.toJSON();
            const payments = await ApPaymentHeader.findAll({
                where: {
                    budgetId: budget.id,
                    expenseSource: 'BUDGET',
                    isActive: true
                },
                attributes: ['id', 'paymentNumber', 'bookingDate', 'payee', 'totalAmount', 'rate', 'notes']
            });

            const spentAmount = payments.reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0);
            const allocatedAmount = parseFloat(budget.allocatedAmount) || 0;
            const remainingAmount = allocatedAmount - spentAmount;
            const percentSpent = allocatedAmount > 0 ? parseFloat(((spentAmount / allocatedAmount) * 100).toFixed(2)) : 0;

            return {
                ...budgetData,
                spentAmount,
                remainingAmount,
                percentSpent,
                isOverBudget: spentAmount > allocatedAmount,
                isWarning: percentSpent >= (budget.thresholdWarningPercent || 80),
                paymentCount: payments.length,
                payments
            };
        }));

        res.status(200).json(result);
    } catch (error) {
        logger.error(`Error in getAllBudgets: ${error.message}`);
        res.status(500).json({ message: 'Failed to fetch expense budgets', error: error.message });
    }
};

/**
 * Get budget by ID with detailed payments list
 */
const getBudgetById = async (req, res) => {
    try {
        const { id } = req.params;
        const budget = await AnnualExpenseBudget.findByPk(id, {
            include: [
                { model: Currency, as: 'currency' },
                { model: ChartAccount, as: 'expenseAccount' },
                { model: Ministry, as: 'ministry' }
            ]
        });

        if (!budget) {
            return res.status(404).json({ message: 'Expense budget not found' });
        }

        const payments = await ApPaymentHeader.findAll({
            where: {
                budgetId: budget.id,
                expenseSource: 'BUDGET',
                isActive: true
            },
            include: [
                { model: Currency, as: 'currency' },
                { model: ChartAccount, as: 'drAccount' },
                { model: ChartAccount, as: 'crAccount' }
            ],
            order: [['bookingDate', 'DESC'], ['id', 'DESC']]
        });

        const spentAmount = payments.reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0);
        const allocatedAmount = parseFloat(budget.allocatedAmount) || 0;
        const remainingAmount = allocatedAmount - spentAmount;
        const percentSpent = allocatedAmount > 0 ? parseFloat(((spentAmount / allocatedAmount) * 100).toFixed(2)) : 0;

        res.status(200).json({
            ...budget.toJSON(),
            spentAmount,
            remainingAmount,
            percentSpent,
            isOverBudget: spentAmount > allocatedAmount,
            isWarning: percentSpent >= (budget.thresholdWarningPercent || 80),
            paymentCount: payments.length,
            payments
        });
    } catch (error) {
        logger.error(`Error in getBudgetById: ${error.message}`);
        res.status(500).json({ message: 'Failed to fetch expense budget', error: error.message });
    }
};

/**
 * Create a new Annual Expense Budget
 */
const createBudget = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const payload = { ...req.body };
        if (typeof payload.allocatedAmount === 'string') {
            payload.allocatedAmount = parseFloat(payload.allocatedAmount.replace(/,/g, ''));
        }
        if (typeof payload.exchangeRate === 'string') {
            payload.exchangeRate = parseFloat(payload.exchangeRate.replace(/,/g, ''));
        }

        const newBudget = await AnnualExpenseBudget.create(payload);
        const fetched = await AnnualExpenseBudget.findByPk(newBudget.id, {
            include: [
                { model: Currency, as: 'currency' },
                { model: ChartAccount, as: 'expenseAccount' },
                { model: Ministry, as: 'ministry' }
            ]
        });

        res.status(201).json(fetched);
    } catch (error) {
        logger.error(`Error in createBudget: ${error.message}`);
        res.status(500).json({ message: 'Failed to create expense budget', error: error.message });
    }
};

/**
 * Update an existing Annual Expense Budget
 */
const updateBudget = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const budget = await AnnualExpenseBudget.findByPk(id);

        if (!budget) {
            return res.status(404).json({ message: 'Expense budget not found' });
        }

        const payload = { ...req.body };
        if (payload.allocatedAmount !== undefined && typeof payload.allocatedAmount === 'string') {
            payload.allocatedAmount = parseFloat(payload.allocatedAmount.replace(/,/g, ''));
        }
        if (payload.exchangeRate !== undefined && typeof payload.exchangeRate === 'string') {
            payload.exchangeRate = parseFloat(payload.exchangeRate.replace(/,/g, ''));
        }

        await budget.update(payload);
        const updated = await AnnualExpenseBudget.findByPk(id, {
            include: [
                { model: Currency, as: 'currency' },
                { model: ChartAccount, as: 'expenseAccount' },
                { model: Ministry, as: 'ministry' }
            ]
        });

        res.status(200).json(updated);
    } catch (error) {
        logger.error(`Error in updateBudget: ${error.message}`);
        res.status(500).json({ message: 'Failed to update expense budget', error: error.message });
    }
};

/**
 * Soft-delete or toggle active status of budget
 */
const toggleBudgetStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const budget = await AnnualExpenseBudget.findByPk(id);

        if (!budget) {
            return res.status(404).json({ message: 'Expense budget not found' });
        }

        const updated = await budget.update({ isActive: !budget.isActive });
        res.status(200).json(updated);
    } catch (error) {
        logger.error(`Error in toggleBudgetStatus: ${error.message}`);
        res.status(500).json({ message: 'Failed to toggle budget status', error: error.message });
    }
};

/**
 * Summary Analytics of Budgets vs Actuals for a Fiscal Year
 */
const getBudgetSummary = async (req, res) => {
    try {
        const year = parseInt(req.params.year) || new Date().getFullYear();

        const budgets = await AnnualExpenseBudget.findAll({
            where: { year, isActive: true },
            include: [
                { model: Currency, as: 'currency' },
                { model: ChartAccount, as: 'expenseAccount' },
                { model: Ministry, as: 'ministry' }
            ]
        });

        const budgetItems = await Promise.all(budgets.map(async (b) => {
            const payments = await ApPaymentHeader.findAll({
                where: {
                    budgetId: b.id,
                    expenseSource: 'BUDGET',
                    isActive: true
                }
            });

            const spentAmount = payments.reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0);
            const allocatedAmount = parseFloat(b.allocatedAmount) || 0;
            const remainingAmount = allocatedAmount - spentAmount;
            const percentSpent = allocatedAmount > 0 ? parseFloat(((spentAmount / allocatedAmount) * 100).toFixed(2)) : 0;

            return {
                id: b.id,
                name: b.name,
                year: b.year,
                currency: b.currency,
                expenseAccount: b.expenseAccount,
                ministry: b.ministry,
                allocatedAmount,
                spentAmount,
                remainingAmount,
                percentSpent,
                thresholdWarningPercent: b.thresholdWarningPercent,
                isOverBudget: spentAmount > allocatedAmount,
                isWarning: percentSpent >= (b.thresholdWarningPercent || 80),
                paymentCount: payments.length
            };
        }));

        // POS Operational Expenses in the same year (for source comparison)
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;

        const posPayments = await ApPaymentHeader.findAll({
            where: {
                expenseSource: 'POS_SALE',
                isActive: true,
                bookingDate: {
                    [Op.between]: [startOfYear, endOfYear]
                }
            },
            include: [{ model: Currency, as: 'currency' }]
        });

        const posExpensesTotal = posPayments.reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0);

        const totalAllocated = budgetItems.reduce((sum, b) => sum + b.allocatedAmount, 0);
        const totalBudgetSpent = budgetItems.reduce((sum, b) => sum + b.spentAmount, 0);
        const totalRemaining = totalAllocated - totalBudgetSpent;
        const overallUtilization = totalAllocated > 0 ? parseFloat(((totalBudgetSpent / totalAllocated) * 100).toFixed(2)) : 0;

        res.status(200).json({
            year,
            totalAllocated,
            totalBudgetSpent,
            totalRemaining,
            overallUtilization,
            posExpensesTotal,
            posPaymentCount: posPayments.length,
            budgetCount: budgetItems.length,
            budgets: budgetItems
        });
    } catch (error) {
        logger.error(`Error in getBudgetSummary: ${error.message}`);
        res.status(500).json({ message: 'Failed to generate budget summary', error: error.message });
    }
};

/**
 * Check real-time headroom for a proposed payment amount
 */
const checkHeadroom = async (req, res) => {
    try {
        const { budgetId, amount } = req.query;
        if (!budgetId) {
            return res.status(400).json({ message: 'budgetId is required' });
        }

        const budget = await AnnualExpenseBudget.findByPk(budgetId, {
            include: [{ model: Currency, as: 'currency' }]
        });

        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        const payments = await ApPaymentHeader.findAll({
            where: {
                budgetId: budget.id,
                expenseSource: 'BUDGET',
                isActive: true
            }
        });

        const currentSpent = payments.reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0);
        const allocated = parseFloat(budget.allocatedAmount) || 0;
        const currentRemaining = allocated - currentSpent;

        const proposedAmount = parseFloat(amount) || 0;
        const postRemaining = currentRemaining - proposedAmount;
        const postSpent = currentSpent + proposedAmount;
        const postPercent = allocated > 0 ? parseFloat(((postSpent / allocated) * 100).toFixed(2)) : 0;

        const exceedsBudget = proposedAmount > currentRemaining;

        res.status(200).json({
            budgetId: budget.id,
            budgetName: budget.name,
            year: budget.year,
            currency: budget.currency,
            allocatedAmount: allocated,
            currentSpent,
            currentRemaining,
            proposedAmount,
            postSpent,
            postRemaining,
            postPercent,
            thresholdWarningPercent: budget.thresholdWarningPercent,
            exceedsBudget,
            isWarning: postPercent >= budget.thresholdWarningPercent
        });
    } catch (error) {
        logger.error(`Error in checkHeadroom: ${error.message}`);
        res.status(500).json({ message: 'Failed to check budget headroom', error: error.message });
    }
};

module.exports = {
    getAllBudgets,
    getBudgetById,
    createBudget,
    updateBudget,
    toggleBudgetStatus,
    getBudgetSummary,
    checkHeadroom
};
