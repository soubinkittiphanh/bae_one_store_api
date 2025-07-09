module.exports = (sequelize, DataTypes) => {
    const BankAccount = sequelize.define('bank_account', {
        accountNumber: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        accountName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        bankName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        bankBranch: {
            type: DataTypes.STRING,
            allowNull: true
        },
        accountType: {
            type: DataTypes.ENUM('Saving', 'Current', 'Fixed Deposit'),
            allowNull: false
        },
        currency: {
            type: DataTypes.ENUM('LAK', 'USD', 'THB', 'CNY'),
            allowNull: false,
            defaultValue: 'LAK'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
    });

    return BankAccount;
};
