// Fixed Unit Model - /src/unit/model.js
module.exports = (sequelize, DataTypes) => {
    const Unit = sequelize.define('unitModel', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(50),
            allowNull: false,
            validate: {
                notEmpty: true,
                len: [1, 50]
            }
        },
        symbol: {
            type: DataTypes.STRING(10),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true,
                len: [1, 10]
            }
        },
        baseUnitId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'base_unit_id'
        },
        conversionRate: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            defaultValue: 1.0000,
            validate: {
                min: 0.0001,
                isDecimal: true
            },
            field: 'conversion_rate'
        },
        unitType: {
            type: DataTypes.ENUM('base', 'derived'),
            allowNull: false,
            defaultValue: 'base',
            field: 'unit_type'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'unitModel',
        indexes: [
            {
                unique: true,
                fields: ['symbol']
            },
            {
                fields: ['unit_type']
            },
            {
                fields: ['base_unit_id']
            }
        ],
        hooks: {
            beforeValidate: (unit, options) => {
                // If it's a base unit, ensure baseUnitId is null and conversionRate is 1
                if (unit.unitType === 'base') {
                    unit.baseUnitId = null;
                    unit.conversionRate = 1.0000;
                }
            }
        }
    });

    // Define associations - FIXED VERSION
    Unit.associate = function(models) {
        // Self-referencing association for base unit
        // Use string reference instead of direct model reference
        Unit.belongsTo(models.unit, {
            as: 'baseUnit',
            foreignKey: 'baseUnitId',
            targetKey: 'id'
        });
        
        Unit.hasMany(models.unit, {
            as: 'derivedUnits',
            foreignKey: 'baseUnitId',
            sourceKey: 'id'
        });

        // Only add these associations if the models exist
        if (models.product) {
            Unit.hasMany(models.product, {
                as: 'products',
                foreignKey: 'baseUnitId'
            });
        }

        if (models.stockTransactionModel) {
            Unit.hasMany(models.stockTransactionModel, {
                as: 'transactionUnits',
                foreignKey: 'transactionUnitId'
            });

            Unit.hasMany(models.stockTransactionModel, {
                as: 'baseUnits',
                foreignKey: 'baseUnitId'
            });
        }

        if (models.recipe) {
            Unit.hasMany(models.recipe, {
                as: 'recipeUnits',
                foreignKey: 'unitId'
            });
        }
    };

    return Unit;
};