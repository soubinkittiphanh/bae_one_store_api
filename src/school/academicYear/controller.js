const { academicYear } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    async create(req, res) {
        try {
            const { name, startDate, endDate } = req.body;
            if (!name) {
                return res.status(400).json({ message: "Name is required" });
            }

            const newYear = await academicYear.create({
                name,
                startDate,
                endDate
            });

            logger.info(`Created Academic Year: ${name}`);
            return res.status(201).json(newYear);
        } catch (error) {
            logger.error("Error creating academic year:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async getAll(req, res) {
        try {
            const list = await academicYear.findAll({
                order: [['createdAt', 'DESC']]
            });
            return res.status(200).json(list);
        } catch (error) {
            logger.error("Error fetching academic years:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async update(req, res) {
        try {
            const { name, startDate, endDate, isActive } = req.body;
            const updated = await academicYear.update(
                { name, startDate, endDate, isActive },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Academic Year not found" });
            }

            return res.status(200).json({ message: "Academic Year updated successfully" });
        } catch (error) {
            logger.error("Error updating academic year:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async delete(req, res) {
        try {
            const updated = await academicYear.update(
                { isActive: false },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Academic Year not found" });
            }

            return res.status(200).json({ message: "Academic Year deactivated successfully" });
        } catch (error) {
            logger.error("Error deleting academic year:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
