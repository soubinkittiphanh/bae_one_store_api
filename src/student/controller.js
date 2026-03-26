const { student, bankAccount, nfcCard, sequelize } = require("../models");
const logger = require("../api/logger");


module.exports = {
    // 1. Create Student + Automatic Wallet Creation
    async create(req, res) {
        const t = await sequelize.transaction();
        try {
            const { studentId, firstName, lastName, grade, phoneNumber } = req.body;

            // Create the student profile
            const newStudent = await student.create({
                studentId,
                firstName,
                lastName,
                grade,
                phoneNumber
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
                    { model: nfcCard, as: 'nfcCards', where: { isActive: true }, required: false }
                ]
            });
            return res.status(200).json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },
    // 4. Get all students with their wallet and active cards
    async getAll(req, res) {
        try {
            const students = await student.findAll({
                include: [
                    { model: bankAccount, as: 'bankAccount' },
                    { model: nfcCard, as: 'nfcCards', where: { isActive: true }, required: false }
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
        try {
            const { firstName, lastName, grade, phoneNumber } = req.body;
            const updated = await student.update(
                { firstName, lastName, grade, phoneNumber },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Student not found" });
            }

            return res.status(200).json({ message: "Student updated successfully" });
        } catch (error) {
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
    }
};