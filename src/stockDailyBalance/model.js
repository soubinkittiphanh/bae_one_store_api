module.exports = (sequelize, DataTypes) => {
    const StockDailyBalance = sequelize.define('stockDailyBalance', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        locationId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            comment: 'The day this balance applies to'
        },
        broughtForward: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            allowNull: false,
            comment: 'Starting balance for the day'
        },
        inMovement: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            allowNull: false,
            comment: 'Total incoming stock for the day'
        },
        outMovement: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            allowNull: false,
            comment: 'Total outgoing stock for the day'
        },
        balance: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            allowNull: false,
            comment: 'Closing balance for the day (broughtForward + inMovement - outMovement)'
        },
        
        // Detailed IN Breakdown
        inAddStock: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            comment: 'Manual additions or adjustments'
        },
        inSaleReversal: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            comment: 'Refunds or returns from sales'
        },
        inTransfer: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            comment: 'Transfers received from other locations'
        },
        inPurchase: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            comment: 'Stock received from purchase orders'
        },

        // Detailed OUT Breakdown
        outDeleteStock: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            comment: 'Manual deductions, spoilage, adjustments'
        },
        outSale: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            comment: 'Stock reduced due to sales'
        },
        outTransfer: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
            comment: 'Transfers sent to other locations'
        }
    }, {
        sequelize,
        timestamps: true,
        freezeTableName: true,
        indexes: [
            {
                unique: true,
                fields: ['productId', 'locationId', 'date'],
                name: 'idx_stock_daily_balance_unique'
            }
        ]
    });

    StockDailyBalance.associate = function (models) {
        if (models.product) {
            StockDailyBalance.belongsTo(models.product, {
                foreignKey: 'productId',
                as: 'product'
            });
        }
        if (models.location) {
            StockDailyBalance.belongsTo(models.location, {
                foreignKey: 'locationId',
                as: 'location'
            });
        }
    };

    return StockDailyBalance;
};
