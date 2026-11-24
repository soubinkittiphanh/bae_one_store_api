// On-hand quantity of a 'quantity'-mode product (raw material) at one location.
// Schema and FKs: src/posMigrations/20261124_recipe_bom_step1.js (keep the two in step).
module.exports = (sequelize, DataTypes) => {
    const StockBalance = sequelize.define('stockBalance', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'product_id'
        },
        locationId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'location_id'
        },
        quantity: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: false,
            defaultValue: 0,
            comment: 'On hand, in the product stock unit (stockUnitId, else baseUnitId); may be negative when the product allows it'
        },
        avgCost: {
            type: DataTypes.DECIMAL(18, 6),
            allowNull: false,
            defaultValue: 0,
            comment: 'Weighted average cost in LCY per stock unit',
            field: 'avg_cost'
        },
        lastTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'stock_transactions.id of the last movement',
            field: 'last_transaction_id'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'stock_balances',
        indexes: [
            { name: 'uk_stock_balance_product_location', unique: true, fields: ['product_id', 'location_id'] },
            { name: 'idx_stock_balance_location', fields: ['location_id'] }
        ]
    });

    StockBalance.associate = (models) => {
        // FKs are created by the migration with fixed names; constraints: false keeps sync from adding more
        StockBalance.belongsTo(models.product, { as: 'product', foreignKey: 'productId', constraints: false });
        StockBalance.belongsTo(models.location, { as: 'location', foreignKey: 'locationId', constraints: false });
    };

    return StockBalance;
};
