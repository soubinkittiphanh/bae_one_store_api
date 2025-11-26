// Comprehensive Stock Transaction Service - All Business Logic
const StockTransactionModel = require('../models').stockTransactionModel;
const ProductModel = require('../models').product;
const UnitModel = require('../models').unit;
const { Op } = require('sequelize');
const logger = require('../api/logger');

class StockTransactionService {
    
    // ===========================================
    // CORE TRANSACTION OPERATIONS
    // ===========================================

    // Create a basic stock transaction
    static async createStockTransaction(data, createdBy) {
        const transaction = await StockTransactionModel.sequelize.transaction();

        try {
            const {
                productId,
                transactionType,
                transactionQuantity,
                transactionUnitId,
                transactionRate = 1.0000,
                baseQuantityChange,
                baseUnitId,
                baseQuantityBefore,
                baseQuantityAfter,
                unitCost,
                totalCost,
                referenceType,
                referenceId,
                notes
            } = data;

            // Get product WITHOUT Unit associations to avoid conflicts
            const product = await ProductModel.findByPk(productId, { 
                attributes: ['id', 'pro_name', 'stock_count', 'stockUnitId', 'baseUnitId'],
                transaction 
            });

            if (!product) {
                throw new Error('Product not found');
            }

            // Create stock transaction
            const stockTransaction = await StockTransactionModel.create({
                productId,
                transactionType,
                transactionQuantity: parseFloat(transactionQuantity),
                transactionUnitId,
                transactionRate: parseFloat(transactionRate),
                baseQuantityChange: parseFloat(baseQuantityChange),
                baseUnitId,
                baseQuantityBefore: parseFloat(baseQuantityBefore),
                baseQuantityAfter: parseFloat(baseQuantityAfter),
                unitCost: unitCost ? parseFloat(unitCost) : null,
                totalCost: totalCost ? parseFloat(totalCost) : null,
                referenceType,
                referenceId,
                notes: notes ? notes.trim() : null,
                createdBy
            }, { transaction });

            // Update product stock count
            await product.update({
                stock_count: parseFloat(baseQuantityAfter),
                updateTimestamp: new Date()
            }, { transaction });

            await transaction.commit();

            return {
                id: stockTransaction.id,
                transactionType: stockTransaction.transactionType,
                newStock: parseFloat(baseQuantityAfter)
            };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    // Get all stock transactions with filtering
    static async getStockTransactions(options) {
        const {
            productId,
            transactionType,
            referenceType,
            referenceId,
            startDate,
            endDate,
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = options;

        // Build where clause
        const where = {};
        if (productId) where.productId = productId;
        if (transactionType) where.transactionType = transactionType;
        if (referenceType) where.referenceType = referenceType;
        if (referenceId) where.referenceId = referenceId;

        // Date filtering
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt[Op.gte] = new Date(startDate);
            if (endDate) where.createdAt[Op.lte] = new Date(endDate);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows: transactions } = await StockTransactionModel.findAndCountAll({
            where,
            include: [
                {
                    model: ProductModel,
                    as: 'product',
                    attributes: ['id', 'pro_name', 'stock_count', 'pro_price', 'cost_price', '_category']
                }
                // Removed Unit associations to avoid conflicts
            ],
            limit: parseInt(limit),
            offset,
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        return {
            transactions,
            pagination: {
                totalItems: count,
                totalPages: Math.ceil(count / parseInt(limit)),
                currentPage: parseInt(page),
                itemsPerPage: parseInt(limit)
            }
        };
    }

    // Get stock transactions by product
    static async getStockTransactionsByProduct(productId, options) {
        const {
            transactionType,
            startDate,
            endDate,
            limit = 100
        } = options;

        // Build where clause
        const where = { productId };
        if (transactionType) where.transactionType = transactionType;

        // Date filtering
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt[Op.gte] = new Date(startDate);
            if (endDate) where.createdAt[Op.lte] = new Date(endDate);
        }

        const transactions = await StockTransactionModel.findAll({
            where,
            include: [
                {
                    model: ProductModel,
                    as: 'product',
                    attributes: ['id', 'pro_name', 'stock_count', 'pro_price', 'cost_price']
                }
            ],
            limit: parseInt(limit),
            order: [['createdAt', 'DESC']]
        });

        return transactions;
    }

    // Get stock transaction by ID
    static async getStockTransactionById(id) {
        return await StockTransactionModel.findByPk(id, {
            include: [
                {
                    model: ProductModel,
                    as: 'product',
                    attributes: ['id', 'pro_name', 'stock_count', 'pro_price', 'cost_price']
                }
            ]
        });
    }

    // Get stock summary by product
    static async getStockSummary(productId, options) {
        const { startDate, endDate } = options;

        // Build where clause
        const where = { productId };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt[Op.gte] = new Date(startDate);
            if (endDate) where.createdAt[Op.lte] = new Date(endDate);
        }

        // Get summary statistics
        const summary = await StockTransactionModel.findAll({
            where,
            attributes: [
                'transactionType',
                [StockTransactionModel.sequelize.fn('COUNT', StockTransactionModel.sequelize.col('id')), 'transactionCount'],
                [StockTransactionModel.sequelize.fn('SUM', StockTransactionModel.sequelize.col('base_quantity_change')), 'totalQuantityChange'],
                [StockTransactionModel.sequelize.fn('SUM', StockTransactionModel.sequelize.col('total_cost')), 'totalCost']
            ],
            group: ['transactionType']
        });

        // Get current stock level
        const product = await ProductModel.findByPk(productId, {
            attributes: ['id', 'pro_name', 'stock_count', 'minStock', 'pro_price', 'cost_price', '_category']
        });

        return {
            product,
            summary,
            currentStock: product?.stock_count || 0
        };
    }

    // Bulk create stock transactions
    static async bulkCreateStockTransactions(transactions, createdBy) {
        if (!Array.isArray(transactions) || transactions.length === 0) {
            throw new Error('Transactions array is required and cannot be empty');
        }

        const sequelizeTransaction = await StockTransactionModel.sequelize.transaction();
        const results = {
            created: [],
            errors: []
        };

        try {
            for (let i = 0; i < transactions.length; i++) {
                const txData = transactions[i];
                
                try {
                    // Validate required fields
                    if (!txData.productId || !txData.transactionType || !txData.transactionQuantity) {
                        results.errors.push({
                            index: i,
                            data: txData,
                            error: 'Missing required fields: productId, transactionType, transactionQuantity'
                        });
                        continue;
                    }

                    const stockTransaction = await StockTransactionModel.create({
                        ...txData,
                        createdBy
                    }, { transaction: sequelizeTransaction });

                    // Update product stock if baseQuantityAfter is provided
                    if (txData.baseQuantityAfter !== undefined) {
                        await ProductModel.update({
                            stock_count: parseFloat(txData.baseQuantityAfter),
                            updateTimestamp: new Date()
                        }, {
                            where: { id: txData.productId },
                            transaction: sequelizeTransaction
                        });
                    }

                    results.created.push({
                        index: i,
                        data: stockTransaction
                    });

                } catch (error) {
                    results.errors.push({
                        index: i,
                        data: txData,
                        error: error.message
                    });
                }
            }

            await sequelizeTransaction.commit();

            return {
                totalProcessed: transactions.length,
                totalCreated: results.created.length,
                totalErrors: results.errors.length,
                results
            };

        } catch (error) {
            await sequelizeTransaction.rollback();
            throw error;
        }
    }

    // Delete stock transaction
    static async deleteStockTransaction(id) {
        const stockTransaction = await StockTransactionModel.findByPk(id);
        if (!stockTransaction) {
            throw new Error('Stock transaction not found');
        }

        await stockTransaction.destroy();
        return true;
    }

    // ===========================================
    // STOCK MANAGEMENT OPERATIONS
    // ===========================================

    // Create a stock increase transaction
    static async createStockIncrease(data, createdBy) {
        const dbTransaction = await StockTransactionModel.sequelize.transaction();

        try {
            const {
                productId,
                quantity,
                unitId,
                costPerUnit,
                supplier,
                referenceNumber,
                notes,
                transactionUnitId,
                baseUnitId,
                transactionRate
            } = data;

            // Validate required fields
            if (!productId || !quantity || quantity <= 0) {
                throw new Error('Product ID and positive quantity are required');
            }

            // Get product WITHOUT Unit associations to avoid conflicts
            const product = await ProductModel.findByPk(productId, {
                attributes: [
                    'id', 'pro_name', 'stock_count', 'minStock', 'cost_price', 'pro_price',
                    'stockUnitId', 'baseUnitId', 'isActive'
                ],
                transaction: dbTransaction
            });

            if (!product || !product.isActive) {
                throw new Error('Product not found or inactive');
            }

            // Calculate stock changes
            const transactionUnitId_final = unitId || transactionUnitId || product.stockUnitId || product.baseUnitId || 1;
            const baseUnitId_final = baseUnitId || product.baseUnitId || product.stockUnitId || 1;
            const conversionRate = transactionRate || 1.0000;
            
            const transactionQuantity = parseFloat(quantity);
            const baseQuantityChange = transactionQuantity * conversionRate;
            const currentStock = parseFloat(product.stock_count || 0);
            const newStock = currentStock + baseQuantityChange;

            // Create stock transaction
            const stockTransaction = await StockTransactionModel.create({
                productId,
                transactionType: 'purchase',
                transactionQuantity,
                transactionUnitId: transactionUnitId_final,
                transactionRate: conversionRate,
                baseQuantityChange,
                baseUnitId: baseUnitId_final,
                baseQuantityBefore: currentStock,
                baseQuantityAfter: newStock,
                unitCost: costPerUnit ? parseFloat(costPerUnit) : null,
                totalCost: costPerUnit ? parseFloat(costPerUnit) * transactionQuantity : null,
                referenceType: referenceNumber ? 'manual' : 'adjustment',
                referenceId: null,
                notes: this.buildStockIncreaseNotes(supplier, referenceNumber, notes),
                createdBy
            }, { transaction: dbTransaction });

            // Update product stock and cost price with weighted average
            const updateData = {
                stock_count: newStock,
                updateTimestamp: new Date()
            };

            if (costPerUnit) {
                const newCostPerBaseUnit = conversionRate > 0 ? parseFloat(costPerUnit) / conversionRate : parseFloat(costPerUnit);
                const currentValue = currentStock * (product.cost_price || 0);
                const additionalValue = baseQuantityChange * newCostPerBaseUnit;
                const newTotalValue = currentValue + additionalValue;
                
                if (newStock > 0) {
                    updateData.cost_price = newTotalValue / newStock;
                } else {
                    updateData.cost_price = newCostPerBaseUnit;
                }
            }

            await product.update(updateData, { transaction: dbTransaction });
            await dbTransaction.commit();

            return {
                transactionId: stockTransaction.id,
                newStock,
                previousStock: currentStock,
                change: baseQuantityChange,
                transactionQuantity,
                conversionRate,
                productName: product.pro_name,
                totalCost: stockTransaction.totalCost,
                newCostPrice: updateData.cost_price
            };

        } catch (error) {
            await dbTransaction.rollback();
            throw error;
        }
    }

    // Create a stock adjustment transaction
    static async createStockAdjustment(data, createdBy) {
        const dbTransaction = await StockTransactionModel.sequelize.transaction();

        try {
            const {
                productId,
                newQuantity,
                reason,
                notes,
                baseUnitId
            } = data;

            // Validate required fields
            if (!productId || newQuantity == null || newQuantity < 0) {
                throw new Error('Product ID and non-negative new quantity are required');
            }

            if (!reason) {
                throw new Error('Adjustment reason is required');
            }

            // Get product WITHOUT Unit associations
            const product = await ProductModel.findByPk(productId, {
                attributes: [
                    'id', 'pro_name', 'stock_count', 'minStock', 
                    'stockUnitId', 'baseUnitId', 'isActive'
                ],
                transaction: dbTransaction
            });

            if (!product || !product.isActive) {
                throw new Error('Product not found or inactive');
            }

            const currentStock = parseFloat(product.stock_count || 0);
            const targetStock = parseFloat(newQuantity);
            const baseQuantityChange = targetStock - currentStock;
            const baseUnitId_final = baseUnitId || product.baseUnitId || product.stockUnitId || 1;

            // Create stock transaction
            const stockTransaction = await StockTransactionModel.create({
                productId,
                transactionType: 'adjustment',
                transactionQuantity: Math.abs(baseQuantityChange),
                transactionUnitId: baseUnitId_final,
                transactionRate: 1.0000,
                baseQuantityChange,
                baseUnitId: baseUnitId_final,
                baseQuantityBefore: currentStock,
                baseQuantityAfter: targetStock,
                unitCost: null,
                totalCost: null,
                referenceType: 'adjustment',
                referenceId: null,
                notes: `Stock adjustment - Reason: ${reason}${notes ? `. ${notes}` : ''}`,
                createdBy
            }, { transaction: dbTransaction });

            // Update product stock
            await product.update({
                stock_count: targetStock,
                updateTimestamp: new Date()
            }, { transaction: dbTransaction });

            await dbTransaction.commit();

            return {
                transactionId: stockTransaction.id,
                newStock: targetStock,
                previousStock: currentStock,
                adjustment: baseQuantityChange,
                adjustmentType: baseQuantityChange > 0 ? 'INCREASE' : 'DECREASE',
                productName: product.pro_name
            };

        } catch (error) {
            await dbTransaction.rollback();
            throw error;
        }
    }

    // Bulk stock increase
    static async createBulkStockIncrease(data) {
        const { items, supplier, referenceNumber, createdBy } = data;

        const results = {
            successful: [],
            failed: [],
            summary: {
                totalProcessed: items.length,
                totalSuccess: 0,
                totalFailed: 0,
                totalCost: 0
            }
        };

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            try {
                // Validate item
                if (!item.productId || !item.quantity || item.quantity <= 0) {
                    results.failed.push({
                        index: i,
                        productId: item.productId,
                        error: 'Missing required fields or invalid quantity'
                    });
                    results.summary.totalFailed++;
                    continue;
                }

                const result = await this.createStockIncrease({
                    productId: item.productId,
                    quantity: item.quantity,
                    costPerUnit: item.costPerUnit,
                    supplier,
                    referenceNumber,
                    notes: `Bulk increase - Item ${i + 1}`,
                    unitId: item.unitId
                }, createdBy);

                results.successful.push({
                    index: i,
                    productId: item.productId,
                    result
                });
                results.summary.totalSuccess++;
                results.summary.totalCost += (item.quantity || 0) * (item.costPerUnit || 0);

            } catch (error) {
                results.failed.push({
                    index: i,
                    productId: item.productId,
                    error: error.message
                });
                results.summary.totalFailed++;
            }
        }

        return results;
    }

    // ===========================================
    // ANALYTICS & REPORTING
    // ===========================================

    // Get stock statistics for dashboard
    static async getStockStatistics(options) {
        const { startDate, endDate } = options;

        // Get basic product counts using correct field names
        const [
            totalProducts,
            lowStockProducts,
            outOfStockProducts
        ] = await Promise.all([
            ProductModel.count({ where: { isActive: 1 } }),
            ProductModel.count({
                where: {
                    stock_count: {
                        [Op.lte]: ProductModel.sequelize.col('minStock'),
                        [Op.gt]: 0
                    },
                    isActive: 1
                }
            }),
            ProductModel.count({
                where: {
                    [Op.or]: [
                        { stock_count: 0 },
                        { stock_count: null }
                    ],
                    isActive: 1
                }
            })
        ]);

        // Get total stock value using correct field names
        const stockValue = await ProductModel.findAll({
            attributes: [
                [ProductModel.sequelize.fn('SUM', 
                    ProductModel.sequelize.literal('stock_count * COALESCE(cost_price, pro_price, 0)')
                ), 'totalValue']
            ],
            where: { isActive: 1 },
            raw: true
        });

        // Get transaction statistics if date range provided
        let transactionSummary = [];
        if (startDate || endDate) {
            const where = {};
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt[Op.gte] = new Date(startDate);
                if (endDate) where.createdAt[Op.lte] = new Date(endDate);
            }

            transactionSummary = await StockTransactionModel.findAll({
                where,
                attributes: [
                    'transactionType',
                    [StockTransactionModel.sequelize.fn('COUNT', StockTransactionModel.sequelize.col('id')), 'count'],
                    [StockTransactionModel.sequelize.fn('SUM', StockTransactionModel.sequelize.col('base_quantity_change')), 'totalQuantity'],
                    [StockTransactionModel.sequelize.fn('SUM', StockTransactionModel.sequelize.col('total_cost')), 'totalCost']
                ],
                group: ['transactionType'],
                raw: true
            });
        }

        return {
            totalProducts,
            lowStockItems: lowStockProducts,
            outOfStockItems: outOfStockProducts,
            totalStockValue: stockValue[0]?.totalValue || 0,
            transactionSummary
        };
    }

    // Get stock history for a product
    static async getProductStockHistory(productId, options) {
        const {
            page = 1,
            limit = 50,
            transactionType,
            startDate,
            endDate
        } = options;

        const where = { productId };

        // Add filters
        if (transactionType) {
            where.transactionType = transactionType;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt[Op.gte] = new Date(startDate);
            if (endDate) where.createdAt[Op.lte] = new Date(endDate);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await StockTransactionModel.findAndCountAll({
            where,
            include: [
                {
                    model: ProductModel,
                    as: 'product',
                    attributes: ['id', 'pro_name', 'pro_desc']
                }
            ],
            limit: parseInt(limit),
            offset,
            order: [['createdAt', 'DESC']]
        });

        return {
            transactions: rows,
            pagination: {
                totalItems: count,
                totalPages: Math.ceil(count / parseInt(limit)),
                currentPage: parseInt(page),
                itemsPerPage: parseInt(limit)
            }
        };
    }

    // Export stock transactions
    static async exportStockTransactions(options) {
        const {
            startDate,
            endDate,
            productIds,
            transactionType
        } = options;

        const where = {};
        
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt[Op.gte] = new Date(startDate);
            if (endDate) where.createdAt[Op.lte] = new Date(endDate);
        }

        if (productIds) {
            const ids = Array.isArray(productIds) ? productIds : productIds.split(',');
            where.productId = { [Op.in]: ids };
        }

        if (transactionType) {
            where.transactionType = transactionType;
        }

        const transactions = await StockTransactionModel.findAll({
            where,
            include: [
                {
                    model: ProductModel,
                    as: 'product',
                    attributes: ['id', 'pro_name', 'pro_desc']
                }
            ],
            limit: 1000, // Limit for export
            order: [['createdAt', 'DESC']]
        });

        // Format data for export
        const reportData = transactions.map(tx => ({
            'Date': new Date(tx.createdAt).toISOString().split('T')[0],
            'Product': tx.product?.pro_name || 'Unknown',
            'Transaction Type': tx.transactionType.toUpperCase(),
            'Quantity': tx.transactionQuantity,
            'Unit Cost': tx.unitCost || 0,
            'Total Cost': tx.totalCost || 0,
            'Stock Before': tx.baseQuantityBefore,
            'Stock After': tx.baseQuantityAfter,
            'Notes': tx.notes || ''
        }));

        return {
            data: reportData,
            summary: {
                totalTransactions: reportData.length,
                dateRange: {
                    start: startDate,
                    end: endDate
                }
            }
        };
    }

    // ===========================================
    // UTILITY METHODS
    // ===========================================

    // Get recent suppliers for autocomplete
    static async getRecentSuppliers(options) {
        const { limit = 10 } = options;

        try {
            // Extract supplier names from transaction notes
            const suppliers = await StockTransactionModel.findAll({
                attributes: [
                    [StockTransactionModel.sequelize.literal(`
                        SUBSTRING_INDEX(
                            SUBSTRING_INDEX(notes, 'Supplier: ', -1), 
                            ',', 
                            1
                        )
                    `), 'supplier']
                ],
                where: {
                    notes: { [Op.like]: '%Supplier:%' },
                    createdAt: { [Op.gte]: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
                },
                group: [StockTransactionModel.sequelize.literal('1')],
                limit: parseInt(limit),
                order: [['createdAt', 'DESC']],
                raw: true
            });

            return suppliers
                .map(s => s.supplier)
                .filter(name => name && name.length > 0 && !name.includes('Ref:'))
                .slice(0, parseInt(limit));

        } catch (error) {
            logger.error('Error fetching recent suppliers:', error);
            return [];
        }
    }

    // Helper method to build stock increase notes
    static buildStockIncreaseNotes(supplier, referenceNumber, notes) {
        let notesParts = ['Stock increase'];
        
        if (supplier) {
            notesParts.push(`Supplier: ${supplier}`);
        }
        
        if (referenceNumber) {
            notesParts.push(`Ref: ${referenceNumber}`);
        }
        
        if (notes) {
            notesParts.push(`Notes: ${notes}`);
        }
        
        return notesParts.join(' - ');
    }
}

module.exports = StockTransactionService;