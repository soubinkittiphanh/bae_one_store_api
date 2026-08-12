const { schoolPayment, schoolInvoice, schoolInvoiceLine, student, schoolClass, payment, user, cashierShift, sequelize } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    // 1. Process / Record Payment
    async create(req, res) {
        const t = await sequelize.transaction();
        try {
            const { schoolInvoiceId, amount, paymentMethodId, referenceNo, cashierShiftId } = req.body;
            const cashierUserId = req.user ? req.user.id : 1; // Default to user 1 if auth not present for tests

            if (!schoolInvoiceId || !amount || !paymentMethodId) {
                await t.rollback();
                return res.status(400).json({ message: "schoolInvoiceId, amount, and paymentMethodId are required" });
            }

            // Find invoice
            const invoice = await schoolInvoice.findByPk(schoolInvoiceId, { transaction: t });
            if (!invoice) {
                await t.rollback();
                return res.status(404).json({ message: "Invoice not found" });
            }

            if (invoice.status === 'PAID') {
                await t.rollback();
                return res.status(400).json({ message: "Invoice is already fully paid" });
            }

            // Calculate outstanding balance
            const remainingBalance = invoice.totalAmount - invoice.paidAmount;

            // Business Logic: Payment Capping
            if (amount > remainingBalance) {
                await t.rollback();
                return res.status(400).json({
                    message: `Payment amount (${amount}) exceeds the remaining balance (${remainingBalance})`
                });
            }

            // Verify payment method exists
            const method = await payment.findByPk(paymentMethodId, { transaction: t });
            if (!method) {
                await t.rollback();
                return res.status(400).json({ message: "Invalid payment method" });
            }

            // Create school payment
            const newPayment = await schoolPayment.create({
                schoolInvoiceId,
                amount,
                paymentMethodId,
                referenceNo: referenceNo || '',
                cashierShiftId: cashierShiftId || null,
                userId: cashierUserId
            }, { transaction: t });

            // Status Auto-Update
            const newPaidAmount = invoice.paidAmount + amount;
            const newBalanceAmount = invoice.totalAmount - newPaidAmount;
            const newStatus = newBalanceAmount === 0 ? 'PAID' : 'PARTIAL';

            await schoolInvoice.update({
                paidAmount: newPaidAmount,
                balanceAmount: newBalanceAmount,
                status: newStatus
            }, {
                where: { id: schoolInvoiceId },
                transaction: t
            });

            await t.commit();
            logger.info(`Recorded payment of ${amount} against invoice ${schoolInvoiceId} by user ${cashierUserId}`);

            // Fetch the populated payment for returning
            const populatedPayment = await schoolPayment.findByPk(newPayment.id, {
                include: [
                    { model: schoolInvoice, as: 'invoice', include: [{ model: student, as: 'student', include: [{ model: schoolClass, as: 'schoolClass' }] }] },
                    { model: payment, as: 'paymentMethod' },
                    { model: user, as: 'cashier' }
                ]
            });

            return res.status(201).json(populatedPayment);
        } catch (error) {
            await t.rollback();
            logger.error("Error recording school payment:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 2. Generate Receipt Data for Thermal or Digital Receipt
    async getReceipt(req, res) {
        try {
            const paymentId = req.params.id;
            const paymentInfo = await schoolPayment.findByPk(paymentId, {
                include: [
                    {
                        model: schoolInvoice,
                        as: 'invoice',
                        include: [
                            { model: student, as: 'student', include: [{ model: schoolClass, as: 'schoolClass' }] },
                            { model: schoolInvoiceLine, as: 'lines', include: [{ model: feeItem, as: 'feeItem' }] }
                        ]
                    },
                    { model: payment, as: 'paymentMethod' },
                    { model: user, as: 'cashier' }
                ]
            });

            if (!paymentInfo) {
                return res.status(404).json({ message: "Payment transaction not found" });
            }

            // Construct structured thermal/digital receipt data
            const receipt = {
                header: {
                    schoolName: "DCOMMERCE INTERNATIONAL SCHOOL",
                    address: "Vientiane, Lao PDR",
                    phone: "+856 20 55555555",
                    title: "OFFICIAL RECEIPT"
                },
                details: {
                    receiptNo: `REC-SCH-${paymentInfo.id}-${Date.now().toString().slice(-4)}`,
                    date: paymentInfo.createdAt,
                    cashierName: paymentInfo.cashier ? `${paymentInfo.cashier.cus_name || paymentInfo.cashier.cus_id || 'Cashier'}` : 'N/A',
                    paymentMethod: paymentInfo.paymentMethod ? paymentInfo.paymentMethod.payment_name : 'N/A',
                    referenceNo: paymentInfo.referenceNo || 'N/A'
                },
                student: {
                    studentId: paymentInfo.invoice?.student?.studentId || 'N/A',
                    name: paymentInfo.invoice?.student ? `${paymentInfo.invoice.student.firstName} ${paymentInfo.invoice.student.lastName}` : 'N/A',
                    grade: paymentInfo.invoice?.student?.schoolClass ? paymentInfo.invoice.student.schoolClass.name : 'N/A'
                },
                invoice: {
                    invoiceNo: paymentInfo.invoice?.invoiceNumber || 'N/A',
                    items: paymentInfo.invoice?.lines?.map(line => ({
                        name: line.feeItem ? line.feeItem.name : 'Fee Item',
                        amount: line.amount,
                        desc: line.description || ''
                    })) || [],
                    totalAmount: paymentInfo.invoice?.totalAmount || 0,
                    previouslyPaid: paymentInfo.invoice ? (paymentInfo.invoice.paidAmount - paymentInfo.amount) : 0,
                    currentPayment: paymentInfo.amount,
                    remainingBalance: paymentInfo.invoice?.balanceAmount || 0
                }
            };

            return res.status(200).json(receipt);
        } catch (error) {
            logger.error("Error generating receipt data:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
