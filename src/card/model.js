const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const Card = sequelize.define('card', {
        card_type_code: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        cost: {
            type: DataTypes.DOUBLE,
            allowNull: false,
        },
        costLCY: {
            type: DataTypes.DOUBLE,
            defaultValue: 1
        },
        exchangeRate: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 1
        },
        card_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        card_isused: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        locking_session_id: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        card_input_date: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.NOW,
        },
        inputter: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        update_user: {
            type: DataTypes.INTEGER,
        },
        update_time: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.NOW,
        },
        update_time_new: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.NOW,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },

        // NEW FIELDS ADDED
        lotNumber: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Batch/Lot identification number'
        },
        // NEW FIELDS ADDED
        serialNo: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Serial identification number'
        },
        expiryDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            comment: 'Product expiry date'
        },
        hasExpiry: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Indicates if this stock item has expiry date tracking'
        },
        hasLot: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Indicates if this stock item has lot number tracking'
        },
        costPerUnit: {
            type: DataTypes.DOUBLE,
            allowNull: true,
            comment: 'Cost per individual unit'
        },
        totalCost: {
            type: DataTypes.DOUBLE,
            allowNull: true,
            comment: 'Total cost for this stock entry'
        },
        costType: {
            type: DataTypes.ENUM('perUnit', 'total'),
            allowNull: true,
            defaultValue: 'perUnit',
            comment: 'How the cost was calculated (per unit or total)'
        },
        stockCardQty: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 1,
            comment: 'Quantity of items in this stock card'
        },
        srcLocationId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Source location ID for this stock'
        },
        currencyId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Currency ID for cost calculation'
        },

        // FOREIGN KEY FIELDS FOR ASSOCIATIONS
        colorId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to Color table'
        },
        sizeId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to Size table'
        },
        saleLineId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to SaleLine table'
        },
        ticketLineId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to TicketLine table'
        },
        transferLineId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to TransferLine table'
        },
        receivingLineId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to ReceivingLine table'
        },
        locationId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to Location table'
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Reference to Product table (alternative to product_id)'
        },

        // COMPUTED FIELDS (can be added as virtual or calculated)
        isExpired: {
            type: DataTypes.VIRTUAL,
            get() {
                if (!this.expiryDate) return false;
                return new Date(this.expiryDate) < new Date();
            }
        },
        daysUntilExpiry: {
            type: DataTypes.VIRTUAL,
            get() {
                if (!this.expiryDate) return null;
                const today = new Date();
                const expiry = new Date(this.expiryDate);
                const diffTime = expiry.getTime() - today.getTime();
                return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        // Add indexes for better performance
        indexes: [
            {
                name: 'idx_card_expiry_date',
                fields: ['expiryDate']
            },
            {
                name: 'idx_card_lot_number',
                fields: ['lotNumber']
            },
            {
                name: 'idx_card_serial_number',
                fields: ['serialNo']
            },
            {
                name: 'idx_card_product_lot',
                fields: ['product_id', 'lotNumber']
            },
            {
                name: 'idx_card_product_serial',
                fields: ['product_id', 'serialNo']
            },
            {
                name: 'idx_card_expired_items',
                fields: ['expiryDate', 'isActive']
            },
            {
                name: 'idx_card_color',
                fields: ['colorId']
            },
            {
                name: 'idx_card_size',
                fields: ['sizeId']
            },
            {
                name: 'idx_card_color_size',
                fields: ['colorId', 'sizeId']
            }
        ],

        // Add scopes for common queries
        scopes: {
            active: {
                where: {
                    isActive: true
                }
            },
            expired: {
                where: {
                    expiryDate: {
                        [sequelize.Sequelize.Op.lt]: new Date()
                    },
                    isActive: true
                }
            },
            expiringSoon: {
                where: {
                    expiryDate: {
                        [sequelize.Sequelize.Op.between]: [
                            new Date(),
                            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                        ]
                    },
                    isActive: true
                }
            },
            withLot: {
                where: {
                    hasLot: true,
                    isActive: true
                }
            },
            withColor: {
                where: {
                    colorId: {
                        [sequelize.Sequelize.Op.ne]: null
                    },
                    isActive: true
                }
            },
            withSize: {
                where: {
                    sizeId: {
                        [sequelize.Sequelize.Op.ne]: null
                    },
                    isActive: true
                }
            }
        }
    });

    Card.associate = models => {
        logger.info('Associating table Card with models');

        // Card associations
        if (models.Color) {
            Card.belongsTo(models.Color, {
                foreignKey: 'colorId',
                as: 'color'
            });
        }
        
        if (models.Size) {
            Card.belongsTo(models.Size, {
                foreignKey: 'sizeId',
                as: 'size'
            });
        }
        
        if (models.saleLine) {
            Card.belongsTo(models.saleLine, {
                foreignKey: 'saleLineId',
                as: 'saleLine'
            });
        }
        
        if (models.ticketLine) {
            Card.belongsTo(models.ticketLine, {
                foreignKey: 'ticketLineId',
                as: 'ticketLine'
            });
        }
        
        if (models.transferLine) {
            Card.belongsTo(models.transferLine, {
                foreignKey: 'transferLineId',
                as: 'transferLine'
            });
        }
        
        if (models.receivingLine) {
            Card.belongsTo(models.receivingLine, {
                foreignKey: 'receivingLineId',
                as: 'receivingLine'
            });
        }
        
        if (models.location) {
            Card.belongsTo(models.location, {
                foreignKey: 'locationId',
                as: 'location'
            });
        }
        
        if (models.product) {
            Card.belongsTo(models.product, {
                foreignKey: 'productId',
                as: 'product'
            });
        }
        
        if (models.currency) {
            Card.belongsTo(models.currency, {
                foreignKey: 'currencyId',
                as: 'currency'
            });
        }
        
        if (models.user) {
            Card.belongsTo(models.user, {
                foreignKey: 'inputter',
                as: 'creator'
            });
        }
    };

    return Card;
};