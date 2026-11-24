// One ingredient consumed by one sold line (restaurant ticketLine or merchant saleLine), so a void or refund
// can reverse exactly what was deducted. Schema and FKs: src/posMigrations/20261124_recipe_bom_step1.js.
// (Replaces an earlier draft that was never registered and pointed at tables that do not exist.)
module.exports = (sequelize, DataTypes) => {
    const RecipeStockImpact = sequelize.define('recipeStockImpact', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        stockTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'the recipe_deduction ledger row',
            field: 'stock_transaction_id'
        },
        sourceType: {
            type: DataTypes.ENUM('ticket', 'sale'),
            allowNull: false,
            comment: 'ticket = restaurant ticketLine, sale = merchant saleLine',
            field: 'source_type'
        },
        sourceLineId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'ticketLine.id or saleLine.id',
            field: 'source_line_id'
        },
        productSoldId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'product_sold_id'
        },
        ingredientId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'ingredient_id'
        },
        recipeId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'recipe row used; NULL once that row is deleted',
            field: 'recipe_id'
        },
        locationId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'location_id'
        },
        quantitySold: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: false,
            field: 'quantity_sold'
        },
        recipeQuantityPerUnit: {
            type: DataTypes.DECIMAL(18, 6),
            allowNull: false,
            comment: 'as written in the recipe, in recipe_unit_id',
            field: 'recipe_quantity_per_unit'
        },
        recipeUnitId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'recipe_unit_id'
        },
        ingredientQuantity: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: false,
            comment: 'deducted, in the ingredient stock unit',
            field: 'ingredient_quantity'
        },
        ingredientUnitId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'ingredient_unit_id'
        },
        unitCost: {
            type: DataTypes.DECIMAL(18, 6),
            allowNull: false,
            defaultValue: 0,
            comment: 'LCY per ingredient stock unit',
            field: 'unit_cost'
        },
        totalCost: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: false,
            defaultValue: 0,
            field: 'total_cost'
        },
        reversedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'reversed_at'
        },
        reversalTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'reversal_transaction_id'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: false, // history: rows are only marked reversed, never edited otherwise
        freezeTableName: true,
        tableName: 'recipe_stock_impacts',
        indexes: [
            { name: 'idx_rsi_source', fields: ['source_type', 'source_line_id'] },
            { name: 'idx_rsi_ingredient', fields: ['ingredient_id', 'createdAt'] },
            { name: 'idx_rsi_product_sold', fields: ['product_sold_id', 'createdAt'] },
            { name: 'idx_rsi_stock_tx', fields: ['stock_transaction_id'] }
        ]
    });

    RecipeStockImpact.associate = (models) => {
        // FKs are created by the migration with fixed names; constraints: false keeps sync from adding more
        const opts = { constraints: false };
        RecipeStockImpact.belongsTo(models.stockTransactionModel, { as: 'stockTransaction', foreignKey: 'stockTransactionId', ...opts });
        RecipeStockImpact.belongsTo(models.stockTransactionModel, { as: 'reversalTransaction', foreignKey: 'reversalTransactionId', ...opts });
        RecipeStockImpact.belongsTo(models.product, { as: 'productSold', foreignKey: 'productSoldId', ...opts });
        RecipeStockImpact.belongsTo(models.product, { as: 'ingredient', foreignKey: 'ingredientId', ...opts });
        RecipeStockImpact.belongsTo(models.recipe, { as: 'recipe', foreignKey: 'recipeId', ...opts });
        RecipeStockImpact.belongsTo(models.unit, { as: 'recipeUnit', foreignKey: 'recipeUnitId', ...opts });
        RecipeStockImpact.belongsTo(models.unit, { as: 'ingredientUnit', foreignKey: 'ingredientUnitId', ...opts });
        RecipeStockImpact.belongsTo(models.location, { as: 'location', foreignKey: 'locationId', ...opts });
    };

    return RecipeStockImpact;
};
