module.exports = (sequelize, DataTypes) => {
    const ProductOption = sequelize.define('productOption', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        groupId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'productOptionGroup',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        optionName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        priceAdjustment: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0
        },
        costAdjustment: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0
        },
        ingredientProductId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'product',
                key: 'id'
            }
        }
    }, {
        sequelize,
        timestamps: true,
        freezeTableName: true
    });

    ProductOption.associate = (models) => {
        ProductOption.belongsTo(models.ProductOptionGroup, {
            foreignKey: 'groupId',
            as: 'group'
        });
        ProductOption.belongsTo(models.product, {
            foreignKey: 'ingredientProductId',
            as: 'ingredient'
        });
    };

    return ProductOption;
};
