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

    /**
     * Advance Outstanding Statement with chronological aging (0-30, 31-60, 61-90, >90 days)
     * GET /api/gl/reports/advance-aging
     */
    static async getAdvanceAgingReport(req, res) {
        try {
            const { targetDate = new Date().toISOString().split('T')[0] } = req.query;

            // Fetch all approved advances up to targetDate
            const advances = await db.moneyAdvance.findAll({
                where: {
                    status: 'approved',
                    bookingDate: { [Op.lte]: targetDate }
                },
                include: [
                    { model: db.user, as: 'maker', attributes: ['id', 'cus_name'] },
                    { model: db.currency, as: 'currency', attributes: ['id', 'code'] },
                    { model: db.ministry, as: 'ministry', attributes: ['id', 'ministryCode', 'ministryName'] }
                ]
            });

            const reports = [];
            for (const adv of advances) {
                // Get settlements for this advance up to targetDate
                const settlements = await db.moneySettlement.findAll({
                    where: {
                        moneyAdvanceId: adv.id,
                        bookingDate: { [Op.lte]: targetDate }
                    }
                });

                const totalSettled = settlements.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
                const outstanding = parseFloat(adv.amount || 0) - totalSettled;

                if (outstanding > 0.01) {
                    const bookingDate = adv.bookingDate || adv.createdAt;
                    const diffTime = new Date(targetDate) - new Date(bookingDate);
                    const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

                    let ageCategory = '0-30';
                    if (diffDays > 30 && diffDays <= 60) ageCategory = '31-60';
                    else if (diffDays > 60 && diffDays <= 90) ageCategory = '61-90';
                    else if (diffDays > 90) ageCategory = '>90';

                    reports.push({
                        id: adv.id,
                        advanceNumber: adv.advanceNumber || `#${adv.id}`,
                        bookingDate,
                        amount: parseFloat(adv.amount),
                        totalSettled,
                        outstanding,
                        diffDays,
                        ageCategory,
                        currency: adv.currency?.code || 'LAK',
                        ministryCode: adv.ministry?.ministryCode || 'N/A',
                        ministryName: adv.ministry?.ministryName || 'N/A',
                        recipient: adv.maker?.cus_name || 'N/A'
                    });
                }
            }

            return res.json({ success: true, data: reports });
        } catch (error) {
            logger.error("Error generating Advance Aging report:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

    /**
     * Statement of Withdrawal Applications
     * GET /api/gl/reports/withdrawal-applications
     */
    static async getWithdrawalApplicationReport(req, res) {
        try {
            const { projectId } = req.query;
            const where = {};
            if (projectId) where.projectId = projectId;

            const was = await db.WithdrawalApplication.findAll({
                where,
                include: [
                    { model: db.Project, as: 'project' },
                    { 
                        model: db.ProjectInvoice, 
                        as: 'invoices',
                        include: [
                            { 
                                model: db.ProjectContract, 
                                as: 'contract',
                                include: [{ model: db.currency, as: 'currency' }]
                            }
                        ]
                    }
                ],
                order: [['waDate', 'DESC']]
            });

            return res.json({ success: true, data: was });
        } catch (error) {
            logger.error("Error generating Withdrawal Application report:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

    /**
     * Statement of Expenditures (SOE) Sheet
     * GET /api/gl/reports/statement-of-expenditures
     */
    static async getStatementOfExpenditures(req, res) {
        try {
            const { projectId, startDate, endDate } = req.query;

            const where = {
                status: 'PAID'
            };

            const contractWhere = {};
            if (projectId) contractWhere.projectId = projectId;

            const invoices = await db.ProjectInvoice.findAll({
                where,
                include: [
                    {
                        model: db.ProjectContract,
                        as: 'contract',
                        where: contractWhere,
                        include: [
                            { model: db.Project, as: 'project' },
                            { model: db.currency, as: 'currency' }
                        ]
                    },
                    {
                        model: db.WithdrawalApplication,
                        as: 'withdrawalApplication'
                    }
                ],
                order: [['invoiceDate', 'DESC']]
            });

            // Filter by date range if provided
            let filteredInvoices = invoices;
            if (startDate && endDate) {
                filteredInvoices = invoices.filter(inv => inv.invoiceDate >= startDate && inv.invoiceDate <= endDate);
            }

            const data = filteredInvoices.map(inv => ({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                claimNumber: inv.claimNumber,
                grossAmount: parseFloat(inv.grossAmount),
                retentionAmount: parseFloat(inv.retentionAmount),
                netAmount: parseFloat(inv.netAmount),
                adbFundingAmount: parseFloat(inv.adbFundingAmount),
                counterpartFundingAmount: parseFloat(inv.counterpartFundingAmount),
                contractNumber: inv.contract?.contractNumber,
                contractorName: inv.contract?.contractorName,
                categoryName: inv.contract?.categoryName,
                currency: inv.contract?.currency?.code || 'USD',
                waNumber: inv.withdrawalApplication?.waNumber || 'N/A',
                waDate: inv.withdrawalApplication?.waDate || null
            }));

            return res.json({ success: true, data });
        } catch (error) {
            logger.error("Error generating SOE report:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

    /**
     * Fixed Asset Register / Listing
     * GET /api/gl/reports/fixed-asset-register
     */
    static async getFixedAssetRegister(req, res) {
        try {
            const { targetDate } = req.query;
            const where = {};
            if (targetDate) {
                where.acquisitionDate = { [Op.lte]: targetDate };
            }

            const assets = await db.fixedAssetContract.findAll({
                where,
                include: [
                    { model: db.fixedAssetProduct, as: 'fixedAssetProduct' },
                    { model: db.location, as: 'location' },
                    { model: db.vendor, as: 'vendor' },
                    { model: db.currency, as: 'currency' },
                    { model: db.fixedAssetDepreciation, as: 'depreciationSchedule' }
                ]
            });

            const data = assets.map(asset => {
                const totalCost = parseFloat(asset.acquisitionCost || 0);
                
                // Calculate accumulated depreciation up to targetDate
                const queryDate = targetDate ? new Date(targetDate) : new Date();
                const accumulatedDepr = (asset.depreciationSchedule || [])
                    .filter(d => d.isPosted && new Date(d.periodDate) <= queryDate)
                    .reduce((sum, d) => sum + parseFloat(d.depreciationAmount || 0), 0);

                const bookValue = totalCost - accumulatedDepr;

                return {
                    id: asset.id,
                    contractNumber: asset.contractNumber,
                    assetName: asset.assetName,
                    serialNumber: asset.serialNumber,
                    acquisitionDate: asset.acquisitionDate,
                    acquisitionCost: totalCost,
                    accumulatedDepreciation: accumulatedDepr,
                    bookValue,
                    status: asset.status,
                    location: asset.location?.locationName || 'N/A',
                    vendor: asset.vendor?.vendorName || 'N/A',
                    currency: asset.currency?.code || 'USD',
                    productName: asset.fixedAssetProduct?.productName || 'N/A',
                    productCode: asset.fixedAssetProduct?.productCode || 'N/A'
                };
            });

            return res.json({ success: true, data });
        } catch (error) {
            logger.error("Error generating Fixed Asset Register report:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }
}

module.exports = ADBReportController;
