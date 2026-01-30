const logger = require("../api/logger");
const { Size } = require('../models');

class SizeController {
    // Get all sizes
    static async getAllSizes(req, res) {
        try {
            logger.info('Getting all sizes');
            
            const sizes = await Size.scope('active').findAll({
                attributes: ['id', 'size_name', 'size_code', 'size_order', 'description', 'isActive'],
                order: [['size_order', 'ASC']]
            });

            return res.status(200).json({
                success: true,
                data: sizes,
                message: 'Sizes retrieved successfully'
            });
        } catch (error) {
            logger.error('Error getting sizes:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Get size by ID
    static async getSizeById(req, res) {
        try {
            const { id } = req.params;
            logger.info(`Getting size by ID: ${id}`);

            const size = await Size.findOne({
                where: { id, isActive: true },
                attributes: ['id', 'size_name', 'size_code', 'size_order', 'description', 'isActive']
            });

            if (!size) {
                return res.status(404).json({
                    success: false,
                    message: 'Size not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: size,
                message: 'Size retrieved successfully'
            });
        } catch (error) {
            logger.error('Error getting size by ID:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Create new size
    static async createSize(req, res) {
        try {
            const { size_name, size_code, size_order, description } = req.body;
            const inputter = req.user?.id || 1; // Assuming user ID is in req.user

            logger.info('Creating new size:', { size_name, size_code });

            // Validate required fields
            if (!size_name || !size_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Size name and size code are required'
                });
            }

            const newSize = await Size.create({
                size_name,
                size_code,
                size_order: size_order || 0,
                description,
                inputter,
                isActive: true
            });

            return res.status(201).json({
                success: true,
                data: newSize,
                message: 'Size created successfully'
            });
        } catch (error) {
            logger.error('Error creating size:', error);
            
            // Handle unique constraint errors
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({
                    success: false,
                    message: 'Size name or code already exists'
                });
            }

            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Update size
    static async updateSize(req, res) {
        try {
            const { id } = req.params;
            const { size_name, size_code, size_order, description } = req.body;
            const update_user = req.user?.id || 1;

            logger.info(`Updating size ID: ${id}`);

            const size = await Size.findOne({
                where: { id, isActive: true }
            });

            if (!size) {
                return res.status(404).json({
                    success: false,
                    message: 'Size not found'
                });
            }

            await size.update({
                size_name: size_name || size.size_name,
                size_code: size_code || size.size_code,
                size_order: size_order !== undefined ? size_order : size.size_order,
                description: description !== undefined ? description : size.description,
                update_user
            });

            return res.status(200).json({
                success: true,
                data: size,
                message: 'Size updated successfully'
            });
        } catch (error) {
            logger.error('Error updating size:', error);
            
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({
                    success: false,
                    message: 'Size name or code already exists'
                });
            }

            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // Delete size (soft delete)
    static async deleteSize(req, res) {
        try {
            const { id } = req.params;
            const update_user = req.user?.id || 1;

            logger.info(`Deleting size ID: ${id}`);

            const size = await Size.findOne({
                where: { id, isActive: true }
            });

            if (!size) {
                return res.status(404).json({
                    success: false,
                    message: 'Size not found'
                });
            }

            await size.update({
                isActive: false,
                update_user
            });

            return res.status(200).json({
                success: true,
                message: 'Size deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting size:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = SizeController;