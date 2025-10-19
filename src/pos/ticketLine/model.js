

module.exports = (sequelize, DataTypes) => {
    const TicketLine = sequelize.define('ticketLine', {

        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 1
            }
        },
        unitPrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        totalPrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        specialInstructions: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('ordered', 'preparing', 'ready', 'served'),
            defaultValue: 'ordered'
        },
        is_promotion_item: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Whether this line item is a promotional item (free/discounted)'
        },
        original_price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: 'Original price before promotion discount'
        },
        discount_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
            comment: 'Amount discounted due to promotion'
        },
        promotion_note: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Note about the promotion applied'
        }
    }, {
        sequelize,
        // don't forget to enable timestamps!
        timestamps: true,
        // I don't want createdAt
        createdAt: true,
        // I want updatedAt to actually be called updateTimestamp
        updatedAt: 'updateTimestamp',
        // disable the modification of table names; By default, sequelize will automatically
        // transform all passed model names (first parameter of define) into plural.
        // if you don't want that, set the following
        freezeTableName: true,
    });

    TicketLine.associate = models => {

        TicketLine.belongsTo(models.ticket, {
            foreignKey: 'ticketId',
            as: 'ticket',
        });
        TicketLine.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product',
        });
        TicketLine.belongsTo(models.promotion, {
            foreignKey: 'promotionId',
            as: 'promotion',
        });
    };

    return TicketLine;
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