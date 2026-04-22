const logger = require("../api/logger");

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
        balance: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0
        },
        bankName: {
            type: DataTypes.STRING,
            // allowNull: false
        },
        bankBranch: {
            type: DataTypes.STRING,
            allowNull: true
        },
        accountType: {
            type: DataTypes.ENUM('Saving', 'Current', 'Fixed Deposit', 'Wallet', 'Merchant'),
            allowNull: false
        },
        currency: {
            type: DataTypes.ENUM('LAK', 'USD', 'THB', 'CNY', 'EUR'),
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
    BankAccount.associate = models => {
        logger.info('Associating table Bank with models');
        // Card associations
        if (models.bank) {
            BankAccount.belongsTo(models.bank, {
                foreignKey: 'bankId',
                as: 'bank'
            });
        }
    };

    return BankAccount;
};
