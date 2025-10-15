// ===============================================================
// SIMPLE AUDIT TRAIL MODEL
// ===============================================================
const logger = require("../../api/logger");

// models/APInvoiceAudit.js
module.exports = (sequelize, DataTypes) => {
    const APInvoiceAudit = sequelize.define('APInvoiceAudit', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        
        // Basic audit information
        action: {
            type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT'),
            allowNull: false,
            defaultValue: 'UPDATE'
        },
        
        // Store the complete record as JSON
        recordData: {
            type: DataTypes.JSON,
            allowNull: false,
            comment: 'Complete invoice record at time of change'
        },
        
        // Optional reason for change
        reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        
        // Who made the change
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        
        // When the change was made
        auditDate: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
        
    }, {
        sequelize,
        timestamps: false, // We handle our own timestamp
        freezeTableName: true,
        indexes: [
            {
                fields: ['invoiceId', 'auditDate']
            },
            {
                fields: ['userId']
            },
            {
                fields: ['action']
            }
        ]
    });

    APInvoiceAudit.associate = models => {
        logger.info(`Associating table APInvoiceAudit with models`);

        // Audit belongs to invoice
        APInvoiceAudit.belongsTo(models.apInvoice, {
            foreignKey: 'invoiceId',
            as: 'invoice'
        });

        // Audit belongs to user
        APInvoiceAudit.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    // Simple method to create audit record
    APInvoiceAudit.createAuditRecord = async function(invoiceData, userId, action = 'UPDATE', reason = null) {
        try {
            return await this.create({
                invoiceId: invoiceData.id,
                action: action,
                recordData: invoiceData,
                reason: reason,
                userId: userId,
                auditDate: new Date()
            });
        } catch (error) {
            logger.error('Failed to create audit record:', error);
            // Don't throw error - audit shouldn't break main functionality
        }
    };

    return APInvoiceAudit;
};
