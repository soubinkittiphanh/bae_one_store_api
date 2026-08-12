const { schoolClass, academicYear } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    async create(req, res) {
        try {
            const { name, academicYearId } = req.body;
            if (!name || !academicYearId) {
                return res.status(400).json({ message: "Name and academicYearId are required" });
            }

            const newClass = await schoolClass.create({
                name,
                academicYearId
            });

            logger.info(`Created Class: ${name}`);
            return res.status(201).json(newClass);
        } catch (error) {
            logger.error("Error creating school class:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async getAll(req, res) {
        try {
            const list = await schoolClass.findAll({
                include: [{
                    model: academicYear,
                    as: 'academicYear'
                }],
                order: [['createdAt', 'DESC']]
            });
            return res.status(200).json(list);
        } catch (error) {
            logger.error("Error fetching school classes:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async update(req, res) {
        try {
            const { name, academicYearId, isActive } = req.body;
            const updated = await schoolClass.update(
                { name, academicYearId, isActive },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "School Class not found" });
            }

            return res.status(200).json({ message: "School Class updated successfully" });
        } catch (error) {
            logger.error("Error updating school class:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async delete(req, res) {
        try {
            const updated = await schoolClass.update(
                { isActive: false },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "School Class not found" });
            }

            return res.status(200).json({ message: "School Class deactivated successfully" });
        } catch (error) {
            logger.error("Error deleting school class:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
