module.exports = (sequelize, DataTypes) => {
    const FixedAssetDepreciation = sequelize.define('fixed_asset_depreciation', {
        fixedAssetContractId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        periodDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        depreciationAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            validate: {
                min: 0.00
            }
        },
        cumulativeDepreciation: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            validate: {
                min: 0.00
            }
        },
        isPosted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        glBatchId: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    return FixedAssetDepreciation;
};
