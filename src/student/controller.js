const { student, bankAccount, nfcCard, sequelize } = require("../models");
const logger = require("../api/logger");


module.exports = {
    // 1. Create Student + Automatic Wallet Creation
    async create(req, res) {
        const t = await sequelize.transaction();
        try {
            const { studentId, firstName, lastName, grade, phoneNumber, classId, roomId, parentName, parentPhone, parentEmail, room, photoPath, optionalFeeItemIds } = req.body;

            // Create the student profile
            const newStudent = await student.create({
                studentId,
                firstName,
                lastName,
                grade,
                phoneNumber,
                classId,
                roomId,
                parentName,
                parentPhone,
                parentEmail,
                room,
                photoPath
            }, { transaction: t });

            // Automatically create their 'Wallet' with 0 balance
            await bankAccount.create({
                studentId: newStudent.id,
                accountNumber: `WLT-${studentId}`,
                accountType: 'Saving',
                balance: 0,
                accountName: `${firstName} ${lastName} Wallet`,
                isActive: true
            }, { transaction: t });

            // Sync optional fee items
            if (optionalFeeItemIds && optionalFeeItemIds.length > 0) {
                await require("../models").studentFeeItem.bulkCreate(
                    optionalFeeItemIds.map(feeItemId => ({
                        studentId: newStudent.id,
                        feeItemId,
                        isActive: true
                    })),
                    { transaction: t }
                );
            }

            await t.commit();
            logger.info(`Created student and wallet for: ${studentId}`);
            return res.status(201).json(newStudent);
        } catch (error) {
            await t.rollback();
            logger.error("Error creating student:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    // 2. Identify Student by NFC Card UID
    // This is the endpoint your Electron app will call when a card is tapped
    async getByCardUid(req, res) {
        try {
            const { cardUid } = req.params;

            const cardInfo = await nfcCard.findOne({
                where: { cardUid, isActive: true },
                include: [{
                    model: student,
                    as: 'student',
                    include: [{ model: bankAccount, as: 'bankAccount' }]
                }]
            });

            if (!cardInfo) {
                return res.status(404).json({ message: "Card not registered or inactive" });
            }

            return res.status(200).json(cardInfo.student);
        } catch (error) {
            logger.error("Error finding student by card:", error);
            return res.status(500).json({ message: "Error identifying card" });
        }
    },

    // 3. Get Student Profile with Balance
    async getProfile(req, res) {
        try {
            const data = await student.findByPk(req.params.id, {
                include: [
                    { model: bankAccount, as: 'bankAccount' },
                    { model: nfcCard, as: 'nfcCards', where: { isActive: true }, required: false },
                    { model: require("../models").schoolClass, as: 'schoolClass' },
                    { model: require("../models").schoolRoom, as: 'schoolRoom' },
                    { model: require("../models").studentFeeItem, as: 'studentFeeItems', where: { isActive: true }, required: false }
                ]
            });
            return res.status(200).json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },
    // 4. Get all students with their wallet, active cards and class details (with filtering)
    async getAll(req, res) {
        try {
            const { search, classId } = req.query;
            const whereClause = { isActive: true };

            if (classId) {
                whereClause.classId = classId;
            }

            if (search) {
                const { Op } = require('sequelize');
                whereClause[Op.or] = [
                    { studentId: { [Op.like]: `%${search}%` } },
                    { firstName: { [Op.like]: `%${search}%` } },
                    { lastName: { [Op.like]: `%${search}%` } }
                ];
            }

            const students = await student.findAll({
                where: whereClause,
                include: [
                    { model: bankAccount, as: 'bankAccount' },
                    { model: nfcCard, as: 'nfcCards', where: { isActive: true }, required: false },
                    { model: require("../models").schoolClass, as: 'schoolClass' },
                    { model: require("../models").schoolRoom, as: 'schoolRoom' }
                ],
                order: [['createdAt', 'DESC']]
            });
            return res.status(200).json(students);
        } catch (error) {
            logger.error("Error fetching students:", error);
            return res.status(500).json({ error: error.message });
        }
    },

    // 5. Update a student profile
    async update(req, res) {
        const t = await sequelize.transaction();
        try {
            const { firstName, lastName, grade, phoneNumber, classId, roomId, parentName, parentPhone, parentEmail, room, photoPath, optionalFeeItemIds } = req.body;
            const updated = await student.update(
                { firstName, lastName, grade, phoneNumber, classId, roomId, parentName, parentPhone, parentEmail, room, photoPath },
                { where: { id: req.params.id }, transaction: t }
            );

            if (updated[0] === 0) {
                await t.rollback();
                return res.status(404).json({ message: "Student not found" });
            }

            // Sync optional fee items
            if (optionalFeeItemIds !== undefined) {
                // Delete existing ones
                await require("../models").studentFeeItem.destroy({
                    where: { studentId: req.params.id },
                    transaction: t
                });
                
                // Bulk insert new ones
                if (optionalFeeItemIds.length > 0) {
                    await require("../models").studentFeeItem.bulkCreate(
                        optionalFeeItemIds.map(feeItemId => ({
                            studentId: req.params.id,
                            feeItemId,
                            isActive: true
                        })),
                        { transaction: t }
                    );
                }
            }

            await t.commit();
            return res.status(200).json({ message: "Student updated successfully" });
        } catch (error) {
            await t.rollback();
            logger.error("Error updating student:", error);
            return res.status(500).json({ error: error.message });
        }
    },

    // 6. Delete a student (Soft delete)
    async delete(req, res) {
        try {
            const updated = await student.update(
                { isActive: false },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Student not found" });
            }

            // Also optionally deactivate wallet and cards
            await bankAccount.update({ isActive: false }, { where: { studentId: req.params.id } });
            await nfcCard.update({ isActive: false, cardStatus: 'INACTIVE' }, { where: { studentId: req.params.id } });

            return res.status(200).json({ message: "Student deactivated successfully" });
        } catch (error) {
            logger.error("Error deleting student:", error);
            return res.status(500).json({ error: error.message });
        }
    },

    // 7. Get student billing statement and history
    async getBillingStatement(req, res) {
        try {
            const studentId = req.params.id;
            const studentInfo = await student.findByPk(studentId, {
                include: [
                    { model: require("../models").schoolClass, as: 'schoolClass' },
                    {
                        model: require("../models").schoolInvoice,
                        as: 'invoices',
                        include: [
                            { model: require("../models").schoolInvoiceLine, as: 'lines', include: [{ model: require("../models").feeItem, as: 'feeItem' }] },
                            { model: require("../models").schoolPayment, as: 'payments', include: [{ model: require("../models").payment, as: 'paymentMethod' }] }
                        ]
                    }
                ]
            });

            if (!studentInfo) {
                return res.status(404).json({ message: "Student not found" });
            }

            // Calculate billing overview
            const totalInvoiced = studentInfo.invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
            const totalPaid = studentInfo.invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
            const totalOutstanding = totalInvoiced - totalPaid;

            return res.status(200).json({
                student: {
                    id: studentInfo.id,
                    studentId: studentInfo.studentId,
                    firstName: studentInfo.firstName,
                    lastName: studentInfo.lastName,
                    class: studentInfo.schoolClass ? studentInfo.schoolClass.name : 'N/A'
                },
                summary: {
                    totalInvoiced,
                    totalPaid,
                    totalOutstanding
                },
                invoices: studentInfo.invoices
            });
        } catch (error) {
            logger.error("Error fetching student billing statement:", error);
            return res.status(500).json({ error: error.message });
        }
    },

    // 8. Upload Student Photo
    async uploadPhoto(req, res) {
        try {
            if (!req.files || !req.files.images || req.files.images.length === 0) {
                return res.status(400).json({ message: "No image file uploaded" });
            }
            const file = req.files.images[0];
            const photoPath = `/uploads/images/${file.filename}`;
            return res.status(200).json({ photoPath });
        } catch (error) {
            logger.error("Error uploading student photo:", error);
            return res.status(500).json({ message: "Error uploading student photo", error: error.message });
        }
    }
};