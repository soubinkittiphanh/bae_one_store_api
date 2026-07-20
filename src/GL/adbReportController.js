const db = require('../models');
const { Op } = require('sequelize');
const logger = require('../api/logger');

class ADBReportController {
    /**
     * Statement of Receipts and Payments
     * GET /api/gl/reports/receipts-payments
     */
    static async getReceiptsAndPayments(req, res) {
        try {
            const { projectId, startDate, endDate } = req.query;

            if (!projectId || !startDate || !endDate) {
                return res.status(400).json({ error: "projectId, startDate, and endDate are required query parameters." });
            }

            // Fetch the project details
            const project = await db.Project.findByPk(projectId);
            if (!project) {
                return res.status(404).json({ error: "Project not found" });
            }

            // 1. Fetch all GL entries for this project in the date range
            const glEntries = await db.gl.findAll({
                where: {
                    projectId,
                    bookingDate: { [Op.between]: [startDate, endDate] },
                    status: 'POSTED'
                },
                include: [
                    { model: db.chartAccount, as: 'drAccount' },
                    { model: db.chartAccount, as: 'crAccount' },
                    { model: db.ProjectBudget, as: 'category' }
                ]
            });

            // 2. Identify and classify Receipts and Payments
            let adbFunding = 0;
            let govtFunding = 0;
            let otherFunding = 0;

            const paymentsByCategory = {};

            glEntries.forEach(entry => {
                const drType = entry.drAccount?.accountType;
                const crType = entry.crAccount?.accountType;

                // Receipt Check: Debit to Bank/Cash Asset and Credit to Revenue/Liability/Equity
                if (drType === 'Asset' && (crType === 'Revenue' || crType === 'Liability' || crType === 'Equity')) {
                    const desc = (entry.description || '').toLowerCase();
                    if (desc.includes('adb') || desc.includes('loan') || desc.includes('grant')) {
                        adbFunding += parseFloat(entry.localDebit || entry.debit || 0);
                    } else if (desc.includes('govt') || desc.includes('counterpart') || desc.includes('government')) {
                        govtFunding += parseFloat(entry.localDebit || entry.debit || 0);
                    } else {
                        otherFunding += parseFloat(entry.localDebit || entry.debit || 0);
                    }
                }

                // Payment Check: Debit to Expense/Asset (excluding bank accounts) and Credit to Cash/Bank Asset
                if ((drType === 'Expense' || entry.categoryId) && crType === 'Asset') {
                    const catName = entry.category?.categoryName || 'Other Expenditures / Uncategorized';
                    const catId = entry.categoryId || 'uncategorized';

                    if (!paymentsByCategory[catId]) {
                        paymentsByCategory[catId] = {
                            categoryId: catId,
                            categoryName: catName,
                            amount: 0
                        };
                    }
                    paymentsByCategory[catId].amount += parseFloat(entry.localDebit || entry.debit || 0);
                }
            });

            const receiptsList = [
                { source: "ADB Loan/Grant Funding", amount: adbFunding },
                { source: "Government Counterpart Funding", amount: govtFunding },
                { source: "Other Co-financiers / Miscellaneous", amount: otherFunding }
            ];

            const totalReceipts = adbFunding + govtFunding + otherFunding;
            const paymentsList = Object.values(paymentsByCategory);
            const totalPayments = paymentsList.reduce((sum, p) => sum + p.amount, 0);

            res.status(200).json({
                projectName: project.projectName || project.name,
                startDate,
                endDate,
                receipts: {
                    items: receiptsList,
                    total: totalReceipts
                },
                payments: {
                    items: paymentsList,
                    total: totalPayments
                },
                netIncreaseDecrease: totalReceipts - totalPayments
            });

        } catch (error) {
            logger.error("Error generating Statement of Receipts and Payments:", error);
            res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

    /**
     * Statement of Budget vs Actual
     * GET /api/gl/reports/budget-vs-actual
     */
    static async getBudgetVsActual(req, res) {
        try {
            const { projectId, startDate, endDate } = req.query;

            if (!projectId || !startDate || !endDate) {
                return res.status(400).json({ error: "projectId, startDate, and endDate are required query parameters." });
            }

            const project = await db.Project.findByPk(projectId);
            if (!project) {
                return res.status(404).json({ error: "Project not found" });
            }

            // 1. Fetch all budget categories for this project
            const budgets = await db.ProjectBudget.findAll({
                where: { projectId }
            });

            // 2. Fetch all posted GL entries for this project in the period
            const periodEntries = await db.gl.findAll({
                where: {
                    projectId,
                    bookingDate: { [Op.between]: [startDate, endDate] },
                    status: 'POSTED'
                },
                include: [{ model: db.chartAccount, as: 'drAccount' }]
            });

            // 3. Fetch all posted GL entries for this project from inception to endDate
            const cumulativeEntries = await db.gl.findAll({
                where: {
                    projectId,
                    bookingDate: { [Op.lte]: endDate },
                    status: 'POSTED'
                },
                include: [{ model: db.chartAccount, as: 'drAccount' }]
            });

            const comparison = budgets.map(budget => {
                // Sum actual spent for this budget category in the period
                const periodActual = periodEntries
                    .filter(entry => entry.categoryId === budget.id && (entry.drAccount?.accountType === 'Expense' || entry.debit > 0))
                    .reduce((sum, entry) => sum + parseFloat(entry.localDebit || entry.debit || 0), 0);

                // Sum cumulative actual spent since inception
                const cumulativeActual = cumulativeEntries
                    .filter(entry => entry.categoryId === budget.id && (entry.drAccount?.accountType === 'Expense' || entry.debit > 0))
                    .reduce((sum, entry) => sum + parseFloat(entry.localDebit || entry.debit || 0), 0);

                const budgetAmount = parseFloat(budget.allocatedAmount || 0);
                const variance = budgetAmount - cumulativeActual;

                return {
                    categoryId: budget.id,
                    categoryName: budget.categoryName,
                    budgetAmount,
                    periodActual,
                    cumulativeActual,
                    variance,
                    percentSpent: budgetAmount > 0 ? parseFloat(((cumulativeActual / budgetAmount) * 100).toFixed(2)) : 0
                };
            });

            const totalBudget = comparison.reduce((sum, c) => sum + c.budgetAmount, 0);
            const totalPeriodActual = comparison.reduce((sum, c) => sum + c.periodActual, 0);
            const totalCumulativeActual = comparison.reduce((sum, c) => sum + c.cumulativeActual, 0);
            const totalVariance = totalBudget - totalCumulativeActual;

            res.status(200).json({
                projectName: project.projectName || project.name,
                startDate,
                endDate,
                categories: comparison,
                totals: {
                    budget: totalBudget,
                    periodActual: totalPeriodActual,
                    cumulativeActual: totalCumulativeActual,
                    variance: totalVariance,
                    percentSpent: totalBudget > 0 ? parseFloat(((totalCumulativeActual / totalBudget) * 100).toFixed(2)) : 0
                }
            });

        } catch (error) {
            logger.error("Error generating Statement of Budget vs Actual:", error);
            res.status(500).json({ error: error.message || "Internal server error" });
        }
    }
}

module.exports = ADBReportController;
