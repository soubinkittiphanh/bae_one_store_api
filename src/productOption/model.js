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
        },
        // Raw-material amount per item ("Extra shot" = 9 g); schema: src/posMigrations/20261125_recipe_engine_step3.js
        ingredientQuantity: {
            type: DataTypes.DECIMAL(18, 6),
            allowNull: true,
            comment: 'amount of ingredientProductId per item, in ingredientUnitId (raw materials)'
        },
        ingredientUnitId: {
            type: DataTypes.INTEGER,
            allowNull: true
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
