
// Recipe Stock Impacts Model (Enhanced)
module.exports = (sequelize, DataTypes) => {
    const RecipeStockImpact = sequelize.define('recipeStockImpactModel', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        ticketLineId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'ticket_line',
                key: 'id'
            },
            field: 'ticket_line_id'
        },
        productSoldId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'products',
                key: 'id'
            },
            field: 'product_sold_id'
        },
        ingredientId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'products',
                key: 'id'
            },
            field: 'ingredient_id'
        },
        recipeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'recipes',
                key: 'id'
            },
            field: 'recipe_id'
        },
        
        // Quantities
        quantitySold: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Quantity of finished product sold',
            field: 'quantity_sold'
        },
        
        // Recipe ingredient deduction details
        recipeQuantityPerUnit: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Recipe ingredient quantity per unit of finished product',
            field: 'recipe_quantity_per_unit'
        },
        recipeUnitId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'units',
                key: 'id'
            },
            comment: 'Unit specified in the recipe',
            field: 'recipe_unit_id'
        },
        
        // Total deduction
        ingredientQuantityDeducted: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Total ingredient quantity deducted (recipe_quantity_per_unit * quantity_sold)',
            field: 'ingredient_quantity_deducted'
        },
        ingredientUnitId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'units',
                key: 'id'
            },
            comment: 'Base unit of the ingredient',
            field: 'ingredient_unit_id'
        },
        
        // Cost tracking
        unitCost: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Cost per base unit of ingredient',
            field: 'unit_cost'
        },
        totalCost: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Total cost of ingredient deducted (unit_cost * ingredient_quantity_deducted)',
            field: 'total_cost'
        },
        
        // Stock levels at time of deduction
        stockBefore: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Ingredient stock level before deduction',
            field: 'stock_before'
        },
        stockAfter: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            validate: {
                isDecimal: true,
                min: 0
            },
            comment: 'Ingredient stock level after deduction',
            field: 'stock_after'
        },
        
        // Reference to stock transaction
        stockTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'stock_transactions',
                key: 'id'
            },
            comment: 'Link to corresponding stock transaction record',
            field: 'stock_transaction_id'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: false, // These are historical records, no updates needed
        freezeTableName: true,
        tableName: 'recipe_stock_impacts',
        indexes: [
            {
                fields: ['ticket_line_id']
            },
            {
                fields: ['ingredient_id', 'createdAt']
            },
            {
                fields: ['product_sold_id', 'createdAt']
            },
            {
                fields: ['recipe_id']
            },
            {
                fields: ['stock_transaction_id']
            }
        ]
    });

    // Define associations
    RecipeStockImpact.associate = function(models) {
        RecipeStockImpact.belongsTo(models.ticketLineModel, {
            as: 'ticketLine',
            foreignKey: 'ticketLineId'
        });

        RecipeStockImpact.belongsTo(models.productModel, {
            as: 'productSold',
            foreignKey: 'productSoldId'
        });

        RecipeStockImpact.belongsTo(models.productModel, {
            as: 'ingredient',
            foreignKey: 'ingredientId'
        });

        RecipeStockImpact.belongsTo(models.recipeModel, {
            as: 'recipe',
            foreignKey: 'recipeId'
        });

        RecipeStockImpact.belongsTo(models.unitModel, {
            as: 'recipeUnit',
            foreignKey: 'recipeUnitId'
        });

        RecipeStockImpact.belongsTo(models.unitModel, {
            as: 'ingredientUnit',
            foreignKey: 'ingredientUnitId'
        });

        RecipeStockImpact.belongsTo(models.stockTransactionModel, {
            as: 'stockTransaction',
            foreignKey: 'stockTransactionId'
        });
    };

    return RecipeStockImpact;
};
