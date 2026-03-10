module.exports = (sequelize, DataTypes) => {
    const Recipe = sequelize.define('recipe', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        // Product that is sold (ex: Latte)
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            // REMOVED unique: true to allow multiple ingredients per product
            references: {
                model: 'product',
                key: 'id',
            },
            onDelete: 'CASCADE',
        },

        // Ingredient used (ex: Milk, Sugar, Coffee Bean)
        ingredientId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'product',
                key: 'id',
            },
            onDelete: 'CASCADE',
        },

        // Quantity of the ingredient required per 1 unit of product
        quantity: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0,
        },

        // Optional: unit of measure (gram, ml, piece, etc.)
        unitId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'unit',
                key: 'id',
            },
        },


    }, {
        sequelize,
        timestamps: true,
        freezeTableName: true,
    });

    // Associations
    Recipe.associate = (models) => {
        // Each recipe belongs to a product (main item)
        Recipe.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product',
        });

        // Each recipe also belongs to an ingredient (also a product record)
        Recipe.belongsTo(models.product, {
            foreignKey: 'ingredientId',
            as: 'ingredient',
        });
        Recipe.belongsTo(models.unit, {
            foreignKey: 'unitId',
            as: 'unit',
        });
    };

    return Recipe;
};
