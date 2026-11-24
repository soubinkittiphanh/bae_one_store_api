
// Stock Transaction Model
module.exports = (sequelize, DataTypes) => {
    const StockTransaction = sequelize.define('stockTransactionModel', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        transactionType: {
            // Values kept in step with src/posMigrations/20261124_recipe_bom_step1.js
            type: DataTypes.ENUM('purchase', 'sale', 'adjustment', 'recipe_deduction', 'return', 'transfer', 'recipe_reversal', 'opening', 'count'),
            allowNull: false,
            field: 'transaction_type'
        },
        
        // Transaction quantities and units
        transactionQuantity: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            field: 'transaction_quantity'
        },

        transactionRate: {
            type: DataTypes.DECIMAL(18, 6),
            allowNull: false,
            defaultValue: 1.0000,
            validate: {
                isDecimal: true,
                min: 0.0001
            },
            comment: 'Conversion rate from transaction unit to base unit',
            field: 'transaction_rate'
        },
        
        // Base unit quantities (for stock calculation)
        baseQuantityChange: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: false,
            validate: {
                isDecimal: true
            },
            comment: 'Change in base units (positive for increase, negative for decrease)',
            field: 'base_quantity_change'
        },

        
        // Stock levels
        baseQuantityBefore: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: false,
            validate: {
                isDecimal: true
            },
            field: 'base_quantity_before'
        },
        baseQuantityAfter: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: false,
            validate: {
                isDecimal: true
            },
            field: 'base_quantity_after'
        },
        
        // Cost tracking
        unitCost: {
            type: DataTypes.DECIMAL(18, 6),
            allowNull: true,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Cost per transaction unit',
            field: 'unit_cost'
        },
        totalCost: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: true,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Total transaction cost',
            field: 'total_cost'
        },
        
        // References
        referenceType: {
            type: DataTypes.ENUM('ticket', 'purchase_order', 'adjustment', 'manual', 'transfer', 'sale', 'receiving', 'conversion'),
            allowNull: true,
            field: 'reference_type'
        },
        referenceId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'reference_id'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        locationId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'location_id'
        },
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'user id',
            field: 'created_by'
        },
        reversalOfId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'stock_transactions.id this row reverses (void/refund)',
            field: 'reversal_of_id'
        },

    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: false, // We don't need updatedAt for transactions
        freezeTableName: true,
        tableName: 'stock_transactions',
        indexes: [
            {
                fields: ['reference_type', 'reference_id']
            },
            {
                fields: ['transaction_type']
            },
            {
                name: 'idx_stock_tx_product_location',
                fields: ['productId', 'location_id', 'createdAt']
            },
            {
                name: 'idx_stock_tx_reversal_of',
                fields: ['reversal_of_id']
            },
        ]
    });

    // Define associations
    StockTransaction.associate = function(models) {
        StockTransaction.belongsTo(models.product, {
            as: 'product',
            foreignKey: 'productId'
        });

        StockTransaction.belongsTo(models.unit, {
            as: 'transactionUnit',
            foreignKey: 'transactionUnitId'
        });

        StockTransaction.belongsTo(models.unit, {
            as: 'baseUnit',
            foreignKey: 'baseUnitId'
        });



        // Polymorphic associations for references
        StockTransaction.belongsTo(models.ticket, {
            as: 'ticket',
            foreignKey: 'referenceId',
            constraints: false,
            scope: {
                referenceType: 'ticket'
            }
        });

        // StockTransaction.belongsTo(models.purchaseOrderModel, {
        //     as: 'purchaseOrder',
        //     foreignKey: 'referenceId',
        //     constraints: false,
        //     scope: {
        //         referenceType: 'purchase_order'
        //     }
        // });
    };

    return StockTransaction;
};
