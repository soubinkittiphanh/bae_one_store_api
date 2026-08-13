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
            const { classId, academicYearId } = req.query;
            
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

            const outstandingInvoices = await schoolInvoice.findAll({
                where: whereClause,
                include: [
                    studentInclude,
                    { model: academicYear, as: 'academicYear', attributes: ['id', 'name'] }
                ],
                order: [['balanceAmount', 'DESC']]
            });

            // Map and format response
            const report = outstandingInvoices.map(invoice => ({
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                dueDate: invoice.dueDate,
                status: invoice.status,
                totalAmount: invoice.totalAmount,
                paidAmount: invoice.paidAmount,
                balanceAmount: invoice.balanceAmount,
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
            }));

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
    }
};
