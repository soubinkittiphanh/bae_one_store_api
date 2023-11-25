

module.exports = (sequelize, DataTypes) => {
    const OrderHIS = sequelize.define('orders_history', {
        bookingDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        note: {
            type: DataTypes.STRING,
        },
        trackingNumber: {
            type: DataTypes.STRING,
        },
        link: {
            type: DataTypes.STRING,
        },
        price: {
            type: DataTypes.DOUBLE,
            defaultValue: 0
        },
        priceRate: {
            type: DataTypes.DOUBLE,
            defaultValue: 1
        },
        shippingFee: {
            type: DataTypes.DOUBLE,
            defaultValue: 0
        },
        shippingRate: {
            type: DataTypes.DOUBLE,
            defaultValue: 1
        },
        status: {
            allowNull: false,
            type: DataTypes.ENUM('ORDERED', 'RECEIVED', 'INVOICED',),
            defaultValue: 'ORDERED'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
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
    return OrderHIS;
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