const { currency: Currency, currencyAudit, user: User } = require('../models');
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const service = require('./service');
const { Op } = require('sequelize');

module.exports = {
    async findCurrencies(req, res) {
        try {
            const currencies = await Currency.findAll();
            res.status(200).json(currencies);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async findActiveCurrencies(req, res) {
        try {
            const currencies = await Currency.findAll({
                where: {
                    isActive: true
                }
            });
            res.status(200).json(currencies);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async findCurrency(req, res) {
        const { id } = req.params;
        try {
            const currency = await Currency.findByPk(id);
            if (!currency) {
                return res.status(404).json({ error: 'Currency not found' });
            }
            res.status(200).json(currency);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // New method to get the current local currency
    async findLocalCurrency(req, res) {
        try {
            const localCurrency = await Currency.findOne({
                where: {
                    isLocalCCY: true,
                    isActive: true
                }
            });

            if (!localCurrency) {
                return res.status(404).json({ error: 'No local currency found' });
            }

            res.status(200).json(localCurrency);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async createCurrency(req, res) {
        const { code, name, rate, isActive, isLocalCCY, exchangeDirection } = req.body;

        try {
            // Validate exchangeDirection
            const validDirections = ['local_to_foreign', 'foreign_to_local'];
            const direction = exchangeDirection || 'local_to_foreign';

            if (!validDirections.includes(direction)) {
                return res.status(400).json({
                    error: 'Invalid exchange direction. Must be either "local_to_foreign" or "foreign_to_local"'
                });
            }

            // Validate rate
            if (!rate || isNaN(rate) || parseFloat(rate) <= 0) {
                return res.status(400).json({
                    error: 'Rate must be a positive number'
                });
            }

            // Check if trying to set as local currency
            if (isLocalCCY === true) {
                // Check if there's already a local currency
                const existingLocalCurrency = await Currency.findOne({
                    where: {
                        isLocalCCY: true
                    }
                });

                if (existingLocalCurrency) {
                    return res.status(400).json({
                        error: `A local currency already exists: ${existingLocalCurrency.name} (${existingLocalCurrency.code}). Only one currency can be set as local currency.`,
                        existingLocalCurrency: {
                            id: existingLocalCurrency.id,
                            code: existingLocalCurrency.code,
                            name: existingLocalCurrency.name
                        }
                    });
                }
            }

            const currency = await Currency.create({
                code,
                name,
                rate: parseFloat(rate),
                isActive: isActive !== undefined ? isActive : true,
                isLocalCCY: isLocalCCY !== undefined ? isLocalCCY : false,
                exchangeDirection: direction
            }, {
                context: { userId: req.user?.id || 1, reason: 'Currency created via API' }
            });

            res.status(201).json(currency);
        } catch (error) {
            console.error('Create currency error:', error);

            // Handle Sequelize validation errors
            if (error.name === 'SequelizeValidationError') {
                return res.status(400).json({
                    error: 'Validation error',
                    details: error.errors.map(e => e.message)
                });
            }

            // Handle unique constraint errors
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({
                    error: 'Currency code already exists'
                });
            }

            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateCurrency(req, res) {
        const { id } = req.params;
        const { code, name, rate, isActive, isLocalCCY, exchangeDirection } = req.body;

        try {
            const currency = await Currency.findByPk(id);
            if (!currency) {
                return res.status(404).json({ error: 'Currency not found' });
            }

            // Validate exchangeDirection if provided
            const validDirections = ['local_to_foreign', 'foreign_to_local'];
            if (exchangeDirection && !validDirections.includes(exchangeDirection)) {
                return res.status(400).json({
                    error: 'Invalid exchange direction. Must be either "local_to_foreign" or "foreign_to_local"'
                });
            }

            // Validate rate if provided
            if (rate !== undefined && (isNaN(rate) || parseFloat(rate) <= 0)) {
                return res.status(400).json({
                    error: 'Rate must be a positive number'
                });
            }

            // Check local currency constraints
            if (isLocalCCY === true && !currency.isLocalCCY) {
                // Trying to set this currency as local, check if another one exists
                const existingLocalCurrency = await Currency.findOne({
                    where: {
                        isLocalCCY: true,
                        id: { [require('sequelize').Op.ne]: id } // Exclude current currency
                    }
                });

                if (existingLocalCurrency) {
                    return res.status(400).json({
                        error: `A local currency already exists: ${existingLocalCurrency.name} (${existingLocalCurrency.code}). Only one currency can be set as local currency.`,
                        existingLocalCurrency: {
                            id: existingLocalCurrency.id,
                            code: existingLocalCurrency.code,
                            name: existingLocalCurrency.name
                        }
                    });
                }
            }

            // Prepare update data
            const updateData = {};
            if (code !== undefined) updateData.code = code;
            if (name !== undefined) updateData.name = name;
            if (rate !== undefined) updateData.rate = parseFloat(rate);
            if (isActive !== undefined) updateData.isActive = isActive;
            if (isLocalCCY !== undefined) updateData.isLocalCCY = isLocalCCY;
            if (exchangeDirection !== undefined) updateData.exchangeDirection = exchangeDirection;

            await currency.update(updateData, {
                context: { userId: req.user?.id || 1, reason: req.body.reason || 'Currency updated via API' }
            });

            // Return updated currency
            const updatedCurrency = await Currency.findByPk(id);
            res.status(200).json(updatedCurrency);
        } catch (error) {
            console.error('Update currency error:', error);

            // Handle Sequelize validation errors
            if (error.name === 'SequelizeValidationError') {
                return res.status(400).json({
                    error: 'Validation error',
                    details: error.errors.map(e => e.message)
                });
            }

            // Handle unique constraint errors
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(400).json({
                    error: 'Currency code already exists'
                });
            }

            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async destroyCurrency(req, res) {
        const { id } = req.params;
        try {
            const currency = await Currency.findByPk(id);
            if (!currency) {
                return res.status(404).json({ error: 'Currency not found' });
            }

            // Prevent deletion of local currency
            if (currency.isLocalCCY) {
                return res.status(400).json({
                    error: 'Cannot delete the local currency. Please set another currency as local first.'
                });
            }

            await currency.destroy({
                context: { userId: req.user?.id || 1, reason: req.body.reason || 'Currency deleted via API' }
            });
            res.status(204).json({});
        } catch (error) {
            console.error('Delete currency error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async generate(req, res) {
        await service.createBulk(req, res);
    },

    // Method to switch local currency
    async switchLocalCurrency(req, res) {
        const { newLocalCurrencyId } = req.body;

        try {
            if (!newLocalCurrencyId) {
                return res.status(400).json({ error: 'New local currency ID is required' });
            }

            const newLocalCurrency = await Currency.findByPk(newLocalCurrencyId);
            if (!newLocalCurrency) {
                return res.status(404).json({ error: 'Currency not found' });
            }

            // Start transaction
            const transaction = await Currency.sequelize.transaction();

            try {
                // Remove local status from current local currency
                await Currency.update(
                    { isLocalCCY: false },
                    {
                        where: { isLocalCCY: true },
                        transaction,
                        context: { userId: req.user?.id || 1, reason: 'Switching local currency' }
                    }
                );

                // Set new local currency
                await newLocalCurrency.update(
                    { isLocalCCY: true },
                    {
                        transaction,
                        context: { userId: req.user?.id || 1, reason: 'Switching local currency' }
                    }
                );

                await transaction.commit();

                const updatedCurrency = await Currency.findByPk(newLocalCurrencyId);
                res.status(200).json({
                    message: 'Local currency switched successfully',
                    newLocalCurrency: updatedCurrency
                });

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            console.error('Switch local currency error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // New method to get currencies by direction
    async findCurrenciesByDirection(req, res) {
        const { direction } = req.params;

        try {
            const validDirections = ['local_to_foreign', 'foreign_to_local'];
            if (!validDirections.includes(direction)) {
                return res.status(400).json({
                    error: 'Invalid direction. Must be either "local_to_foreign" or "foreign_to_local"'
                });
            }

            const currencies = await Currency.findAll({
                where: {
                    exchangeDirection: direction,
                    isActive: true
                }
            });

            res.status(200).json(currencies);
        } catch (error) {
            console.error('Find currencies by direction error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Helper method to convert rates between directions
    async convertRate(req, res) {
        const { fromDirection, toDirection, rate } = req.body;

        try {
            const validDirections = ['local_to_foreign', 'foreign_to_local'];

            if (!validDirections.includes(fromDirection) || !validDirections.includes(toDirection)) {
                return res.status(400).json({
                    error: 'Invalid direction parameters'
                });
            }

            if (!rate || isNaN(rate) || parseFloat(rate) <= 0) {
                return res.status(400).json({
                    error: 'Rate must be a positive number'
                });
            }

            let convertedRate = parseFloat(rate);

            // If converting from one direction to another, invert the rate
            if (fromDirection !== toDirection) {
                convertedRate = 1 / convertedRate;
            }

            res.status(200).json({
                originalRate: parseFloat(rate),
                convertedRate: convertedRate,
                fromDirection,
                toDirection
            });
        } catch (error) {
            console.error('Convert rate error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getCurrencyAudit(req, res) {
        try {
            const { id } = req.params;
            logger.info(`Fetching audit records for currency ID: ${id}`);

            const auditRecords = await currencyAudit.findAll({
                where: { currencyId: id },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'cus_name', 'cus_email']
                    }
                ],
                order: [['auditDate', 'DESC']]
            });

            res.status(200).json({
                success: true,
                data: auditRecords
            });
        } catch (error) {
            logger.error('Error fetching currency audit:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
};