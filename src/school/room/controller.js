const { schoolRoom, schoolClass } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    async create(req, res) {
        try {
            const { name, classId } = req.body;
            if (!name || !classId) {
                return res.status(400).json({ message: "Name and classId are required" });
            }

            const newRoom = await schoolRoom.create({
                name,
                classId
            });

            logger.info(`Created Room: ${name} for Class: ${classId}`);
            return res.status(201).json(newRoom);
        } catch (error) {
            logger.error("Error creating school room:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async getAll(req, res) {
        try {
            const { classId } = req.query;
            const whereClause = { isActive: true };
            if (classId) {
                whereClause.classId = classId;
            }

            const list = await schoolRoom.findAll({
                where: whereClause,
                include: [{
                    model: schoolClass,
                    as: 'schoolClass'
                }],
                order: [['createdAt', 'DESC']]
            });
            return res.status(200).json(list);
        } catch (error) {
            logger.error("Error fetching school rooms:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async update(req, res) {
        try {
            const { name, classId, isActive } = req.body;
            const updated = await schoolRoom.update(
                { name, classId, isActive },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "School Room not found" });
            }

            return res.status(200).json({ message: "School Room updated successfully" });
        } catch (error) {
            logger.error("Error updating school room:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async delete(req, res) {
        try {
            const updated = await schoolRoom.update(
                { isActive: false },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "School Room not found" });
            }

            return res.status(200).json({ message: "School Room deactivated successfully" });
        } catch (error) {
            logger.error("Error deleting school room:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
