const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const TerminalAudit = sequelize.define('TerminalAudit', {
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
            comment: 'Complete terminal record at time of change'
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
                fields: ['terminalId', 'auditDate']
            },
            {
                fields: ['userId']
            },
            {
                fields: ['action']
            }
        ]
    });

    TerminalAudit.associate = models => {
        logger.info(`Associating table TerminalAudit with models`);

        // Audit belongs to terminal
        TerminalAudit.belongsTo(models.terminal, {
            foreignKey: 'terminalId',
            as: 'terminal'
        });

        // Audit belongs to user
        TerminalAudit.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    // Helper method to create audit record
    TerminalAudit.createAuditRecord = async function (terminalData, userId, action = 'UPDATE', reason = null, transaction = null) {
        try {
            const auditRecord = await this.create({
                terminalId: terminalData.id,
                action: action,
                recordData: terminalData,
                userId: userId,
                reason: reason,
                auditDate: new Date()
            }, {
                transaction: transaction
            });

            return auditRecord;
        } catch (error) {
            logger.error('Failed to create terminal audit record:', error);
            // Don't throw error - audit shouldn't break main functionality
            return null;
        }
    };

    return TerminalAudit;
};
