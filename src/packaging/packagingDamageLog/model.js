module.exports = (sequelize, DataTypes) => {
    const PackagingDamageLog = sequelize.define('packagingDamageLog', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        packagingProductId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'packagingProductId',
            comment: 'Reference to broken bottle or damaged crate product ID'
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: 'Number of units broken or damaged'
        },
        reason: {
            type: DataTypes.ENUM('DELIVERY_BREAKAGE', 'WAREHOUSE_DAMAGE', 'FACTORY_REJECT'),
            allowNull: false,
            comment: 'Cause of damage / breakage'
        },
        notes: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        locationId: {
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
        tableName: 'packaging_damage_logs',
        indexes: [
            {
                name: 'idx_pdl_product',
                fields: ['packagingProductId']
            }
        ]
    });

    PackagingDamageLog.associate = function (models) {
        PackagingDamageLog.belongsTo(models.product, {
            foreignKey: 'packagingProductId',
            as: 'packagingProduct'
        });

        if (models.user) {
            PackagingDamageLog.belongsTo(models.user, {
                foreignKey: 'userId',
                as: 'user'
            });
        }

        if (models.location) {
            PackagingDamageLog.belongsTo(models.location, {
                foreignKey: 'locationId',
                as: 'location'
            });
        }

        if (models.company) {
            PackagingDamageLog.belongsTo(models.company, {
                foreignKey: 'companyId',
                as: 'company'
            });
        }
    };

    return PackagingDamageLog;
};
