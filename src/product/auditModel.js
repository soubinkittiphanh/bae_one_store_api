const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const ProductAudit = sequelize.define('ProductAudit', {
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
            comment: 'Complete product record at time of change'
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
                fields: ['productId', 'auditDate']
            },
            {
                fields: ['userId']
            },
            {
                fields: ['action']
            }
        ]
    });

    ProductAudit.associate = models => {
        logger.info(`Associating table ProductAudit with models`);
        
        // Audit belongs to product
        ProductAudit.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product'
        });

        // Audit belongs to user
        ProductAudit.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    // Helper method to create audit record
    ProductAudit.createAuditRecord = async function (productData, userId, action = 'UPDATE', reason = null, transaction = null) {
        try {
            const auditRecord = await this.create({
                productId: productData.id,
                action: action,
                recordData: productData,
                userId: userId,
                reason: reason,
                auditDate: new Date()
            }, {
                transaction: transaction
            });

            return auditRecord;
        } catch (error) {
            logger.error('Failed to create product audit record:', error);
            // Don't throw error - audit shouldn't break main functionality
            return null;
        }
    };

    return ProductAudit;
};
