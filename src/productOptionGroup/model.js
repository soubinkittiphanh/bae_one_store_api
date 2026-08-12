module.exports = (sequelize, DataTypes) => {
    const ProductOptionGroup = sequelize.define('productOptionGroup', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'product',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        groupName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        isRequired: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        minSelections: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        maxSelections: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        }
    }, {
        sequelize,
        timestamps: true,
        freezeTableName: true
    });

    ProductOptionGroup.associate = (models) => {
        ProductOptionGroup.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product'
        });
        ProductOptionGroup.hasMany(models.ProductOption, {
            foreignKey: 'groupId',
            as: 'options',
            onDelete: 'CASCADE'
        });
    };

    return ProductOptionGroup;
};
