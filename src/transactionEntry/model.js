const logger = require("../api/logger");


module.exports = (sequelize, DataTypes) => {
    const TransactionEntry = sequelize.define('transactionEntry', {
        referenceId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            comment: 'Links the two legs of the double-entry together'
        },
        transactionType: {
            type: DataTypes.ENUM('PURCHASE', 'TOPUP', 'REFUND', 'ADJUSTMENT'),
            allowNull: false
        },
        debit: {
            type: DataTypes.DOUBLE,
            defaultValue: 0
        },
        credit: {
            type: DataTypes.DOUBLE,
            defaultValue: 0
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        externalRefno: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'External reference number, e.g., NFC card UID or external payment ref'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'The administrator or cashier who processed this transaction'
        },
        businessDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            comment: 'The official business date this transaction belongs to'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
    });

    TransactionEntry.associate = models => {
        logger.info('Associating table TransactionEntry');

        // Each transaction leg belongs to one bankAccount
        TransactionEntry.belongsTo(models.bankAccount, {
            foreignKey: 'bankAccountId',
            as: 'account'
        });

        // Link to the Sale Header if it's a purchase
        TransactionEntry.belongsTo(models.saleHeader, {
            foreignKey: 'saleHeaderId',
            as: 'sale'
        });

        // Link to the User who made the transaction
        if (models.user) {
            TransactionEntry.belongsTo(models.user, {
                foreignKey: 'userId',
                as: 'creator'
            });
        }
    };

    return TransactionEntry;
};