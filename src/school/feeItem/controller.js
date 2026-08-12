const { feeItem } = require("../../models");
const logger = require("../../api/logger");

module.exports = {
    async create(req, res) {
        try {
            const { name, description } = req.body;
            if (!name) {
                return res.status(400).json({ message: "Name is required" });
            }

            const item = await feeItem.create({
                name,
                description
            });

            logger.info(`Created Fee Item: ${name}`);
            return res.status(201).json(item);
        } catch (error) {
            logger.error("Error creating fee item:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async getAll(req, res) {
        try {
            const list = await feeItem.findAll({
                order: [['createdAt', 'DESC']]
            });
            return res.status(200).json(list);
        } catch (error) {
            logger.error("Error fetching fee items:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async update(req, res) {
        try {
            const { name, description, isActive } = req.body;
            const updated = await feeItem.update(
                { name, description, isActive },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Fee Item not found" });
            }

            return res.status(200).json({ message: "Fee Item updated successfully" });
        } catch (error) {
            logger.error("Error updating fee item:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    },

    async delete(req, res) {
        try {
            const updated = await feeItem.update(
                { isActive: false },
                { where: { id: req.params.id } }
            );

            if (updated[0] === 0) {
                return res.status(404).json({ message: "Fee Item not found" });
            }

            return res.status(200).json({ message: "Fee Item deactivated successfully" });
        } catch (error) {
            logger.error("Error deleting fee item:", error);
            return res.status(500).json({ message: "Internal Server Error", error: error.message });
        }
    }
};
