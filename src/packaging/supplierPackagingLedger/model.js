module.exports = (sequelize, DataTypes) => {
    const SupplierPackagingLedger = sequelize.define('supplierPackagingLedger', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        vendorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'vendorId',
            comment: 'Reference to supplier (Lao Brewery Co.)'
        },
        receivingHeaderId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'receivingHeaderId',
            comment: 'Reference to receivingHeader when linked to a purchase shipment'
        },
        manifestNo: {
            type: DataTypes.STRING(60),
            allowNull: true,
            comment: 'Truck return manifest number signed by Beerlao driver'
        },
        packagingProductId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'packagingProductId',
            comment: 'Reference to empty crate or bottle product ID'
        },
        transactionType: {
            type: DataTypes.ENUM('RECEIVED_FULL', 'RETURNED_EMPTY_TRUCK', 'FACTORY_ADJUSTMENT'),
            allowNull: false,
            comment: 'Type of packaging movement with the factory'
        },
        qtyChange: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Positive = Received packaging from factory, Negative = Handed over to truck'
        },
        balanceAfter: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Cumulative packaging quota/liability with Beerlao Factory'
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
        tableName: 'supplier_packaging_ledger',
        indexes: [
            {
                name: 'idx_spl_vendor',
                fields: ['vendorId']
            },
            {
                name: 'idx_spl_rec',
                fields: ['receivingHeaderId']
            },
            {
                name: 'idx_spl_product',
                fields: ['packagingProductId']
            }
        ]
    });

    SupplierPackagingLedger.associate = function (models) {
        if (models.vendor) {
            SupplierPackagingLedger.belongsTo(models.vendor, {
                foreignKey: 'vendorId',
                as: 'vendor'
            });
        }

        if (models.receivingHeader) {
            SupplierPackagingLedger.belongsTo(models.receivingHeader, {
                foreignKey: 'receivingHeaderId',
                as: 'receivingHeader'
            });
        }

        SupplierPackagingLedger.belongsTo(models.product, {
            foreignKey: 'packagingProductId',
            as: 'packagingProduct'
        });

        if (models.user) {
            SupplierPackagingLedger.belongsTo(models.user, {
                foreignKey: 'userId',
                as: 'user'
            });
        }

        if (models.company) {
            SupplierPackagingLedger.belongsTo(models.company, {
                foreignKey: 'companyId',
                as: 'company'
            });
        }
    };

    return SupplierPackagingLedger;
};
