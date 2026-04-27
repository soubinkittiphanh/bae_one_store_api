const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const ClientAudit = sequelize.define('ClientAudit', {
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
            comment: 'Complete client record at time of change'
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
                fields: ['clientId', 'auditDate']
            },
            {
                fields: ['userId']
            },
            {
                fields: ['action']
            }
        ]
    });

    ClientAudit.associate = models => {
        logger.info(`Associating table ClientAudit with models`);

        // Audit belongs to client
        ClientAudit.belongsTo(models.client, {
            foreignKey: 'clientId',
            as: 'client'
        });

        // Audit belongs to user
        ClientAudit.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    // Helper method to create audit record
    ClientAudit.createAuditRecord = async function (clientData, userId, action = 'UPDATE', reason = null, transaction = null) {
        try {
            const auditRecord = await this.create({
                clientId: clientData.id,
                action: action,
                recordData: clientData,
                userId: userId,
                reason: reason,
                auditDate: new Date()
            }, {
                transaction: transaction
            });

            return auditRecord;
        } catch (error) {
            logger.error('Failed to create client audit record:', error);
            // Don't throw error - audit shouldn't break main functionality
            return null;
        }
    };

    return ClientAudit;
};
