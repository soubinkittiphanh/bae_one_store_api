const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const Size = sequelize.define('size', {
        size_name: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
            comment: 'Size name (e.g., XS, S, M, L, XL, XXL)'
        },
        size_code: {
            type: DataTypes.STRING(10),
            allowNull: false,
            unique: true,
            comment: 'Short code for size (e.g., XS, S, M, L, XL)'
        },
        size_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Order for sorting sizes'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Additional description for the size'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: 'Indicates if this size is active'
        },
        inputter: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'User who created this record'
        },
        update_user: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'User who last updated this record'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        freezeTableName: true,
        
        // Add indexes for better performance
        indexes: [
            {
                name: 'idx_size_active',
                fields: ['isActive']
            },
            {
                name: 'idx_size_order',
                fields: ['size_order', 'isActive']
            }
        ],

        // Add scopes for common queries
        scopes: {
            active: {
                where: {
                    isActive: true
                },
                order: [['size_order', 'ASC']]
            }
        }
    });

    Size.associate = models => {
        logger.info('Associating table Size with models');
        
        // Size has many Cards
        if (models.card) {
            Size.hasMany(models.card, {
                foreignKey: 'sizeId',
                as: 'cards'
            });
        }
    };

    return Size;
};