const logger = require("../../api/logger");


module.exports = (sequelize, DataTypes) => {
    const SaleLine = sequelize.define('saleLine', {
        quantity: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 1,
        },
        unitRate: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 1,
        },
        taxRate: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0,
        },
        taxAmount: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0,
        },
        taxType: {
            type: DataTypes.ENUM('INC', 'EXC'),
            allowNull: false,
            defaultValue: 'INC'
        },
        exchangeRate: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 1,
        },
        price: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0,
        },
        discount: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
        },
        total: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
        },

        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        isGift: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
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
    })
    // Corrected SaleLine associations
    SaleLine.associate = models => {
        logger.info('Associating table SaleLine with models');

        // SaleLine -> SaleHeader (Many-to-One)
        SaleLine.belongsTo(models.saleHeader, {
            foreignKey: 'headerId',
            as: 'header',
        });

        // SaleLine -> Currency (Many-to-One)
        SaleLine.belongsTo(models.currency, {
            foreignKey: 'currencyId',
            as: 'currency',
        });

        // SaleLine -> Product (Many-to-One)
        SaleLine.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product'
        });

        // SaleLine -> Unit (Many-to-One)
        SaleLine.belongsTo(models.unit, {
            foreignKey: 'unitId',
            as: 'unit'
        });

        // SaleLine -> PriceList (Many-to-One)
        SaleLine.belongsTo(models.priceList, {
            foreignKey: 'priceListId',
            as: 'priceList'
        });

        // SaleLine -> Card (One-to-Many)
        // Note: This assumes SaleLine has multiple cards
        // If it's Many-to-One, change to belongsTo
        SaleLine.hasMany(models.card, {
            foreignKey: 'saleLineId', // Add the foreign key that exists in card table
            as: 'cards'
        });
    };

    return SaleLine;
};

// 1. STRING: A variable length string.
// 2. CHAR: A fixed length string.
// 3. TEXT: A long string.
// 4. INTEGER: A 32-bit integer.
// 5. BIGINT: A 64-bit integer.
// 6. FLOAT: A floating point number.
// 7. DOUBLE: A double floating point number.
// 8. DECIMAL: A fixed-point decimal number.
// 9. BOOLEAN: A boolean value.
// 10. DATE: A date object.
// 11. DATEONLY: A date object without time.
// 12. TIME: A time object.
// 13. UUID: A universally unique identifier.
// 14. ENUM: A value from a predefined list of values.
// 15. ARRAY: An array of values.
// 16. JSON: A JSON object.
// 17. JSONB: A JSON object stored as a binary format.