// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================

const logger = require("../api/logger");

// 1. MONEY ISSUANCE MODEL
// models/MoneyIssuance.js
module.exports = (sequelize, DataTypes) => {
    const MoneyAdvance = sequelize.define('MoneyAdvance', {
        bookingDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        amount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false
        },
        exchangeRate: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 1.00
        },
        purpose: {
            type: DataTypes.STRING,
            // allowNull: false
        },
        note: {
            type: DataTypes.STRING,
            // allowNull: false
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'settled'),
            defaultValue: 'pending'
        },
        approvedAt: {
            type: DataTypes.DATE
        },
        dueDate: {
            type: DataTypes.DATE
        }
    }, {
        sequelize,
        // don't forget to enable timestamps!
        timestamps: true,
        // I don't want createdAt
        createdAt: true,
        // I want updatedAt to actually be called updateTimestamp
        updatedAt: 'updateTimestamp',
        // disable the modification of tablenames; By default, sequelize will automatically
        // transform all passed model names (first parameter of define) into plural.
        // if you don't want that, set the following
        freezeTableName: true,
    });
    MoneyAdvance.associate = models => {
        logger.info(`Associating table MoneyAdvance with models`)
        MoneyAdvance.belongsTo(models.bankAccount, {
            foreignKey: 'bankAccountId',
            as: 'bankAccount',
        });
        MoneyAdvance.belongsTo(models.user, {
            foreignKey: 'makerId',
            as: 'maker',
        });
        MoneyAdvance.belongsTo(models.user, {
            foreignKey: 'updateUserId',
            as: 'updateUser',
        });
        MoneyAdvance.belongsTo(models.user, {
            foreignKey: 'checkerId',
            as: 'checker',
        });
        MoneyAdvance.belongsTo(models.currency, {
            foreignKey: 'currencyId',
            as: 'currency',
        });

        // Ticket -> TicketLine (One-to-Many)
        MoneyAdvance.hasMany(models.moneySettlement, {
            foreignKey: 'moneyAdvanceId',
            as: 'settlementLine',
        });
        MoneyAdvance.belongsTo(models.ministry, {
            foreignKey: 'ministryId',
            as: 'ministry',
        });

    };

    return MoneyAdvance;
};
