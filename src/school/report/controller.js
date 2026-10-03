const { schoolPayment, schoolInvoice, student, schoolClass, payment, user, academicYear, sequelize } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    // 1. Daily Payment Collection Summary (by Cashier and Payment Method)
    async getDailyCollections(req, res) {
        try {
            const { date } = req.query;
            const targetDate = date || new Date().toISOString().split('T')[0];

            // Start and end of the target day
            const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
            const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);

            const collections = await schoolPayment.findAll({
                where: {
                    isActive: true,
                    createdAt: {
                        [sequelize.Sequelize.Op.between]: [startOfDay, endOfDay]
                    }
                },
                attributes: [
                    'userId',
                    'paymentMethodId',
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalCollected'],
                    [sequelize.fn('COUNT', sequelize.col('schoolPayment.id')), 'transactionCount']
                ],
                include: [
                    { model: user, as: 'cashier', attributes: ['id', 'cus_name', 'cus_id'] },
                    { model: payment, as: 'paymentMethod', attributes: ['id', 'payment_code', 'payment_name'] }
                ],
                group: ['userId', 'paymentMethodId'],
                order: [[sequelize.col('totalCollected'), 'DESC']]
            });

            return res.status(200).json({
                date: targetDate,
                collections
            });
        } catch (error) {
            logger.error("Error generating daily collection summary:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 2. Export Lists of Students with Overdue or Outstanding Balances
    async getOverdueBalances(req, res) {
        try {
            const { classId, academicYearId, feeItemId } = req.query;
            const models = require("../../models");
            
            const whereClause = {
                isActive: true,
                status: {
                    [sequelize.Sequelize.Op.in]: ['UNPAID', 'PARTIAL', 'OVERDUE']
                },
                balanceAmount: {
                    [sequelize.Sequelize.Op.gt]: 0
                }
            };

            if (academicYearId) {
                whereClause.academicYearId = academicYearId;
            }

            const studentInclude = {
                model: student,
                as: 'student',
                attributes: ['id', 'studentId', 'firstName', 'lastName', 'phoneNumber', 'parentName', 'parentPhone'],
                include: [{ model: schoolClass, as: 'schoolClass', attributes: ['id', 'name'] }]
            };

            if (classId) {
                studentInclude.where = { classId };
            }

            const queryInclusions = [
                studentInclude,
                { model: academicYear, as: 'academicYear', attributes: ['id', 'name'] }
            ];

            const lineInclude = {
                model: models.schoolInvoiceLine,
                as: 'lines',
                attributes: ['id', 'amount', 'feeItemId'],
                include: [{ model: models.feeItem, as: 'feeItem', attributes: ['id', 'name'] }]
            };

            if (feeItemId) {
                lineInclude.where = { feeItemId };
                lineInclude.required = true;
            }
            queryInclusions.push(lineInclude);

            const outstandingInvoices = await schoolInvoice.findAll({
                where: whereClause,
                include: queryInclusions,
                order: [['balanceAmount', 'DESC']]
            });

            // Map and format response
            const report = outstandingInvoices.map(invoice => {
                let displayTotal = invoice.totalAmount;
                let displayPaid = invoice.paidAmount;
                let displayBalance = invoice.balanceAmount;
                let feeItemDetail = null;

                if (feeItemId && invoice.lines && invoice.lines.length > 0) {
                    const targetLine = invoice.lines[0];
                    const ratio = invoice.totalAmount > 0 ? (invoice.paidAmount / invoice.totalAmount) : 0;
                    displayTotal = targetLine.amount;
                    displayPaid = targetLine.amount * ratio;
                    displayBalance = targetLine.amount * (1 - ratio);
                    feeItemDetail = targetLine.feeItem ? targetLine.feeItem.name : '';
                }

                return {
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    dueDate: invoice.dueDate,
                    status: invoice.status,
                    totalAmount: displayTotal,
                    paidAmount: displayPaid,
                    balanceAmount: displayBalance,
                    feeItemDetail,
                    academicYear: invoice.academicYear ? invoice.academicYear.name : 'N/A',
                    student: {
                        id: invoice.student ? invoice.student.id : null,
                        studentId: invoice.student ? invoice.student.studentId : 'N/A',
                        name: invoice.student ? `${invoice.student.firstName} ${invoice.student.lastName}` : 'N/A',
                        class: invoice.student?.schoolClass ? invoice.student.schoolClass.name : 'N/A',
                        phone: invoice.student ? invoice.student.phoneNumber : 'N/A',
                        parentName: invoice.student ? invoice.student.parentName : 'N/A',
                        parentPhone: invoice.student ? invoice.student.parentPhone : 'N/A'
                    }
                };
            });

            return res.status(200).json(report);
        } catch (error) {
            logger.error("Error generating outstanding balance report:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 3. Class and Room Invoice Summaries
    async getClassRoomSummary(req, res) {
        try {
            const { academicYearId } = req.query;
            const whereClause = { isActive: true };
            if (academicYearId) {
                whereClause.academicYearId = academicYearId;
            }

            const invoices = await schoolInvoice.findAll({
                where: whereClause,
                include: [
                    {
                        model: student,
                        as: 'student',
                        include: [
                            { model: schoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
                            { model: require("../../models").schoolRoom, as: 'schoolRoom', attributes: ['id', 'name'] }
                        ]
                    }
                ]
            });

            // Group by class and room
            const summaryMap = {};

            invoices.forEach(inv => {
                const s = inv.student;
                const classId = s?.schoolClass?.id || 'unknown';
                const className = s?.schoolClass?.name || 'Unassigned Class';
                const roomId = s?.schoolRoom?.id || 'unknown';
                const roomName = s?.schoolRoom?.name || 'Unassigned Room';

                const groupKey = `${classId}-${roomId}`;

                if (!summaryMap[groupKey]) {
                    summaryMap[groupKey] = {
                        classId,
                        className,
                        roomId,
                        roomName,
                        totalInvoices: 0,
                        totalAmount: 0,
                        paidAmount: 0,
                        balanceAmount: 0,
                        paidCount: 0,
                        pendingCount: 0
                    };
                }

                const g = summaryMap[groupKey];
                g.totalInvoices += 1;
                g.totalAmount += inv.totalAmount;
                g.paidAmount += inv.paidAmount;
                g.balanceAmount += inv.balanceAmount;

                if (inv.status === 'PAID') {
                    g.paidCount += 1;
                } else {
                    g.pendingCount += 1;
                }
            });

            return res.status(200).json(Object.values(summaryMap));
        } catch (error) {
            logger.error("Error generating class-room summary report:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 4. Fee Item Invoice Summary
    async getFeeItemSummary(req, res) {
        try {
            const { academicYearId } = req.query;
            const models = require("../../models");

            const invoiceLines = await models.schoolInvoiceLine.findAll({
                include: [
                    {
                        model: models.schoolInvoice,
                        as: 'invoice',
                        where: { isActive: true, ...(academicYearId ? { academicYearId } : {}) }
                    },
                    {
                        model: models.feeItem,
                        as: 'feeItem',
                        attributes: ['id', 'name']
                    }
                ]
            });

            const summaryMap = {};

            invoiceLines.forEach(line => {
                const item = line.feeItem;
                const itemId = item?.id || 'unknown';
                const itemName = item?.name || 'Unassigned Fee Item';

                if (!summaryMap[itemId]) {
                    summaryMap[itemId] = {
                        feeItemId: itemId,
                        feeItemName: itemName,
                        lineCount: 0,
                        totalBilled: 0,
                        totalPaid: 0,
                        totalPending: 0
                    };
                }

                const g = summaryMap[itemId];
                const inv = line.invoice;
                const paymentRatio = inv.totalAmount > 0 ? (inv.paidAmount / inv.totalAmount) : 0;
                
                const linePaid = line.amount * paymentRatio;
                const linePending = line.amount - linePaid;

                g.lineCount += 1;
                g.totalBilled += line.amount;
                g.totalPaid += linePaid;
                g.totalPending += linePending;
            });

            return res.status(200).json(Object.values(summaryMap));
        } catch (error) {
            logger.error("Error generating fee item summary report:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 5. End-of-Day Cash Position & Shift Summary per User (User A, B, C...)
    async getCashPositionReport(req, res) {
        try {
            const { startDate: qStart, endDate: qEnd, userId: qUser } = req.query;
            const targetStart = qStart || new Date().toISOString().split("T")[0];
            const targetEnd = qEnd || targetStart;

            const startOfDay = `${targetStart} 00:00:00`;
            const endOfDay = `${targetEnd} 23:59:59`;

            // 1. Fetch Users
            let userQuery = "SELECT id, cus_id, cus_name, isActive FROM user WHERE isActive = 1";
            const userParams = [];
            if (qUser) {
                userQuery = "SELECT id, cus_id, cus_name, isActive FROM user WHERE id = ?";
                userParams.push(qUser);
            }
            const users = await sequelize.query(userQuery, { replacements: userParams, type: sequelize.Sequelize.QueryTypes.SELECT });

            // 2. Fetch Shifts within date range or currently OPEN
            const shifts = await sequelize.query(`
                SELECT id, userId, status, openTime, closeTime, openingCash, closingCash, createdAt
                FROM cashierShift
                WHERE (createdAt BETWEEN :startOfDay AND :endOfDay) OR (status = "OPEN")
                ORDER BY id DESC
            `, { replacements: { startOfDay, endOfDay }, type: sequelize.Sequelize.QueryTypes.SELECT });

            // 3. Fetch Top-up Transactions (Cash IN)
            const topups = await sequelize.query(`
                SELECT 
                    t.id, 
                    t.referenceId, 
                    t.debit as amount, 
                    t.description, 
                    t.userId, 
                    t.createdAt,
                    t.businessDate,
                    s_entry.bankAccountId as studentAccountId,
                    b.accountName,
                    st.studentId as studentCode,
                    CONCAT(COALESCE(st.firstName, ""), " ", COALESCE(st.lastName, "")) as studentName
                FROM transactionEntry t
                LEFT JOIN transactionEntry s_entry ON t.referenceId = s_entry.referenceId AND s_entry.credit > 0 AND s_entry.id != t.id
                LEFT JOIN bankAccount b ON s_entry.bankAccountId = b.id
                LEFT JOIN student st ON b.studentId = st.id
                WHERE t.transactionType = "TOPUP" AND t.debit > 0 AND (t.createdAt BETWEEN :startOfDay AND :endOfDay)
                ORDER BY t.createdAt DESC
            `, { replacements: { startOfDay, endOfDay }, type: sequelize.Sequelize.QueryTypes.SELECT });

            // 4. Fetch Withdrawal / Refund Transactions (Cash OUT)
            const withdraws = await sequelize.query(`
                SELECT 
                    t.id, 
                    t.referenceId, 
                    t.credit as amount, 
                    t.description, 
                    t.userId, 
                    t.createdAt,
                    t.businessDate,
                    s_entry.bankAccountId as studentAccountId,
                    b.accountName,
                    st.studentId as studentCode,
                    CONCAT(COALESCE(st.firstName, ""), " ", COALESCE(st.lastName, "")) as studentName
                FROM transactionEntry t
                LEFT JOIN transactionEntry s_entry ON t.referenceId = s_entry.referenceId AND s_entry.debit > 0 AND s_entry.id != t.id
                LEFT JOIN bankAccount b ON s_entry.bankAccountId = b.id
                LEFT JOIN student st ON b.studentId = st.id
                WHERE t.transactionType IN ("REFUND", "WITHDRAW") AND t.credit > 0 AND (t.createdAt BETWEEN :startOfDay AND :endOfDay)
                ORDER BY t.createdAt DESC
            `, { replacements: { startOfDay, endOfDay }, type: sequelize.Sequelize.QueryTypes.SELECT });

            // 5. Fetch POS Sales
            const posSales = await sequelize.query(`
                SELECT 
                    s.id, 
                    s.referenceNo, 
                    s.total, 
                    s.userId, 
                    s.paymentId, 
                    p.payment_code as paymentCode, 
                    p.payment_name as paymentName, 
                    s.createdAt
                FROM saleHeader s
                LEFT JOIN payment p ON s.paymentId = p.id
                WHERE (s.createdAt BETWEEN :startOfDay AND :endOfDay)
                ORDER BY s.createdAt DESC
            `, { replacements: { startOfDay, endOfDay }, type: sequelize.Sequelize.QueryTypes.SELECT });

            // 6. Fetch School Fee Collections
            const feePayments = await sequelize.query(`
                SELECT 
                    p.id, 
                    p.amount, 
                    p.referenceNo, 
                    p.userId, 
                    p.paymentMethodId, 
                    pm.payment_code as paymentCode, 
                    pm.payment_name as paymentName, 
                    p.createdAt
                FROM schoolPayment p
                LEFT JOIN payment pm ON p.paymentMethodId = pm.id
                WHERE p.isActive = 1 AND (p.createdAt BETWEEN :startOfDay AND :endOfDay)
                ORDER BY p.createdAt DESC
            `, { replacements: { startOfDay, endOfDay }, type: sequelize.Sequelize.QueryTypes.SELECT });

            // Helper to check if payment is Cash
            const isCash = (code) => {
                const c = (code || "").toUpperCase();
                return c === "CASH" || c === "14" || c === "COD";
            };

            const isNfc = (code) => {
                const c = (code || "").toUpperCase();
                return c === "NFC" || c === "CARD" || c === "WALLET" || c === "22";
            };

            // Map data per user
            const userMap = {};

            users.forEach(u => {
                userMap[u.id] = {
                    userId: u.id,
                    userCode: u.cus_id || String(u.id),
                    userName: u.cus_name || `User #${u.id}`,
                    shift: null,
                    openingCash: 0,
                    closingCash: null,
                    topupIn: 0,
                    topupCount: 0,
                    withdrawOut: 0,
                    withdrawCount: 0,
                    posCashSales: 0,
                    posCashCount: 0,
                    posNfcSales: 0,
                    posNfcCount: 0,
                    posTransferSales: 0,
                    posTransferCount: 0,
                    feeCashCollected: 0,
                    feeCashCount: 0,
                    feeTransferCollected: 0,
                    feeTransferCount: 0,
                    totalCashIn: 0,
                    totalCashOut: 0,
                    netCashMovement: 0,
                    expectedCashInDrawer: 0,
                    actualClosingCash: null,
                    variance: null,
                    transactions: {
                        topups: [],
                        withdrawals: [],
                        posSales: [],
                        feePayments: []
                    }
                };
            });

            // Populate Shifts
            shifts.forEach(sh => {
                if (userMap[sh.userId]) {
                    if (!userMap[sh.userId].shift || (sh.status === "OPEN")) {
                        userMap[sh.userId].shift = sh;
                        userMap[sh.userId].openingCash = Number(sh.openingCash || 0);
                        userMap[sh.userId].closingCash = sh.closingCash !== null ? Number(sh.closingCash) : null;
                    }
                }
            });

            // Populate Topups
            topups.forEach(t => {
                const uid = t.userId || 1;
                if (!userMap[uid]) {
                    userMap[uid] = {
                        userId: uid,
                        userCode: String(uid),
                        userName: `User #${uid}`,
                        shift: null,
                        openingCash: 0,
                        closingCash: null,
                        topupIn: 0,
                        topupCount: 0,
                        withdrawOut: 0,
                        withdrawCount: 0,
                        posCashSales: 0,
                        posCashCount: 0,
                        posNfcSales: 0,
                        posNfcCount: 0,
                        posTransferSales: 0,
                        posTransferCount: 0,
                        feeCashCollected: 0,
                        feeCashCount: 0,
                        feeTransferCollected: 0,
                        feeTransferCount: 0,
                        totalCashIn: 0,
                        totalCashOut: 0,
                        netCashMovement: 0,
                        expectedCashInDrawer: 0,
                        actualClosingCash: null,
                        variance: null,
                        transactions: { topups: [], withdrawals: [], posSales: [], feePayments: [] }
                    };
                }
                const amt = Number(t.amount || 0);
                userMap[uid].topupIn += amt;
                userMap[uid].topupCount += 1;
                userMap[uid].transactions.topups.push({
                    id: t.id,
                    referenceId: t.referenceId,
                    amount: amt,
                    description: t.description,
                    createdAt: t.createdAt,
                    studentCode: t.studentCode,
                    studentName: (t.studentName || "").trim() || t.accountName || "-",
                    accountName: t.accountName
                });
            });

            // Populate Withdrawals
            withdraws.forEach(w => {
                const uid = w.userId || 1;
                if (userMap[uid]) {
                    const amt = Number(w.amount || 0);
                    userMap[uid].withdrawOut += amt;
                    userMap[uid].withdrawCount += 1;
                    userMap[uid].transactions.withdrawals.push({
                        id: w.id,
                        referenceId: w.referenceId,
                        amount: amt,
                        description: w.description,
                        createdAt: w.createdAt,
                        studentCode: w.studentCode,
                        studentName: (w.studentName || "").trim() || w.accountName || "-",
                        accountName: w.accountName
                    });
                }
            });

            // Populate POS Sales
            posSales.forEach(s => {
                const uid = s.userId || 1;
                if (userMap[uid]) {
                    const amt = Number(s.total || 0);
                    const pCode = s.paymentCode || "";
                    if (isCash(pCode)) {
                        userMap[uid].posCashSales += amt;
                        userMap[uid].posCashCount += 1;
                    } else if (isNfc(pCode)) {
                        userMap[uid].posNfcSales += amt;
                        userMap[uid].posNfcCount += 1;
                    } else {
                        userMap[uid].posTransferSales += amt;
                        userMap[uid].posTransferCount += 1;
                    }
                    userMap[uid].transactions.posSales.push({
                        id: s.id,
                        referenceNo: s.referenceNo,
                        total: amt,
                        paymentCode: s.paymentCode,
                        paymentName: s.paymentName,
                        createdAt: s.createdAt
                    });
                }
            });

            // Populate Fee Payments
            feePayments.forEach(f => {
                const uid = f.userId || 1;
                if (userMap[uid]) {
                    const amt = Number(f.amount || 0);
                    const pCode = f.paymentCode || "";
                    if (isCash(pCode)) {
                        userMap[uid].feeCashCollected += amt;
                        userMap[uid].feeCashCount += 1;
                    } else {
                        userMap[uid].feeTransferCollected += amt;
                        userMap[uid].feeTransferCount += 1;
                    }
                    userMap[uid].transactions.feePayments.push({
                        id: f.id,
                        referenceNo: f.referenceNo,
                        amount: amt,
                        paymentCode: f.paymentCode,
                        paymentName: f.paymentName,
                        createdAt: f.createdAt
                    });
                }
            });

            // Compute net positions and overall totals
            let totalOpeningCash = 0;
            let totalTopupIn = 0;
            let totalWithdrawOut = 0;
            let totalPosCashSales = 0;
            let totalPosNfcSales = 0;
            let totalPosTransferSales = 0;
            let totalFeeCash = 0;
            let totalFeeTransfer = 0;
            let grandTotalCashIn = 0;
            let grandTotalCashOut = 0;
            let grandNetCashMovement = 0;
            let grandExpectedCashInDrawers = 0;
            let grandActualClosingCash = 0;
            let activeShiftCount = 0;
            let activeUserCount = 0;

            const userList = Object.values(userMap).map(u => {
                u.totalCashIn = u.topupIn + u.posCashSales + u.feeCashCollected;
                u.totalCashOut = u.withdrawOut;
                u.netCashMovement = u.totalCashIn - u.totalCashOut;
                u.expectedCashInDrawer = u.openingCash + u.netCashMovement;
                
                if (u.closingCash !== null && u.shift && u.shift.status === "CLOSED") {
                    u.actualClosingCash = u.closingCash;
                    u.variance = u.actualClosingCash - u.expectedCashInDrawer;
                    grandActualClosingCash += u.actualClosingCash;
                } else {
                    u.actualClosingCash = null;
                    u.variance = null;
                }

                if (u.shift && u.shift.status === "OPEN") {
                    activeShiftCount += 1;
                }

                // Check if user had any activity or active shift
                const hasActivity = u.openingCash > 0 || u.totalCashIn > 0 || u.totalCashOut > 0 || u.posNfcSales > 0 || u.shift;
                if (hasActivity) {
                    activeUserCount += 1;
                }

                totalOpeningCash += u.openingCash;
                totalTopupIn += u.topupIn;
                totalWithdrawOut += u.withdrawOut;
                totalPosCashSales += u.posCashSales;
                totalPosNfcSales += u.posNfcSales;
                totalPosTransferSales += u.posTransferSales;
                totalFeeCash += u.feeCashCollected;
                totalFeeTransfer += u.feeTransferCollected;
                grandTotalCashIn += u.totalCashIn;
                grandTotalCashOut += u.totalCashOut;
                grandNetCashMovement += u.netCashMovement;
                grandExpectedCashInDrawers += u.expectedCashInDrawer;

                return u;
            });

            // Sort active users first
            userList.sort((a, b) => {
                const aActive = (a.shift ? 1 : 0) + (a.totalCashIn > 0 ? 2 : 0);
                const bActive = (b.shift ? 1 : 0) + (b.totalCashIn > 0 ? 2 : 0);
                return bActive - aActive;
            });

            return res.status(200).json({
                startDate: targetStart,
                endDate: targetEnd,
                summary: {
                    totalOpeningCash,
                    totalTopupIn,
                    totalWithdrawOut,
                    totalPosCashSales,
                    totalPosNfcSales,
                    totalPosTransferSales,
                    totalFeeCash,
                    totalFeeTransfer,
                    grandTotalCashIn,
                    grandTotalCashOut,
                    grandNetCashMovement,
                    grandExpectedCashInDrawers,
                    grandActualClosingCash,
                    activeShiftCount,
                    activeUserCount,
                    totalUsers: userList.length
                },
                users: userList
            });

        } catch (error) {
            logger.error("Error generating cash position report:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
