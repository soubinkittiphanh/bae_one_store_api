module.exports = (sequelize, DataTypes) => {
    const BankAccount = sequelize.define('bankAccount', {
        accountNumber: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            unique: {
                name: 'unique_account_number',  // ✅ Give it a fixed name
                msg: 'Account number must be unique'
            }
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
            type: DataTypes.ENUM('LAK', 'USD', 'THB', 'CNY','EUR'),
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
