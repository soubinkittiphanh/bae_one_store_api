module.exports = (sequelize, DataTypes) => {
    const AnnualExpenseBudget = sequelize.define('annual_expense_budget', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        year: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 2020,
                max: 2100
            }
        },
        allocatedAmount: {
            type: DataTypes.DECIMAL(30, 2),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        exchangeRate: {
            type: DataTypes.DECIMAL(30, 2),
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 0.000001
            }
        },
        thresholdWarningPercent: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 80,
            validate: {
                min: 1,
                max: 100
            }
        },
        drAccountId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        ministryId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        currencyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        remark: {
            type: DataTypes.STRING,
            defaultValue: ''
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
    });

    return AnnualExpenseBudget;
};
