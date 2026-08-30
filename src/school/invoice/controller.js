const { schoolInvoice, schoolInvoiceLine, student, feeStructure, feeItem, schoolClass, schoolRoom, academicYear, sequelize } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    // 1. Generate Individual Invoice
    async create(req, res) {
        const t = await sequelize.transaction();
        try {
            let { studentId, academicYearId, dueDate, items, billingMonth } = req.body;
            if (billingMonth) {
                billingMonth = billingMonth.substring(0, 7);
            }
            if (!studentId || !academicYearId) {
                await t.rollback();
                return res.status(400).json({ message: "studentId and academicYearId are required" });
            }

            // Find student
            const studentProfile = await student.findByPk(studentId, { transaction: t });
            if (!studentProfile) {
                await t.rollback();
                return res.status(404).json({ message: "Student not found" });
            }

            // Check if monthly invoice already exists
            if (billingMonth) {
                const existingInvoice = await schoolInvoice.findOne({
                    where: {
                        studentId,
                        academicYearId,
                        billingMonth,
                        isActive: true
                    },
                    transaction: t
                });
                if (existingInvoice) {
                    await t.rollback();
                    return res.status(400).json({ message: `Invoice for this student and month (${billingMonth}) already exists.` });
                }
            }

            let invoiceLinesData = [];
            let totalAmount = 0;

            if (items && items.length > 0) {
                // Use custom items passed in payload
                for (const item of items) {
                    invoiceLinesData.push({
                        feeItemId: item.feeItemId,
                        amount: item.amount,
                        description: item.description || ''
                    });
                    totalAmount += item.amount;
                }
            } else {
                // Fetch student enrolled optional fees
                const enrolledOptionalFees = await require("../../models").studentFeeItem.findAll({
                    where: { studentId, isActive: true },
                    transaction: t
                });
                const enrolledFeeItemIds = enrolledOptionalFees.map(f => f.feeItemId);

                // Fetch from standard fee structures for the student's class and globally
                const feeStructures = await feeStructure.findAll({
                    where: {
                        academicYearId,
                        isActive: true,
                        [sequelize.Sequelize.Op.or]: [
                            { classId: studentProfile.classId },
                            { classId: null }
                        ]
                    },
                    include: [{ model: feeItem, as: 'feeItem' }],
                    transaction: t
                });

                for (const fs of feeStructures) {
                    // Check optional fee logic
                    if (fs.isOptional && !enrolledFeeItemIds.includes(fs.feeItemId)) {
                        continue; // Skip optional fee because student is not enrolled
                    }

                    invoiceLinesData.push({
                        feeItemId: fs.feeItemId,
                        amount: fs.amount,
                        description: fs.feeItem ? `Standard ${fs.feeItem.name}` : 'Standard Fee'
                    });
                    totalAmount += fs.amount;
                }
            }

            const timestamp = Date.now();
            const invoiceNumber = `INV-SCH-${studentProfile.studentId}-${timestamp}`;

            const invoice = await schoolInvoice.create({
                invoiceNumber,
                studentId,
                academicYearId,
                billingMonth: billingMonth || null,
                totalAmount,
                paidAmount: 0.00,
                balanceAmount: totalAmount,
                status: 'UNPAID',
                dueDate: dueDate || null
            }, { transaction: t });

            // Create lines
            if (invoiceLinesData.length > 0) {
                await schoolInvoiceLine.bulkCreate(
                    invoiceLinesData.map(line => ({
                        ...line,
                        schoolInvoiceId: invoice.id
                    })),
                    { transaction: t }
                );
            }

            await t.commit();
            logger.info(`Generated individual invoice ${invoiceNumber} for student ${studentId}`);
            
            // Get full generated invoice with lines
            const fullInvoice = await schoolInvoice.findByPk(invoice.id, {
                include: [{ model: schoolInvoiceLine, as: 'lines' }],
            });

            return res.status(201).json(fullInvoice);
        } catch (error) {
            await t.rollback();
            logger.error("Error creating individual invoice:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 2. Generate Bulk Invoices for a Class/Grade
    async createBulk(req, res) {
        const t = await sequelize.transaction();
        try {
            let { classId, academicYearId, dueDate, billingMonth } = req.body;
            if (billingMonth) {
                billingMonth = billingMonth.substring(0, 7);
            }
            if (!classId || !academicYearId) {
                await t.rollback();
                return res.status(400).json({ message: "classId and academicYearId are required" });
            }

            // Find all active students in the class
            const studentsList = await student.findAll({
                where: { classId, isActive: true },
                transaction: t
            });

            if (studentsList.length === 0) {
                await t.rollback();
                return res.status(400).json({ message: "No active students found in the specified class" });
            }

            // Find fee structures for this class or globally for this academic year
            const feeStructures = await feeStructure.findAll({
                where: {
                    academicYearId,
                    isActive: true,
                    [sequelize.Sequelize.Op.or]: [
                        { classId },
                        { classId: null }
                    ]
                },
                include: [{ model: feeItem, as: 'feeItem' }],
                transaction: t
            });

            if (feeStructures.length === 0) {
                await t.rollback();
                return res.status(400).json({ message: "No active fee structures found for this class or global academic year" });
            }

            const invoicesCreated = [];
            const skippedStudents = [];

            for (const stud of studentsList) {
                // If billingMonth is set, check if they already have an invoice for this month
                if (billingMonth) {
                    const existingInvoice = await schoolInvoice.findOne({
                        where: {
                            studentId: stud.id,
                            academicYearId,
                            billingMonth,
                            isActive: true
                        },
                        transaction: t
                    });
                    if (existingInvoice) {
                        skippedStudents.push({
                            studentId: stud.studentId,
                            name: `${stud.firstName} ${stud.lastName}`,
                            reason: "Already invoiced for this month"
                        });
                        continue;
                    }
                }

                // Fetch student enrolled optional fees
                const enrolledOptionalFees = await require("../../models").studentFeeItem.findAll({
                    where: { studentId: stud.id, isActive: true },
                    transaction: t
                });
                const enrolledFeeItemIds = enrolledOptionalFees.map(f => f.feeItemId);

                let totalAmount = 0;
                const invoiceLinesData = [];

                for (const fs of feeStructures) {
                    // Check optional fee logic
                    if (fs.isOptional && !enrolledFeeItemIds.includes(fs.feeItemId)) {
                        continue; // Skip optional fee because student is not enrolled
                    }

                    invoiceLinesData.push({
                        feeItemId: fs.feeItemId,
                        amount: fs.amount,
                        description: fs.feeItem ? `Standard ${fs.feeItem.name}` : 'Standard Fee'
                    });
                    totalAmount += fs.amount;
                }

                // Skip if no fee applies to the student (e.g. all available fees are optional and they didn't sign up for any)
                if (invoiceLinesData.length === 0) {
                    skippedStudents.push({
                        studentId: stud.studentId,
                        name: `${stud.firstName} ${stud.lastName}`,
                        reason: "No applicable fees for this student"
                    });
                    continue;
                }

                const timestamp = Date.now();
                const invoiceNumber = `INV-SCH-${stud.studentId}-${timestamp}`;

                const invoice = await schoolInvoice.create({
                    invoiceNumber,
                    studentId: stud.id,
                    academicYearId,
                    billingMonth: billingMonth || null,
                    totalAmount,
                    paidAmount: 0.00,
                    balanceAmount: totalAmount,
                    status: 'UNPAID',
                    dueDate: dueDate || null
                }, { transaction: t });

                await schoolInvoiceLine.bulkCreate(
                    invoiceLinesData.map(line => ({
                        ...line,
                        schoolInvoiceId: invoice.id
                    })),
                    { transaction: t }
                );

                invoicesCreated.push(invoice);
            }

            await t.commit();
            logger.info(`Generated bulk invoices for class: ${classId}, count: ${invoicesCreated.length}`);
            return res.status(201).json({
                message: `Successfully generated ${invoicesCreated.length} invoices. Skipped ${skippedStudents.length} students.`,
                invoices: invoicesCreated,
                skipped: skippedStudents
            });
        } catch (error) {
            await t.rollback();
            logger.error("Error creating bulk invoices:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 3. Get All Invoices (with filters)
    async getAll(req, res) {
        try {
            let { status, studentId, classId, academicYearId, billingMonth } = req.query;
            const whereClause = { isActive: true };

            if (status) whereClause.status = status;
            if (studentId) whereClause.studentId = studentId;
            if (academicYearId) whereClause.academicYearId = academicYearId;
            if (billingMonth) {
                whereClause.billingMonth = billingMonth.substring(0, 7);
            }

            // Include Student info and SchoolClass if filter by classId
            const studentInclude = {
                model: student,
                as: 'student',
                include: [
                    { model: schoolClass, as: 'schoolClass' },
                    { model: schoolRoom, as: 'schoolRoom' }
                ]
            };

            if (classId) {
                studentInclude.where = { classId };
            }

            const list = await schoolInvoice.findAll({
                where: whereClause,
                include: [
                    studentInclude,
                    { model: academicYear, as: 'academicYear' },
                    { model: schoolInvoiceLine, as: 'lines', include: [{ model: feeItem, as: 'feeItem' }] }
                ],
                order: [['createdAt', 'DESC']]
            });

            return res.status(200).json(list);
        } catch (error) {
            logger.error("Error fetching school invoices:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 4. Get Single Invoice details
    async getOne(req, res) {
        try {
            const invoice = await schoolInvoice.findByPk(req.params.id, {
                include: [
                    {
                        model: student,
                        as: 'student',
                        include: [
                            { model: schoolClass, as: 'schoolClass' },
                            { model: schoolRoom, as: 'schoolRoom' }
                        ]
                    },
                    { model: academicYear, as: 'academicYear' },
                    { model: schoolInvoiceLine, as: 'lines', include: [{ model: feeItem, as: 'feeItem' }] }
                ]
            });

            if (!invoice) {
                return res.status(404).json({ message: "Invoice not found" });
            }

            return res.status(200).json(invoice);
        } catch (error) {
            logger.error("Error fetching school invoice details:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
