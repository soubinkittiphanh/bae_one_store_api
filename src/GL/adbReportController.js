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

    /**
     * Statement of Financial Position (Balance Sheet)
     * GET /api/gl/reports/balance-sheet
     */
    static async getBalanceSheet(req, res) {
        try {
            const { asOfDate = new Date().toISOString().split('T')[0], projectId } = req.query;
            const targetDate = new Date(asOfDate);
            if (isNaN(targetDate.getTime())) {
                return res.status(400).json({ error: "Invalid asOfDate format. Please use YYYY-MM-DD" });
            }

            // Load active currencies and determine configured local (home) currency
            const currencies = await db.currency.findAll({ where: { isActive: true } });
            const localCurrency = currencies.find(c => c.isLocalCCY === true || c.isLocalCCY === 1) || { code: 'LAK', rate: 1.0, exchangeDirection: 'local_to_foreign', symbol: '₭' };

            const convertToHomeCurrency = (amount, currencyCodeOrId) => {
                const val = parseFloat(amount || 0);
                if (isNaN(val) || val === 0) return 0;

                const fromCurrency = currencies.find(c => c.code === currencyCodeOrId || c.id === currencyCodeOrId);
                
                // Step 1: Convert amount to LAK (base currency of the DB)
                let amountInLAK = val;
                if (fromCurrency) {
                    if (fromCurrency.code !== 'LAK') {
                        if (fromCurrency.exchangeDirection === 'local_to_foreign') {
                            amountInLAK = val / (parseFloat(fromCurrency.rate) || 1.0);
                        } else {
                            amountInLAK = val * (parseFloat(fromCurrency.rate) || 1.0);
                        }
                    }
                }

                // Step 2: Convert LAK to localCurrency (home currency)
                if (localCurrency.code === 'LAK') {
                    return amountInLAK;
                }
                if (localCurrency.exchangeDirection === 'local_to_foreign') {
                    return amountInLAK * (parseFloat(localCurrency.rate) || 1.0);
                } else {
                    return amountInLAK / (parseFloat(localCurrency.rate) || 1.0);
                }
            };

            if (projectId) {
                // Mode A: Project-based from General Ledger
                const project = await db.Project.findByPk(projectId);
                if (!project) {
                    return res.status(404).json({ error: "Project not found" });
                }

                // Fetch all GL entries for this project up to asOfDate
                const glEntries = await db.gl.findAll({
                    where: {
                        projectId,
                        bookingDate: { [Op.lte]: asOfDate },
                        status: 'POSTED'
                    },
                    include: [
                        { model: db.chartAccount, as: 'drAccount' },
                        { model: db.chartAccount, as: 'crAccount' }
                    ]
                });

                const accountBalances = {};

                glEntries.forEach(entry => {
                    if (entry.drAccount) {
                        const acc = entry.drAccount;
                        if (!accountBalances[acc.id]) {
                            accountBalances[acc.id] = { id: acc.id, accountName: acc.accountName, accountNumber: acc.accountNumber, accountType: acc.accountType, balance: 0 };
                        }
                        if (acc.accountType === 'Asset' || acc.accountType === 'Expense') {
                            accountBalances[acc.id].balance += parseFloat(entry.localDebit || entry.debit || 0);
                        } else {
                            accountBalances[acc.id].balance -= parseFloat(entry.localDebit || entry.debit || 0);
                        }
                    }
                    if (entry.crAccount) {
                        const acc = entry.crAccount;
                        if (!accountBalances[acc.id]) {
                            accountBalances[acc.id] = { id: acc.id, accountName: acc.accountName, accountNumber: acc.accountNumber, accountType: acc.accountType, balance: 0 };
                        }
                        if (acc.accountType === 'Asset' || acc.accountType === 'Expense') {
                            accountBalances[acc.id].balance -= parseFloat(entry.localCredit || entry.credit || 0);
                        } else {
                            accountBalances[acc.id].balance += parseFloat(entry.localCredit || entry.credit || 0);
                        }
                    }
                });

                const assets = [];
                const liabilities = [];
                const equity = [];

                Object.values(accountBalances).forEach(acc => {
                    if (Math.abs(acc.balance) < 0.01) return;
                    if (acc.accountType === 'Asset') {
                        assets.push(acc);
                    } else if (acc.accountType === 'Liability') {
                        liabilities.push(acc);
                    } else if (acc.accountType === 'Equity') {
                        equity.push(acc);
                    }
                });

                const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
                const totalLiabilities = liabilities.reduce((sum, l) => sum + l.balance, 0);
                const totalEquity = equity.reduce((sum, e) => sum + e.balance, 0);

                return res.json({
                    success: true,
                    mode: 'Project/GL',
                    projectName: project.projectName || project.name,
                    asOfDate,
                    currencyCode: localCurrency.code,
                    currencySymbol: localCurrency.symbol || localCurrency.code,
                    assets: { items: assets, total: totalAssets },
                    liabilities: { items: liabilities, total: totalLiabilities },
                    equity: { items: equity, total: totalEquity }
                });
            } else {
                // Mode B: Global POS / Minimart POS Mode

                // 1. Assets: Cash & Bank
                const activeBankAccounts = await db.bankAccount.findAll({ where: { isActive: true } });
                const bankBalances = [];
                let totalCashAndBank = 0;

                for (const acc of activeBankAccounts) {
                    const snapshot = await db.accountDailyBalance.findOne({
                        where: {
                            bankAccountId: acc.id,
                            date: { [Op.lte]: asOfDate }
                        },
                        order: [['date', 'DESC']]
                    });

                    const balance = snapshot ? parseFloat(snapshot.closingBalance || 0) : parseFloat(acc.balance || 0);
                    const convertedBalance = convertToHomeCurrency(balance, acc.currency);
                    totalCashAndBank += convertedBalance;
                    bankBalances.push({
                        id: acc.id,
                        accountName: acc.accountName,
                        accountNumber: acc.accountNumber,
                        accountType: acc.accountType,
                        balance: convertedBalance,
                        originalBalance: balance,
                        originalCurrency: acc.currency
                    });
                }

                // 2. Assets: Inventory Cost Value
                let rawInventoryCostValue = 0;
                try {
                    const rows = await db.sequelize.query(`
                        SELECT 
                            SUM(
                                CASE 
                                    WHEN c.card_input_date <= :backdate
                                         AND (
                                             (c.card_isused = 0 AND c.isActive = 1)
                                             OR (c.card_isused = 2 AND c.update_time > :backdate)
                                             OR (c.saleLineId IS NOT NULL AND sl.createdAt > :backdate)
                                             OR (c.ticketLineId IS NOT NULL AND tl.createdAt > :backdate)
                                             OR (c.transferLineId IS NOT NULL AND tr.createdAt > :backdate)
                                         )
                                    THEN IFNULL(c.cost, 0)
                                    ELSE 0
                                END
                            ) AS costValueAtBackdate
                        FROM product p
                        LEFT JOIN card c ON c.productId = p.id
                        LEFT JOIN saleLine sl ON sl.id = c.saleLineId
                        LEFT JOIN ticketLine tl ON tl.id = c.ticketLineId
                        LEFT JOIN transferLine tr ON tr.id = c.transferLineId
                        WHERE p.isActive = 1 AND p._category = 'product'
                    `, {
                        replacements: { backdate: targetDate },
                        type: db.sequelize.QueryTypes.SELECT
                    });
                    
                    rawInventoryCostValue = parseFloat(rows[0]?.costValueAtBackdate || 0);
                } catch (error) {
                    logger.warn("Error running backdate stock query, falling back to current product valuation: " + error.message);
                    const products = await db.product.findAll({ where: { isActive: true } });
                    rawInventoryCostValue = products.reduce((sum, p) => sum + (parseFloat(p.stock_count || p.stock || 0) * parseFloat(p.cost_price || p.costPrice || 0)), 0);
                }
                const inventoryCostValue = convertToHomeCurrency(rawInventoryCostValue, 'LAK');

                // 3. Assets: Accounts Receivable (AR)
                const unpaidARInvoices = await db.arInvoiceHeader.findAll({
                    where: {
                        invoiceDate: { [Op.lte]: asOfDate },
                        status: { [Op.notIn]: ['paid', 'cancelled'] }
                    },
                    include: [{ model: db.arReceiveHeaderV2, as: 'receiveHeaders', required: false }]
                });
                let totalAR = 0;
                unpaidARInvoices.forEach(inv => {
                    const totalPaid = (inv.receiveHeaders || []).reduce((sum, rec) => sum + parseFloat(rec.totalReceivedAmount || 0), 0);
                    const outstanding = parseFloat(inv.totalAmount || 0) - totalPaid;
                    if (outstanding > 0) {
                        totalAR += convertToHomeCurrency(outstanding, inv.currencyId);
                    }
                });

                // 4. Liabilities: Accounts Payable (AP)
                const unpaidAPInvoices = await db.apInvoice.findAll({
                    where: {
                        invoiceDate: { [Op.lte]: asOfDate },
                        status: { [Op.notIn]: ['paid', 'cancelled'] }
                    },
                    include: [{ model: db.apInvoiceSettlement, as: 'settlements', required: false }]
                });
                let totalAP = 0;
                unpaidAPInvoices.forEach(inv => {
                    const totalSettled = (inv.settlements || []).reduce((sum, set) => sum + parseFloat(set.paymentAmount || 0), 0);
                    const outstanding = parseFloat(inv.totalAmount || 0) - totalSettled;
                    if (outstanding > 0) {
                        totalAP += convertToHomeCurrency(outstanding, inv.currencyId);
                    }
                });

                // 5. Equity: Net Profit (from P&L)
                const sales = await db.saleHeader.findAll({
                    where: {
                        bookingDate: { [Op.lte]: asOfDate },
                        isActive: true
                    }
                });
                let totalSalesRevenue = 0;
                sales.forEach(s => {
                    totalSalesRevenue += convertToHomeCurrency(s.total, s.currencyId);
                });

                const settlements = await db.apInvoiceSettlement.findAll({
                    where: {
                        settlementDate: { [Op.lte]: asOfDate },
                        status: { [Op.notIn]: ['cancelled', 'draft'] }
                    }
                });
                let totalExpenses = 0;
                settlements.forEach(s => {
                    totalExpenses += convertToHomeCurrency(s.paymentAmount, s.currencyId);
                });
                const netProfit = totalSalesRevenue - totalExpenses;

                const totalAssets = totalCashAndBank + inventoryCostValue + totalAR;
                const totalLiabilities = totalAP;
                const otherEquity = totalAssets - totalLiabilities - netProfit;

                const assetsList = [
                    { accountName: "Cash & Bank Balances (ເງິນສົດ & ທະນາຄານ)", balance: totalCashAndBank, details: bankBalances },
                    { accountName: "Inventory Valuation (ມູນຄ່າສິນຄ້າໃນສະຕັອກ)", balance: inventoryCostValue },
                    { accountName: "Accounts Receivable (ໜີ້ຕ້ອງຮັບ AR)", balance: totalAR }
                ];

                const liabilitiesList = [
                    { accountName: "Accounts Payable (ໜີ້ຕ້ອງສົ່ງ AP)", balance: totalAP }
                ];

                const equityList = [
                    { accountName: "Retained Earnings / Net Profit (ກຳໄລສະສົມ)", balance: netProfit },
                    { accountName: "Owner's Capital / Other Equity (ທຶນອື່ນໆ)", balance: otherEquity }
                ];

                return res.json({
                    success: true,
                    mode: 'Global POS/Minimart',
                    asOfDate,
                    currencyCode: localCurrency.code,
                    currencySymbol: localCurrency.symbol || localCurrency.code,
                    assets: { items: assetsList, total: totalAssets },
                    liabilities: { items: liabilitiesList, total: totalLiabilities },
                    equity: { items: equityList, total: totalAssets - totalLiabilities }
                });
            }
        } catch (error) {
            logger.error("Error generating Balance Sheet:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

    /**
     * Trial Balance Report
     * GET /api/gl/reports/trial-balance
     */
    static async getTrialBalance(req, res) {
        try {
            const { asOfDate = new Date().toISOString().split('T')[0], projectId } = req.query;
            const targetDate = new Date(asOfDate);
            if (isNaN(targetDate.getTime())) {
                return res.status(400).json({ error: "Invalid asOfDate format. Please use YYYY-MM-DD" });
            }

            // 1. Fetch active accounts
            const accounts = await db.chartAccount.findAll({ where: { isActive: true } });

            // 2. Fetch all GL entries up to asOfDate
            const whereClause = {
                bookingDate: { [db.Sequelize.Op.lte]: asOfDate },
                status: 'POSTED'
            };
            if (projectId) {
                whereClause.projectId = projectId;
            }

            const glEntries = await db.gl.findAll({
                where: whereClause,
                include: [
                    { model: db.chartAccount, as: 'drAccount' },
                    { model: db.chartAccount, as: 'crAccount' }
                ]
            });

            const accountBalances = {};
            accounts.forEach(acc => {
                accountBalances[acc.id] = {
                    id: acc.id,
                    accountNumber: acc.accountNumber,
                    accountName: acc.accountName,
                    accountType: acc.accountType,
                    totalDebits: 0,
                    totalCredits: 0,
                    debitBalance: 0,
                    creditBalance: 0
                };
            });

            glEntries.forEach(entry => {
                const drAmt = parseFloat(entry.localDebit !== null && entry.localDebit !== undefined ? entry.localDebit : (entry.debit || 0));
                const crAmt = parseFloat(entry.localCredit !== null && entry.localCredit !== undefined ? entry.localCredit : (entry.credit || 0));

                if (entry.drAccountId && accountBalances[entry.drAccountId]) {
                    accountBalances[entry.drAccountId].totalDebits += drAmt;
                }
                if (entry.crAccountId && accountBalances[entry.crAccountId]) {
                    accountBalances[entry.crAccountId].totalCredits += crAmt;
                }
            });

            let sumDebits = 0;
            let sumCredits = 0;

            Object.values(accountBalances).forEach(acc => {
                const net = acc.totalDebits - acc.totalCredits;
                if (net > 0) {
                    acc.debitBalance = parseFloat(net.toFixed(2));
                    acc.creditBalance = 0;
                } else if (net < 0) {
                    acc.debitBalance = 0;
                    acc.creditBalance = parseFloat(Math.abs(net).toFixed(2));
                } else {
                    acc.debitBalance = 0;
                    acc.creditBalance = 0;
                }
                sumDebits += acc.debitBalance;
                sumCredits += acc.creditBalance;
            });

            return res.json({
                success: true,
                asOfDate,
                accounts: Object.values(accountBalances).filter(acc => acc.totalDebits > 0 || acc.totalCredits > 0),
                totalDebits: parseFloat(sumDebits.toFixed(2)),
                totalCredits: parseFloat(sumCredits.toFixed(2))
            });

        } catch (error) {
            logger.error("Error generating Trial Balance report:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

}

module.exports = ADBReportController;
