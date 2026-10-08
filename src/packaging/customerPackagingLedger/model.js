module.exports = (sequelize, DataTypes) => {
    const CustomerPackagingLedger = sequelize.define('customerPackagingLedger', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        clientId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'clientId',
            comment: 'Reference to client / wholesale customer table'
        },
        saleHeaderId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'saleHeaderId',
            comment: 'Reference to saleHeader if originated from a sale'
        },
        packagingProductId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'packagingProductId',
            comment: 'Reference to empty crate or bottle product ID'
        },
        transactionType: {
            type: DataTypes.ENUM('DELIVERED_OUT', 'RETURNED_IN', 'PAID_DEPOSIT', 'REFUNDED_DEPOSIT', 'WRITE_OFF'),
            allowNull: false,
            comment: 'Type of packaging transaction with the customer'
        },
        qtyChange: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Positive = Customer owes more packaging, Negative = Customer returned empties'
        },
        balanceAfter: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Cumulative packaging balance owed by customer after this transaction'
        },
        depositAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Deposit money involved in this transaction (if any)'
        },
        notes: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        companyId: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'customer_packaging_ledger',
        indexes: [
            {
                name: 'idx_cpl_client',
                fields: ['clientId']
            },
            {
                name: 'idx_cpl_sale',
                fields: ['saleHeaderId']
            },
            {
                name: 'idx_cpl_product',
                fields: ['packagingProductId']
            }
        ]
    });

    CustomerPackagingLedger.associate = function (models) {
        CustomerPackagingLedger.belongsTo(models.client, {
            foreignKey: 'clientId',
            as: 'client'
        });

        if (models.saleHeader) {
            CustomerPackagingLedger.belongsTo(models.saleHeader, {
                foreignKey: 'saleHeaderId',
                as: 'saleHeader'
            });
        }

        CustomerPackagingLedger.belongsTo(models.product, {
            foreignKey: 'packagingProductId',
            as: 'packagingProduct'
        });

        if (models.user) {
            CustomerPackagingLedger.belongsTo(models.user, {
                foreignKey: 'userId',
                as: 'user'
            });
        }

        if (models.company) {
            CustomerPackagingLedger.belongsTo(models.company, {
                foreignKey: 'companyId',
                as: 'company'
            });
        }
    };

    return CustomerPackagingLedger;
};
