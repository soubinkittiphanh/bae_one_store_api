const  ProductTemp  = require('../models').productTemp; // Adjust the path to your models
const { Op } = require('sequelize');

/**
 * ProductTemp Controller
 * Handles all CRUD operations for ProductTemp model
 */
class ProductTempController {

    /**
     * Create a new product template
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async createProductTemp(req, res) {
        try {
            const {
                pro_name,
                pro_price,
                pro_desc,
                cost_price,
                barCode,
                isActive
            } = req.body;

            // Validation
            if (!pro_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Product name is required'
                });
            }

            // Check if barcode already exists (if provided)
            if (barCode) {
                const existingProduct = await ProductTemp.findOne({
                    where: { barCode: barCode }
                });

                if (existingProduct) {
                    return res.status(409).json({
                        success: false,
                        message: 'Product with this barcode already exists'
                    });
                }
            }

            const newProductTemp = await ProductTemp.create({
                pro_name,
                pro_price: pro_price || 0,
                pro_desc,
                cost_price: cost_price || 0,
                barCode,
                isActive: isActive !== undefined ? isActive : true
            });

            return res.status(201).json({
                success: true,
                message: 'Product template created successfully',
                data: newProductTemp
            });

        } catch (error) {
            console.error('Error creating product template:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get all product templates with filtering (no pagination)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getAllProductTemps(req, res) {
        try {
            const {
                search,
                isActive = 'true',
                // sortBy = 'pro_name',
                sortBy = 'createdAt',
                sortOrder = 'ASC'
            } = req.query;

            // Build where clause for filtering
            const whereClause = {};

            if (search) {
                whereClause[Op.or] = [
                    { pro_name: { [Op.iLike]: `%${search}%` } },
                    { pro_desc: { [Op.iLike]: `%${search}%` } },
                    { barCode: { [Op.iLike]: `%${search}%` } }
                ];
            }

            if (isActive !== undefined) {
                whereClause.isActive = isActive === 'true';
            }

            const products = await ProductTemp.findAll({
                where: whereClause,
                order: [[sortBy, sortOrder.toUpperCase()]],
                attributes: [
                    'id', 
                    'pro_name', 
                    'pro_price', 
                    'pro_desc', 
                    'location', 
                    'cost_price', 
                    'barCode', 
                    'isActive',
                    'createdAt',
                    'updateTimestamp'
                ]
            });

            return res.status(200).json({
                success: true,
                message: 'Product templates retrieved successfully',
                data: products,
                totalItems: products.length
            });

        } catch (error) {
            console.error('Error fetching product templates:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Bulk update prices for products with changes (no selection required)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async bulkUpdatePrices(req, res) {
        const transaction = await ProductTemp.sequelize.transaction();
        
        try {
            const { updates } = req.body;
            
            if (!Array.isArray(updates) || updates.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Updates array is required and cannot be empty'
                });
            }

            const results = [];

            for (const update of updates) {
                if (!update.id) {
                    results.push({
                        id: update.id,
                        success: false,
                        message: 'Product ID is required'
                    });
                    continue;
                }

                const updateData = {};
                
                // Validate and set cost_price
                if (update.cost_price !== undefined && update.cost_price !== null && update.cost_price !== '') {
                    const costPrice = parseFloat(update.cost_price);
                    if (isNaN(costPrice) || costPrice < 0) {
                        results.push({
                            id: update.id,
                            success: false,
                            message: 'Invalid cost_price value'
                        });
                        continue;
                    }
                    updateData.cost_price = costPrice;
                }
                
                // Validate and set sale_price (pro_price in your model)
                if (update.sale_price !== undefined && update.sale_price !== null && update.sale_price !== '') {
                    const salePrice = parseFloat(update.sale_price);
                    if (isNaN(salePrice) || salePrice < 0) {
                        results.push({
                            id: update.id,
                            success: false,
                            message: 'Invalid sale_price value'
                        });
                        continue;
                    }
                    updateData.pro_price = salePrice;
                }

                // Only process if there are actual changes
                if (Object.keys(updateData).length > 0) {
                    try {
                        const [updatedRows] = await ProductTemp.update(
                            updateData,
                            {
                                where: { id: update.id, isActive: true },
                                transaction
                            }
                        );

                        if (updatedRows > 0) {
                            const updatedProduct = await ProductTemp.findByPk(update.id, {
                                transaction,
                                attributes: ['id', 'pro_name', 'cost_price', 'pro_price', 'barCode']
                            });

                            results.push({
                                id: update.id,
                                success: true,
                                product: updatedProduct
                            });
                        } else {
                            results.push({
                                id: update.id,
                                success: false,
                                message: 'Product not found or inactive'
                            });
                        }
                    } catch (updateError) {
                        results.push({
                            id: update.id,
                            success: false,
                            message: updateError.message
                        });
                    }
                }
                // Skip products with no changes (no error, just ignore)
            }

            await transaction.commit();

            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;

            res.json({
                success: true,
                message: `Processed ${results.length} price updates`,
                results,
                summary: {
                    total: updates.length,
                    processed: results.length,
                    successful,
                    failed,
                    skipped: updates.length - results.length
                }
            });

        } catch (error) {
            await transaction.rollback();
            console.error('Bulk update prices error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error during bulk price update',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get a single product template by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getProductTempById(req, res) {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid product template ID is required'
                });
            }

            const productTemp = await ProductTemp.findByPk(id);

            if (!productTemp) {
                return res.status(404).json({
                    success: false,
                    message: 'Product template not found'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Product template retrieved successfully',
                data: productTemp
            });

        } catch (error) {
            console.error('Error fetching product template:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get product template by barcode
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getProductTempByBarcode(req, res) {
        try {
            const { barcode } = req.params;

            if (!barcode) {
                return res.status(400).json({
                    success: false,
                    message: 'Barcode is required'
                });
            }

            const productTemp = await ProductTemp.findOne({
                where: { barCode: barcode }
            });

            if (!productTemp) {
                return res.status(404).json({
                    success: false,
                    message: 'Product template with this barcode not found'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Product template retrieved successfully',
                data: productTemp
            });

        } catch (error) {
            console.error('Error fetching product template by barcode:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Update a product template
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async updateProductTemp(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid product template ID is required'
                });
            }

            // Find the product template
            const productTemp = await ProductTemp.findByPk(id);

            if (!productTemp) {
                return res.status(404).json({
                    success: false,
                    message: 'Product template not found'
                });
            }

            // Check if barcode is being updated and if it already exists
            if (updateData.barCode && updateData.barCode !== productTemp.barCode) {
                const existingProduct = await ProductTemp.findOne({
                    where: { 
                        barCode: updateData.barCode,
                        id: { [Op.ne]: id } // Exclude current product
                    }
                });

                if (existingProduct) {
                    return res.status(409).json({
                        success: false,
                        message: 'Product with this barcode already exists'
                    });
                }
            }

            // Update the product template
            await productTemp.update(updateData);

            // Fetch updated product template
            const updatedProductTemp = await ProductTemp.findByPk(id);

            return res.status(200).json({
                success: true,
                message: 'Product template updated successfully',
                data: updatedProductTemp
            });

        } catch (error) {
            console.error('Error updating product template:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Delete a product template (soft delete by setting isActive to false)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async deleteProductTemp(req, res) {
        try {
            const { id } = req.params;
            const { permanent = false } = req.query;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid product template ID is required'
                });
            }

            const productTemp = await ProductTemp.findByPk(id);

            if (!productTemp) {
                return res.status(404).json({
                    success: false,
                    message: 'Product template not found'
                });
            }

            if (permanent === 'true') {
                // Permanent delete
                await productTemp.destroy();
                return res.status(200).json({
                    success: true,
                    message: 'Product template permanently deleted'
                });
            } else {
                // Soft delete - set isActive to false
                await productTemp.update({ isActive: false });
                return res.status(200).json({
                    success: true,
                    message: 'Product template deactivated successfully',
                    data: productTemp
                });
            }

        } catch (error) {
            console.error('Error deleting product template:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Restore a deactivated product template
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async restoreProductTemp(req, res) {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid product template ID is required'
                });
            }

            const productTemp = await ProductTemp.findByPk(id);

            if (!productTemp) {
                return res.status(404).json({
                    success: false,
                    message: 'Product template not found'
                });
            }

            if (productTemp.isActive) {
                return res.status(400).json({
                    success: false,
                    message: 'Product template is already active'
                });
            }

            await productTemp.update({ isActive: true });

            return res.status(200).json({
                success: true,
                message: 'Product template restored successfully',
                data: productTemp
            });

        } catch (error) {
            console.error('Error restoring product template:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Bulk operations for product templates
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async bulkOperations(req, res) {
        try {
            const { operation, productIds } = req.body;

            if (!operation || !productIds || !Array.isArray(productIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'Operation and productIds array are required'
                });
            }

            let result;
            switch (operation) {
                case 'activate':
                    result = await ProductTemp.update(
                        { isActive: true },
                        { where: { id: productIds } }
                    );
                    break;
                case 'deactivate':
                    result = await ProductTemp.update(
                        { isActive: false },
                        { where: { id: productIds } }
                    );
                    break;
                case 'delete':
                    result = await ProductTemp.destroy({
                        where: { id: productIds }
                    });
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid operation. Use: activate, deactivate, or delete'
                    });
            }

            return res.status(200).json({
                success: true,
                message: `Bulk ${operation} completed successfully`,
                data: {
                    affectedRows: result[0] || result,
                    operation
                }
            });

        } catch (error) {
            console.error('Error performing bulk operation:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get product template statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    static async getProductTempStats(req, res) {
        try {
            const totalProducts = await ProductTemp.count();
            const activeProducts = await ProductTemp.count({
                where: { isActive: true }
            });
            const inactiveProducts = await ProductTemp.count({
                where: { isActive: false }
            });

            const avgPrice = await ProductTemp.findOne({
                attributes: [
                    [ProductTemp.sequelize.fn('AVG', ProductTemp.sequelize.col('pro_price')), 'avgPrice'],
                    [ProductTemp.sequelize.fn('AVG', ProductTemp.sequelize.col('cost_price')), 'avgCostPrice']
                ],
                where: { isActive: true }
            });

            return res.status(200).json({
                success: true,
                message: 'Product template statistics retrieved successfully',
                data: {
                    totalProducts,
                    activeProducts,
                    inactiveProducts,
                    averagePrice: parseFloat(avgPrice.dataValues.avgPrice) || 0,
                    averageCostPrice: parseFloat(avgPrice.dataValues.avgCostPrice) || 0
                }
            });

        } catch (error) {
            console.error('Error fetching product template statistics:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = ProductTempController;