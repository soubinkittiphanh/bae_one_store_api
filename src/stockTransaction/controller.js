// Comprehensive Stock Transaction Controller - All Logic Properly Organized
const StockTransactionModel = require('../models').stockTransactionModel;
const ProductModel = require('../models').product;
const UnitModel = require('../models').unit;
const StockTransactionService = require('./service');
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');

// Validation rules for stock transactions
const validateStockTransaction = [
    body('productId').isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
    body('transactionType').isIn(['purchase', 'sale', 'adjustment', 'recipe_deduction', 'return', 'transfer']).withMessage('Invalid transaction type'),
    body('transactionQuantity').isFloat({ min: 0.0001 }).withMessage('Transaction quantity must be greater than 0'),
    body('transactionUnitId').isInt({ min: 1 }).withMessage('Transaction unit ID must be a positive integer'),
    body('transactionRate').optional().isFloat({ min: 0.0001 }).withMessage('Transaction rate must be greater than 0'),
    body('baseQuantityChange').isFloat().withMessage('Base quantity change must be a valid number'),
    body('baseUnitId').isInt({ min: 1 }).withMessage('Base unit ID must be a positive integer'),
    body('baseQuantityBefore').isFloat({ min: 0 }).withMessage('Base quantity before must be non-negative'),
    body('baseQuantityAfter').isFloat({ min: 0 }).withMessage('Base quantity after must be non-negative'),
    body('unitCost').optional().isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
    body('totalCost').optional().isFloat({ min: 0 }).withMessage('Total cost must be non-negative'),
    body('referenceType').optional().isIn(['ticket', 'purchase_order', 'adjustment', 'manual', 'transfer']).withMessage('Invalid reference type'),
    body('referenceId').optional().isInt({ min: 1 }).withMessage('Reference ID must be a positive integer'),
    body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters')
];

// ===========================================
// CORE CRUD OPERATIONS
// ===========================================

// Create stock transaction
exports.createStockTransaction = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.error('Validation failed for stock transaction creation', errors.array());
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }

    try {
        const result = await StockTransactionService.createStockTransaction(req.body, req.user?.id);
        res.status(201).json({
            success: true,
            message: 'Stock transaction created successfully',
            data: result
        });
    } catch (error) {
        logger.error('Error creating stock transaction:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating stock transaction'
        });
    }
};

// Get all stock transactions with filtering
exports.getStockTransactions = async (req, res) => {
    try {
        const result = await StockTransactionService.getStockTransactions(req.query);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error fetching stock transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stock transactions'
        });
    }
};

// Get stock transactions by product
exports.getStockTransactionsByProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const result = await StockTransactionService.getStockTransactionsByProduct(productId, req.query);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error fetching stock transactions by product:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stock transactions by product'
        });
    }
};

// Get stock transaction by ID
exports.getStockTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await StockTransactionService.getStockTransactionById(id);
        
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Stock transaction not found'
            });
        }

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error fetching stock transaction by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stock transaction'
        });
    }
};

// Get stock summary by product
exports.getStockSummary = async (req, res) => {
    try {
        const { productId } = req.params;
        const result = await StockTransactionService.getStockSummary(productId, req.query);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error fetching stock summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stock summary'
        });
    }
};

// Bulk create stock transactions
exports.bulkCreateStockTransactions = async (req, res) => {
    try {
        const result = await StockTransactionService.bulkCreateStockTransactions(req.body.transactions, req.user?.id);
        res.status(200).json({
            success: true,
            message: 'Bulk stock transaction creation completed',
            data: result
        });
    } catch (error) {
        logger.error('Error in bulk stock transaction creation:', error);
        res.status(500).json({
            success: false,
            message: 'Error in bulk stock transaction creation'
        });
    }
};

// Delete stock transaction
exports.deleteStockTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        await StockTransactionService.deleteStockTransaction(id);
        res.status(200).json({
            success: true,
            message: 'Stock transaction deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting stock transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting stock transaction'
        });
    }
};

// ===========================================
// STOCK MANAGEMENT OPERATIONS
// ===========================================

// Stock increase endpoint (for stock management UI)
exports.createStockIncrease = async (req, res) => {
    try {
        const result = await StockTransactionService.createStockIncrease(req.body, req.user?.id);
        res.status(201).json({
            success: true,
            message: 'Stock increased successfully',
            data: result
        });
    } catch (error) {
        logger.error('Error increasing stock:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error increasing stock'
        });
    }
};

// Stock adjustment endpoint (for stock management UI)
exports.createStockAdjustment = async (req, res) => {
    try {
        const result = await StockTransactionService.createStockAdjustment(req.body, req.user?.id);
        res.status(201).json({
            success: true,
            message: 'Stock adjusted successfully',
            data: result
        });
    } catch (error) {
        logger.error('Error adjusting stock:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error adjusting stock'
        });
    }
};

// Bulk stock increase endpoint
exports.bulkStockIncrease = async (req, res) => {
    try {
        const { items, supplier, referenceNumber } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Items array is required and cannot be empty'
            });
        }

        const result = await StockTransactionService.createBulkStockIncrease({
            items,
            supplier,
            referenceNumber,
            createdBy: req.user?.id
        });

        res.status(200).json({
            success: result.summary.totalFailed === 0,
            message: 'Bulk stock increase completed',
            data: {
                createdCount: result.summary.totalSuccess,
                failedCount: result.summary.totalFailed,
                totalCost: result.summary.totalCost,
                results: result.successful,
                errors: result.failed
            }
        });
    } catch (error) {
        logger.error('Error in bulk stock increase:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error in bulk stock increase'
        });
    }
};

// ===========================================
// ANALYTICS & REPORTING
// ===========================================

// Get stock statistics for dashboard
exports.getStockStatistics = async (req, res) => {
    try {
        const result = await StockTransactionService.getStockStatistics(req.query);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error fetching stock statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stock statistics'
        });
    }
};

// Enhanced product stock history
exports.getProductStockHistory = async (req, res) => {
    try {
        const { productId } = req.params;
        const result = await StockTransactionService.getProductStockHistory(productId, req.query);
        
        // Format for UI expectations
        const formattedTransactions = result.transactions.map(transaction => ({
            id: transaction.id,
            transactionType: transaction.transactionType,
            baseQuantityChange: transaction.baseQuantityChange,
            baseQuantityAfter: transaction.baseQuantityAfter,
            baseQuantityBefore: transaction.baseQuantityBefore,
            transactionQuantity: transaction.transactionQuantity,
            transactionUnit: transaction.transactionUnit,
            totalCost: transaction.totalCost,
            unitCost: transaction.unitCost,
            referenceType: transaction.referenceType,
            referenceId: transaction.referenceId,
            notes: transaction.notes,
            createdAt: transaction.createdAt,
            createdBy: transaction.createdBy
        }));

        res.status(200).json({
            success: true,
            data: formattedTransactions,
            pagination: result.pagination
        });
    } catch (error) {
        logger.error('Error fetching stock history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stock history'
        });
    }
};

// Export stock transactions
exports.exportStockTransactions = async (req, res) => {
    try {
        const result = await StockTransactionService.exportStockTransactions(req.query);
        res.status(200).json({
            success: true,
            data: result.data,
            summary: result.summary
        });
    } catch (error) {
        logger.error('Error exporting stock report:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting stock report'
        });
    }
};

// ===========================================
// UTILITY ENDPOINTS
// ===========================================

// Get recent suppliers for autocomplete
exports.getRecentSuppliers = async (req, res) => {
    try {
        const result = await StockTransactionService.getRecentSuppliers(req.query);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error fetching recent suppliers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recent suppliers'
        });
    }
};

// Export validation middleware
exports.validateStockTransaction = validateStockTransaction;

module.exports = exports;