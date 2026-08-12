const { feeStructure, feeItem, schoolClass, academicYear } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    async create(req, res) {
        try {
            const { feeItemId, classId, academicYearId, amount } = req.body;
            if (!feeItemId || !academicYearId || amount === undefined) {
                return res.status(400).json({ message: "feeItemId, academicYearId, and amount are required" });
            }

            const structure = await feeStructure.create({
                feeItemId,
                classId: classId || null, // null means global
                academicYearId,
                amount
            });

            logger.info(`Created Fee Structure for item: ${feeItemId}, amount: ${amount}`);
            return res.status(201).json(structure);
        } catch (error) {
            logger.error("Error creating fee structure:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async getAll(req, res) {
        try {
            const list = await feeStructure.findAll({
                include: [
                    { model: feeItem, as: 'feeItem' },
                    { model: schoolClass, as: 'schoolClass' },
                    { model: academicYear, as: 'academicYear' }
                ],
                order: [['createdAt', 'DESC']]
            });
            return res.status(200).json(list);
        } catch (error) {
            logger.error("Error fetching fee structures:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async update(req, res) {
        try {
            const { feeItemId, classId, academicYearId, amount, isActive } = req.body;
            const updated = await feeStructure.update(
                { feeItemId, classId: classId || null, academicYearId, amount, isActive },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Fee Structure not found" });
            }

            return res.status(200).json({ message: "Fee Structure updated successfully" });
        } catch (error) {
            logger.error("Error updating fee structure:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async delete(req, res) {
        try {
            const updated = await feeStructure.update(
                { isActive: false },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Fee Structure not found" });
            }

            return res.status(200).json({ message: "Fee Structure deactivated successfully" });
        } catch (error) {
            logger.error("Error deleting fee structure:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
