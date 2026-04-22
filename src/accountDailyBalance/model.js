module.exports = (sequelize, DataTypes) => {
    const AccountDailyBalance = sequelize.define('accountDailyBalance', {
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        bankAccountId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        openingBalance: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0
        },
        totalIn: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0
        },
        totalOut: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0
        },
        closingBalance: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0
        },
        isClosed: {
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
    });

    AccountDailyBalance.associate = models => {
        if (models.bankAccount) {
            AccountDailyBalance.belongsTo(models.bankAccount, {
                foreignKey: 'bankAccountId',
                as: 'bankAccount'
            });
        }
    };

    return AccountDailyBalance;
};
