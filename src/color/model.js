const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const Color = sequelize.define('color', {
        color_name: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
            comment: 'Color name (e.g., Red, Blue, Green)'
        },
        color_code: {
            type: DataTypes.STRING(10),
            allowNull: false,
            unique: true,
            comment: 'Short code for color (e.g., RED, BLU, GRN)'
        },
        hex_code: {
            type: DataTypes.STRING(7),
            allowNull: true,
            comment: 'Hex color code (e.g., #FF0000 for red)'
        },
        rgb_code: {
            type: DataTypes.STRING(20),
            allowNull: true,
            comment: 'RGB color code (e.g., 255,0,0 for red)'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Additional description for the color'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: 'Indicates if this color is active'
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
                name: 'idx_color_active',
                fields: ['isActive']
            },
            {
                name: 'idx_color_name',
                fields: ['color_name']
            }
        ],

        // Add scopes for common queries
        scopes: {
            active: {
                where: {
                    isActive: true
                },
                order: [['color_name', 'ASC']]
            }
        }
    });

    Color.associate = models => {
        logger.info('Associating table Color with models');
        
        // Color has many Cards
        if (models.card) {
            Color.hasMany(models.card, {
                foreignKey: 'colorId',
                as: 'cards'
            });
        }
    };

    return Color;
};