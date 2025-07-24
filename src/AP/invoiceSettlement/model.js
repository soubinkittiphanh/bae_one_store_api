// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// SETTLEMENT MODEL
// models/APSettlement.js
module.exports = (sequelize, DataTypes) => {
    const APSettlement = sequelize.define('APInvoiceSettlement', {
        settlementNumber: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        settlementDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        paymentAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false
        },
        baseAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false
        },
        exchangeRate: {
            type: DataTypes.DECIMAL(20, 6),
            allowNull: false,
            defaultValue: 1.000000
        },
        status: {
            type: DataTypes.ENUM('draft', 'pending', 'approved', 'completed', 'cancelled'),
            defaultValue: 'draft'
        },

        reference: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        description: {
            type: DataTypes.TEXT
        },
      
        note: {
            type: DataTypes.TEXT
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        hooks: {
            beforeSave: (settlement) => {
                // Auto-calculate base amount if same currency
                if (APSettlement.paymentCurrencyId === APSettlement.baseCurrencyId) {
                    APSettlement.baseAmount = APSettlement.paymentAmount;
                    APSettlement.exchangeRate = 1.000000;
                } else if (APSettlement.paymentAmount && APSettlement.exchangeRate) {
                    APSettlement.baseAmount = APSettlement.paymentAmount / APSettlement.exchangeRate;
                }

                // Set exchange date to settlement date if not provided
                if (!APSettlement.exchangeDate) {
                    APSettlement.exchangeDate = APSettlement.settlementDate;
                }
            }
        }
    });

    APSettlement.associate = models => {
        logger.info(`Associating table Settlement with models`);

        // Settlement belongs to payment currency
        APSettlement.belongsTo(models.currency, {
            foreignKey: 'paymentCurrencyId',
            as: 'paymentCurrency',
        });

        // Settlement belongs to base currency
        APSettlement.belongsTo(models.currency, {
            foreignKey: 'baseCurrencyId',
            as: 'baseCurrency',
        });

        // Settlement belongs to payment method
        APSettlement.belongsTo(models.payment, {
            foreignKey: 'paymentMethodId',
            as: 'paymentMethod',
        });

        // Settlement belongs to bank account
        APSettlement.belongsTo(models.bankAccount, {
            foreignKey: 'bankAccountId',
            as: 'bankAccount',
        });

        // Settlement created by user (maker)
        APSettlement.belongsTo(models.user, {
            foreignKey: 'makerId',
            as: 'maker',
        });

        // Settlement approved by user (checker)
        APSettlement.belongsTo(models.user, {
            foreignKey: 'checkerId',
            as: 'checker',
        });

        // Settlement -> InvoiceSettlement (One-to-Many)
        APSettlement.hasMany(models.apInvoiceSettlementLine, {
            foreignKey: 'settlementLineId',
            as: 'invoiceSettlementsLines',
        });
    };

    // Instance methods
    APSettlement.prototype.getUnallocatedAmount = async function() {
        const InvoiceSettlement = sequelize.models.apInvoiceSettlement;
        const allocated = await InvoiceSettlement.sum('settledAmount', {
            where: { settlementId: this.id }
        });
        return parseFloat(this.baseAmount) - (parseFloat(allocated) || 0);
    };

    APSettlement.prototype.canBeModified = function() {
        return ['draft', 'pending'].includes(this.status);
    };

    APSettlement.prototype.canBeApproved = function() {
        return this.status === 'pending';
    };

    APSettlement.prototype.canBeCompleted = function() {
        return ['pending', 'approved'].includes(this.status);
    };

    return APSettlement;
};