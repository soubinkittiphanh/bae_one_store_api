const logger = require("../api/logger");
const { Color } = require('../models');

class ColorController {
    // Get all colors
    static async getAllColors(req, res) {
        try {
            logger.info('Getting all colors');
            
            const colors = await Color.scope('active').findAll({
                attributes: ['id', 'color_name', 'color_code', 'hex_code', 'rgb_code', 'description', 'isActive'],
                order: [['color_name', 'ASC']]
            });

            return res.status(200).json({
                success: true,
                data: colors,
                message: 'Colors retrieved successfully'
            });
        } catch (error) {
            logger.error('Error getting colors:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Get color by ID
    static async getColorById(req, res) {
        try {
            const { id } = req.params;
            logger.info(`Getting color by ID: ${id}`);

            const color = await Color.findOne({
                where: { id, isActive: true },
                attributes: ['id', 'color_name', 'color_code', 'hex_code', 'rgb_code', 'description', 'isActive']
            });

            if (!color) {
                return res.status(404).json({
                    success: false,
                    message: 'Color not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: color,
                message: 'Color retrieved successfully'
            });
        } catch (error) {
            logger.error('Error getting color by ID:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Create new color
    static async createColor(req, res) {
        try {
            const { color_name, color_code, hex_code, rgb_code, description } = req.body;
            const inputter = req.user?.id || 1; // Assuming user ID is in req.user

            logger.info('Creating new color:', { color_name, color_code });

            // Validate required fields
            if (!color_name || !color_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Color name and color code are required'
                });
            }

            const newColor = await Color.create({
                color_name,
                color_code,
                hex_code,
                rgb_code,
                description,
                inputter,
                isActive: true
            });

            return res.status(201).json({
                success: true,
                data: newColor,
                message: 'Color created successfully'
            });
        } catch (error) {
            logger.error('Error creating color:', error);
            
            // Handle unique constraint errors
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({
                    success: false,
                    message: 'Color name or code already exists'
                });
            }

            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Update color
    static async updateColor(req, res) {
        try {
            const { id } = req.params;
            const { color_name, color_code, hex_code, rgb_code, description } = req.body;
            const update_user = req.user?.id || 1;

            logger.info(`Updating color ID: ${id}`);

            const color = await Color.findOne({
                where: { id, isActive: true }
            });

            if (!color) {
                return res.status(404).json({
                    success: false,
                    message: 'Color not found'
                });
            }

            await color.update({
                color_name: color_name || color.color_name,
                color_code: color_code || color.color_code,
                hex_code: hex_code !== undefined ? hex_code : color.hex_code,
                rgb_code: rgb_code !== undefined ? rgb_code : color.rgb_code,
                description: description !== undefined ? description : color.description,
                update_user
            });

            return res.status(200).json({
                success: true,
                data: color,
                message: 'Color updated successfully'
            });
        } catch (error) {
            logger.error('Error updating color:', error);
            
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({
                    success: false,
                    message: 'Color name or code already exists'
                });
            }

            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Delete color (soft delete)
    static async deleteColor(req, res) {
        try {
            const { id } = req.params;
            const update_user = req.user?.id || 1;

            logger.info(`Deleting color ID: ${id}`);

            const color = await Color.findOne({
                where: { id, isActive: true }
            });

            if (!color) {
                return res.status(404).json({
                    success: false,
                    message: 'Color not found'
                });
            }

            await color.update({
                isActive: false,
                update_user
            });

            return res.status(200).json({
                success: true,
                message: 'Color deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting color:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = ColorController;