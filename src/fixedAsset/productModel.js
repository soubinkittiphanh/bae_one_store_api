module.exports = (sequelize, DataTypes) => {
    const FixedAssetProduct = sequelize.define('fixed_asset_product', {
        productCode: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        productName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        usefulLifeMonths: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1
            }
        },
        usefulLifeYears: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            validate: {
                min: 0.08
            }
        },
        depreciationMethod: {
            type: DataTypes.ENUM('STRAIGHT_LINE', 'DOUBLE_DECLINING'),
            allowNull: false,
            defaultValue: 'STRAIGHT_LINE'
        },
        assetCostAccountId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Account in COA representing the asset cost (Asset)'
        },
        accumulatedDepreciationAccountId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Account in COA representing accumulated depreciation (Contra-Asset)'
        },
        depreciationExpenseAccountId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Account in COA representing monthly depreciation expense (Expense)'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        hooks: {
            beforeValidate: (product) => {
                if (product.usefulLifeYears !== undefined && product.usefulLifeYears !== null) {
                    product.usefulLifeMonths = Math.round(parseFloat(product.usefulLifeYears) * 12);
                } else if (product.usefulLifeMonths !== undefined && product.usefulLifeMonths !== null) {
                    product.usefulLifeYears = parseFloat((product.usefulLifeMonths / 12).toFixed(2));
                }
            }
        }
    });

    return FixedAssetProduct;
};
