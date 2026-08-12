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
    }
};
