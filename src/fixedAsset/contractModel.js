module.exports = (sequelize, DataTypes) => {
    const FixedAssetContract = sequelize.define('fixed_asset_contract', {
        contractNumber: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        fixedAssetProductId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        assetName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        serialNumber: {
            type: DataTypes.STRING,
            allowNull: true
        },
        acquisitionDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        capitalizationDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        bookingDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        acquisitionCost: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            validate: {
                min: 0.00
            }
        },
        salvageValue: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
            validate: {
                min: 0.00
            }
        },
        status: {
            type: DataTypes.ENUM('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED', 'WRITTEN_OFF'),
            allowNull: false,
            defaultValue: 'ACTIVE'
        },
        locationId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        vendorId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        currencyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: 'Currency of the asset contract cost and depreciation values'
        },
        rate: {
            type: DataTypes.DECIMAL(15, 6),
            allowNull: false,
            defaultValue: 1.000000,
            comment: 'Exchange rate of contract currency to local currency'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    return FixedAssetContract;
};
