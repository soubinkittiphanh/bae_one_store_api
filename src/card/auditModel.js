const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const CardAudit = sequelize.define('CardAudit', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        cardId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to the audited card (can be null if card is hard-deleted)'
        },
        action: {
            type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE'),
            allowNull: false
        },
        recordData: {
            type: DataTypes.JSON,
            allowNull: false,
            comment: 'Snapshot of the card record at the time of change'
        },
        reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
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
                fields: ['cardId', 'auditDate']
            },
            {
                fields: ['userId']
            },
            {
                fields: ['action']
            }
        ]
    });

    CardAudit.associate = models => {
        logger.info(`Associating table CardAudit with models`);
        
        CardAudit.belongsTo(models.card, {
            foreignKey: 'cardId',
            as: 'card'
        });

        CardAudit.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    CardAudit.createAuditRecord = async function (cardData, userId, action = 'UPDATE', reason = null, transaction = null) {
        try {
            const auditRecord = await this.create({
                cardId: cardData.id,
                action: action,
                recordData: cardData,
                userId: userId,
                reason: reason,
                auditDate: new Date()
            }, {
                transaction: transaction
            });

            return auditRecord;
        } catch (error) {
            logger.error('Failed to create card audit record:', error);
            return null;
        }
    };

    return CardAudit;
};
