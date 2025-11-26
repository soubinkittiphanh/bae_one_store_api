// Updated Unit Controller - Matching Existing Routes
// Routes: /create, /update/:id, /find/:id (DELETE), /find (GET), /findAll (GET), /find/:id (GET)

const UnitModel = require('../models').unit;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');

// Validation rules for unit operations
const validateUnit = [
    body('name')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Name must be between 1 and 50 characters'),
    body('symbol')
        .optional()
        .trim()
        .isLength({ min: 1, max: 10 })
        .withMessage('Symbol must be between 1 and 10 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Symbol can only contain letters, numbers, underscore, and dash'),
    body('conversionRate')
        .optional()
        .isFloat({ min: 0.0001 })
        .withMessage('Conversion rate must be greater than 0'),
    body('unitType')
        .optional()
        .isIn(['base', 'derived'])
        .withMessage('Unit type must be either base or derived'),
    body('baseUnitId')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Base unit ID must be a positive integer'),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean'),
    // Keep backward compatibility with unitRate
    body('unitRate')
        .optional()
        .isFloat({ min: 0.0001 })
        .withMessage('Unit rate must be greater than 0')
];

// POST /create - Create a new unit
exports.createUnitModel = async (req, res) => {
    try {
        const {
            name,
            symbol,
            unitRate, // backward compatibility
            conversionRate,
            unitType = 'base',
            baseUnitId = null,
            isActive = true,
            description = null
        } = req.body;

        // Use unitRate if conversionRate not provided (backward compatibility)
        const finalConversionRate = conversionRate || unitRate || 1.0000;
        
        // Auto-generate symbol if not provided
        let finalSymbol = symbol;
        if (!finalSymbol && name) {
            finalSymbol = name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
        }

        // Validation: derived units must have baseUnitId
        if (unitType === 'derived' && !baseUnitId) {
            return res.status(400).json({
                success: false,
                message: 'Derived units must have a base unit reference'
            });
        }

        // Check if baseUnitId exists if provided
        if (baseUnitId) {
            const baseUnit = await UnitModel.findByPk(baseUnitId);
            if (!baseUnit) {
                return res.status(400).json({
                    success: false,
                    message: 'Referenced base unit does not exist'
                });
            }
        }

        const newUnit = await UnitModel.create({
            name: name.trim(),
            symbol: finalSymbol ? finalSymbol.trim().toLowerCase() : null,
            conversionRate: parseFloat(finalConversionRate),
            unitType,
            baseUnitId: unitType === 'base' ? null : baseUnitId,
            isActive,
            description: description ? description.trim() : null,
            // Keep unitRate for backward compatibility
            unitRate: parseFloat(finalConversionRate)
        });

        // Include base unit info in response if it's a derived unit
        let unitWithDetails = newUnit;
        if (newUnit.baseUnitId) {
            unitWithDetails = await UnitModel.findByPk(newUnit.id, {
                include: [{
                    model: UnitModel,
                    as: 'baseUnit',
                    attributes: ['id', 'name', 'symbol']
                }]
            });
        }

        res.status(201).json({
            success: true,
            message: 'Unit created successfully',
            data: unitWithDetails
        });

    } catch (error) {
        logger.error('Error creating unit:', error);
        
        // Handle unique constraint violation
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Symbol already exists. Please use a different symbol.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// GET /findAll - Get all units
exports.getUnitModels = async (req, res) => {
    try {
        const {
            unitType,
            isActive,
            includeBase = false,
            page = 1,
            limit = 100
        } = req.query;

        const where = {};
        if (unitType) where.unitType = unitType;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const include = [];
        if (includeBase === 'true') {
            include.push({
                model: UnitModel,
                as: 'baseUnit',
                attributes: ['id', 'name', 'symbol', 'conversionRate'],
                required: false
            });
        }

        const units = await UnitModel.findAll({
            where,
            include,
            order: [['unitType', 'ASC'], ['name', 'ASC']]
        });

        res.status(200).json(units);

    } catch (error) {
        logger.error('Error fetching all units:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// GET /find - Get active units only
exports.getUnitActiveModels = async (req, res) => {
    try {
        const { unitType, includeBase = false } = req.query;

        const where = { isActive: true };
        if (unitType) where.unitType = unitType;

        const include = [];
        if (includeBase === 'true') {
            include.push({
                model: UnitModel,
                as: 'baseUnit',
                attributes: ['id', 'name', 'symbol', 'conversionRate'],
                required: false
            });
        }

        const units = await UnitModel.findAll({
            where,
            include,
            order: [['unitType', 'ASC'], ['name', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: units
        });

    } catch (error) {
        logger.error('Error fetching active units:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// GET /find/:id - Get unit by ID
exports.getUnitModelById = async (req, res) => {
    const { id } = req.params;

    try {
        const unit = await UnitModel.findByPk(id, {
            include: [
                {
                    model: UnitModel,
                    as: 'baseUnit',
                    attributes: ['id', 'name', 'symbol', 'conversionRate'],
                    required: false
                },
                {
                    model: UnitModel,
                    as: 'derivedUnits',
                    attributes: ['id', 'name', 'symbol', 'conversionRate'],
                    required: false,
                    where: { isActive: true }
                }
            ]
        });

        if (!unit) {
            return res.status(404).json({
                success: false,
                message: 'Unit not found'
            });
        }

        res.status(200).json({
            success: true,
            data: unit
        });

    } catch (error) {
        logger.error('Error fetching unit by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// PUT /update/:id - Update unit
exports.updateUnitModel = async (req, res) => {
    const { id } = req.params;
    const {
        name,
        symbol,
        unitRate, // backward compatibility
        conversionRate,
        unitType,
        baseUnitId,
        isActive,
        description
    } = req.body;

    try {
        const unit = await UnitModel.findByPk(id);
        if (!unit) {
            return res.status(404).json({
                success: false,
                message: 'Unit not found'
            });
        }

        // Use unitRate if conversionRate not provided (backward compatibility)
        const finalConversionRate = conversionRate || unitRate;

        // Validation logic
        if (unitType === 'derived' && !baseUnitId) {
            return res.status(400).json({
                success: false,
                message: 'Derived units must have a base unit reference'
            });
        }

        if (unitType === 'base' && baseUnitId) {
            return res.status(400).json({
                success: false,
                message: 'Base units cannot have a base unit reference'
            });
        }

        // Check if baseUnitId exists if provided
        if (baseUnitId && baseUnitId !== unit.baseUnitId) {
            const baseUnit = await UnitModel.findByPk(baseUnitId);
            if (!baseUnit) {
                return res.status(400).json({
                    success: false,
                    message: 'Referenced base unit does not exist'
                });
            }
        }

        // Update fields
        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (symbol !== undefined) updateData.symbol = symbol.trim().toLowerCase();
        if (finalConversionRate !== undefined) {
            updateData.conversionRate = parseFloat(finalConversionRate);
            updateData.unitRate = parseFloat(finalConversionRate); // Keep sync
        }
        if (unitType !== undefined) updateData.unitType = unitType;
        if (baseUnitId !== undefined) updateData.baseUnitId = unitType === 'base' ? null : baseUnitId;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (description !== undefined) updateData.description = description ? description.trim() : null;

        await unit.update(updateData);

        // Fetch updated unit with relations
        const updatedUnit = await UnitModel.findByPk(id, {
            include: [{
                model: UnitModel,
                as: 'baseUnit',
                attributes: ['id', 'name', 'symbol'],
                required: false
            }]
        });

        res.status(200).json({
            success: true,
            message: 'Unit updated successfully',
            data: updatedUnit
        });

    } catch (error) {
        logger.error('Error updating unit:', error);

        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Symbol already exists. Please use a different symbol.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// DELETE /find/:id - Delete unit
exports.deleteUnitModel = async (req, res) => {
    const { id } = req.params;

    try {
        // Check if unit is referenced by other units
        const derivedUnits = await UnitModel.count({ where: { baseUnitId: id } });
        if (derivedUnits > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete unit. It is referenced by ${derivedUnits} derived unit(s). Consider deactivating instead.`
            });
        }

        const rowsAffected = await UnitModel.destroy({ where: { id } });

        if (rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Unit not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Unit deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting unit:', error);
        
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete unit. It is referenced by other records. Consider deactivating instead.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Export validation middleware
exports.validateUnit = validateUnit;

module.exports = exports;