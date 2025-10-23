// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// INVOICE LINE ITEM MODEL
// models/InvoiceLineItem.js
module.exports = (sequelize, DataTypes) => {
    const InvoiceLineItem = sequelize.define('InvoiceLineItem', {
        lineNumber: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        description: {
            type: DataTypes.STRING(500),
            allowNull: false
        },
        quantity: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: false,
            defaultValue: 1
        },
        unitPrice: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false
        },
        lineTotal: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        taxRate: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 0.00
        },
        taxAmount: {
            type: DataTypes.DECIMAL(20, 2),
            defaultValue: 0.00
        },
        discountRate: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 0.00
        },
        discountAmount: {
            type: DataTypes.DECIMAL(20, 2),
            defaultValue: 0.00
        },
        note: {
            type: DataTypes.TEXT
        },
        // GL Posting fields
        glPostingRef: {
            type: DataTypes.STRING(50),
            comment: 'Reference for GL posting/journal entry'
        },
        isGLPosted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Whether this line has been posted to GL'
        },
        glPostedAt: {
            type: DataTypes.DATE,
            comment: 'When this line was posted to GL'
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
        hooks: {
            beforeSave: (lineItem) => {
                // Auto-calculate line total
                const subtotal = parseFloat(lineItem.quantity) * parseFloat(lineItem.unitPrice);

                // Apply discount
                const discountAmount = subtotal * (parseFloat(lineItem.discountRate) / 100);
                lineItem.discountAmount = discountAmount;

                const afterDiscount = subtotal - discountAmount;

                // Calculate tax
                lineItem.taxAmount = afterDiscount * (parseFloat(lineItem.taxRate) / 100);

                // Calculate final line total
                lineItem.lineTotal = afterDiscount + parseFloat(lineItem.taxAmount);
            }
        }
    });

    InvoiceLineItem.associate = models => {
        logger.info(`Associating table InvoiceLineItem with models`);

        // Line item belongs to invoice
        InvoiceLineItem.belongsTo(models.apInvoice, {
            foreignKey: 'invoiceId',
            as: 'invoice',
        });
        InvoiceLineItem.belongsTo(models.Transaction, {
            foreignKey: 'txnId',
            as: 'transaction'
        });
        // Line item belongs to GL account
        InvoiceLineItem.belongsTo(models.chartAccount, {
            foreignKey: 'DRglAccountId',
            as: 'DRglAccount',
        });
        // Line item belongs to GL account
        InvoiceLineItem.belongsTo(models.chartAccount, {
            foreignKey: 'CRglAccountId',
            as: 'CRglAccount',
        });


        // Line item created by user
        InvoiceLineItem.belongsTo(models.user, {
            foreignKey: 'makerId',
            as: 'maker',
        });
    };

    // Instance methods
    InvoiceLineItem.prototype.calculateSubtotal = function () {
        return parseFloat(this.quantity) * parseFloat(this.unitPrice);
    };

    InvoiceLineItem.prototype.calculateNetAmount = function () {
        const subtotal = this.calculateSubtotal();
        return subtotal - parseFloat(this.discountAmount);
    };

    InvoiceLineItem.prototype.calculateTotalWithTax = function () {
        return parseFloat(this.lineTotal);
    };

    // GL Posting methods
    InvoiceLineItem.prototype.canBePostedToGL = function () {
        return !this.isGLPosted && this.DRglAccountId && this.CRglAccountId;  // ✅ Correct field names
    };


    InvoiceLineItem.prototype.getGLEntries = function () {
        if (!this.canBePostedToGL()) return null;

        return [
            {
                glAccountId: this.DRglAccountId,  // ✅ Correct field name
                debitAmount: this.lineTotal,
                creditAmount: 0,
                description: this.description,
                reference: this.glPostingRef
            },
            {
                glAccountId: this.CRglAccountId,  // ✅ Correct field name
                debitAmount: 0,
                creditAmount: this.lineTotal,
                description: this.description,
                reference: this.glPostingRef
            }
        ];
    };

    return InvoiceLineItem;
};