const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const CurrencyAudit = sequelize.define('CurrencyAudit', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // Basic audit information
        action: {
            type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE'),
            allowNull: false,
            defaultValue: 'UPDATE'
        },
        // Store the complete record as JSON
        recordData: {
            type: DataTypes.JSON,
            allowNull: false,
            comment: 'Complete currency record at time of change'
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
        timestamps: false,
        freezeTableName: true,
        indexes: [
            {
                fields: ['currencyId', 'auditDate']
            },
            {
                fields: ['userId']
            },
            {
                fields: ['action']
            }
        ]
    });

    CurrencyAudit.associate = models => {
        logger.info(`Associating table CurrencyAudit with models`);
        
        // Audit belongs to currency
        CurrencyAudit.belongsTo(models.currency, {
            foreignKey: 'currencyId',
            as: 'currency'
        });

        // Audit belongs to user
        CurrencyAudit.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    // Helper method to create audit record
    CurrencyAudit.createAuditRecord = async function (currencyData, userId, action = 'UPDATE', reason = null, transaction = null) {
        try {
            const auditRecord = await this.create({
                currencyId: currencyData.id,
                action: action,
                recordData: currencyData,
                userId: userId,
                reason: reason,
                auditDate: new Date()
            }, {
                transaction: transaction
            });

            return auditRecord;
        } catch (error) {
            logger.error('Failed to create currency audit record:', error);
            // Don't throw error - audit shouldn't break main functionality
            return null;
        }
    };

    return CurrencyAudit;
};
