// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// SETTLEMENT MODEL
// models/APSettlement.js
module.exports = (sequelize, DataTypes) => {
    const APSettlement = sequelize.define('APInvoiceSettlement', {
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
                if (settlement.paymentCurrencyId === settlement.baseCurrencyId) {
                    settlement.baseAmount = settlement.paymentAmount;
                    settlement.exchangeRate = 1.000000;
                } else if (settlement.paymentAmount && settlement.exchangeRate) {
                    settlement.baseAmount = settlement.paymentAmount / settlement.exchangeRate;
                }
                // Set exchange date to settlement date if not provided
                if (!settlement.exchangeDate) {
                    settlement.exchangeDate = settlement.settlementDate;
                }
            }
        }
    });

    APSettlement.associate = models => {
        logger.info(`Associating table APInvoiceSettlement with models`);
        
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

        // *** MISSING ASSOCIATION - ADD THIS ***
        // Settlement has many settlement lines
        APSettlement.hasMany(models.apInvoiceSettlementLine, {
            foreignKey: 'settlementId',
            as: 'invoiceSettlements'
        });
    };

    // Instance methods
    APSettlement.prototype.getUnallocatedAmount = async function() {
        // Fix: Use correct model name and field
        const InvoiceSettlementLine = sequelize.models.InvoiceSettlementLine;
        const allocated = await InvoiceSettlementLine.sum('amount', {
            where: { 
                settlementId: this.id,
                status: 'active'
            }
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