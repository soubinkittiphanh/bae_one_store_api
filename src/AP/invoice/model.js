// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// AP INVOICE MODEL
// models/APInvoice.js
module.exports = (sequelize, DataTypes) => {
    const APInvoice = sequelize.define('APInvoice', {
        invoiceNumber: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        vendorInvoiceNumber: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        invoiceDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT
        },
        totalAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        paidAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        exchangeRate: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 1.00
        },
        status: {
            type: DataTypes.ENUM('draft', 'pending', 'approved', 'partially_paid', 'paid', 'overdue', 'cancelled'),
            defaultValue: 'draft'
        },
        approvedAt: {
            type: DataTypes.DATE
        },
        note: {
            type: DataTypes.TEXT
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
            beforeSave: (invoice) => {
                // Remove these lines since subtotal and taxAmount don't exist in your model:
                // invoice.totalAmount = parseFloat(invoice.subtotal) + parseFloat(invoice.taxAmount);

                // Update status based on payment
                if (invoice.paidAmount >= invoice.totalAmount) {
                    invoice.status = 'paid';
                } else if (invoice.paidAmount > 0) {
                    invoice.status = 'partially_paid';
                }

                // Check for overdue
                if (invoice.dueDate < new Date() && invoice.status !== 'paid') {
                    invoice.status = 'overdue';
                }
            }
        }
    });

    APInvoice.associate = models => {
        logger.info(`Associating table APInvoice with models`);

        // Invoice belongs to vendor
        APInvoice.belongsTo(models.vendor, {
            foreignKey: 'vendorId',
            as: 'vendor',
        });

        // Invoice belongs to currency
        APInvoice.belongsTo(models.currency, {
            foreignKey: 'currencyId',
            as: 'currency',
        });

        // Invoice created by user (maker)
        APInvoice.belongsTo(models.user, {
            foreignKey: 'makerId',
            as: 'maker',
        });

        // Invoice approved by user (checker)
        APInvoice.belongsTo(models.user, {
            foreignKey: 'checkerId',
            as: 'checker',
        });

        // Invoice -> InvoiceLineItem (One-to-Many)
        APInvoice.hasMany(models.invoiceLineItem, {
            foreignKey: 'invoiceId',
            as: 'lineItems',
        });

        // Invoice -> PaymentSettlement (One-to-Many)
        APInvoice.hasMany(models.apInvoiceSettlement, {
            foreignKey: 'invoiceId',
            as: 'settlements',
        });
    };

    // Instance methods
    APInvoice.prototype.getOutstandingAmount = function () {
        return parseFloat(this.totalAmount) - parseFloat(this.paidAmount);
    };

    APInvoice.prototype.isOverdue = function () {
        return new Date() > this.dueDate && this.status !== 'paid';
    };

    APInvoice.prototype.canBePaid = function () {
        return ['approved', 'partially_paid', 'overdue'].includes(this.status);
    };

    return APInvoice;
};