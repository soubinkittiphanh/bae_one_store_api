module.exports = (sequelize, DataTypes) => {
    const ProductPackaging = sequelize.define('productPackaging', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'productId',
            comment: 'Finished goods product ID (e.g. Beerlao Case)'
        },
        packagingProductId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'packagingProductId',
            comment: 'Packaging asset product ID (e.g. Empty Crate or Empty Bottle)'
        },
        quantity: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 1,
            comment: 'Packaging ratio per finished case (e.g. 1 crate, 12 bottles)'
        },
        depositPrice: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Deposit price per unit of packaging'
        },
        companyId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'product_packagings',
        indexes: [
            {
                name: 'idx_pkg_product',
                fields: ['productId']
            },
            {
                name: 'idx_pkg_packaging_product',
                fields: ['packagingProductId']
            },
            {
                name: 'idx_pkg_company',
                fields: ['companyId']
            }
        ]
    });

    ProductPackaging.associate = function (models) {
        // Belongs to the parent finished product (e.g., Beerlao Case)
        ProductPackaging.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product'
        });

        // Belongs to the packaging asset (e.g., Empty Crate or Empty Bottle)
        ProductPackaging.belongsTo(models.product, {
            foreignKey: 'packagingProductId',
            as: 'packagingProduct'
        });

        // Belongs to company
        if (models.company) {
            ProductPackaging.belongsTo(models.company, {
                foreignKey: 'companyId',
                as: 'company'
            });
        }
    };

    return ProductPackaging;
};
