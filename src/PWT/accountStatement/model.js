// models/AccountStatement.js
const logger = require("../../api/logger");

module.exports = (sequelize, DataTypes) => {
    const AccountStatement = sequelize.define('AccountStatement', {
        bookingDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        creditAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: true,
            defaultValue: 0.00
        },
        debitAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: true,
            defaultValue: 0.00
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        endingBalance: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        // Optional: Add reference number if needed
        referenceNo: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // Optional: Transaction type
        transactionType: {
            type: DataTypes.ENUM('deposit', 'withdrawal', 'transfer', 'fee', 'interest', 'other'),
            allowNull: true
        },
        // Optional: Status
        status: {
            type: DataTypes.ENUM('pending', 'cleared', 'reconciled'),
            defaultValue: 'cleared'
        },
        // Optional: Reconciliation date
        reconciledAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        // Enable timestamps
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        // Disable the modification of tablenames
        freezeTableName: true,
        // Add indexes for better query performance
        indexes: [
            {
                fields: ['bankAccountId']
            },
            {
                fields: ['bookingDate']
            },
            {
                fields: ['status']
            }
        ]
    });

    AccountStatement.associate = models => {
        logger.info('Associating table AccountStatement with models');
        
        // Belongs to BankAccount
        AccountStatement.belongsTo(models.bankAccount, {
            foreignKey: 'bankAccountId',
            as: 'bankAccount',
            onDelete: 'CASCADE'
        });

        // Optional: Track who created the record
        AccountStatement.belongsTo(models.user, {
            foreignKey: 'makerId',
            as: 'maker',
        });

        // Optional: Track who last updated
        AccountStatement.belongsTo(models.user, {
            foreignKey: 'updateUserId',
            as: 'updateUser',
        });

        // Optional: Track who reconciled
        AccountStatement.belongsTo(models.user, {
            foreignKey: 'reconciledById',
            as: 'reconciledBy',
        });
    };

    return AccountStatement;
};