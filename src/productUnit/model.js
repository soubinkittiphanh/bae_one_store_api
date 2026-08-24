module.exports = (sequelize, DataTypes) => {
    const ProductUnit = sequelize.define('productUnit', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'productId'
        },
        unitId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'unitId'
        },
        price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        barCode: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'barCode'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        isBaseUnit: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'product_units',
        indexes: [
            {
                name: 'idx_product_units_barcode',
                fields: ['barCode']
            },
            {
                name: 'idx_product_units_product',
                fields: ['productId']
            },
            {
                name: 'idx_product_units_unit',
                fields: ['unitId']
            }
        ]
    });

    ProductUnit.associate = function (models) {
        ProductUnit.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product'
        });

        ProductUnit.belongsTo(models.unit, {
            foreignKey: 'unitId',
            as: 'unit'
        });
    };

    return ProductUnit;
};
