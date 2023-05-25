const logger = require("../../api/logger");
module.exports = (sequelize, DataTypes) => {
    const GeneralLedger = sequelize.define('general_ledger', {
        // Model attributes are defined here
        accountNumber: {
            type: DataTypes.INTEGER,
            allowNull: false,
            // unique: true
        },
        bookingDate: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        postingReference: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        debit: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00,
        },
        credit: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        descriptionLL: {
            type: DataTypes.STRING,
            // allowNull: true,
        },
        currency: {
            type: DataTypes.STRING(3), // use ISO 4217 currency codes (e.g. USD, EUR, GBP)
            allowNull: false,
            defaultValue: 'LAK', // set a default currency if needed
        }, rate: {
            type: DataTypes.DECIMAL(10, 4),
            allowNull: false,
            defaultValue: 1.0000, // set a default rate if needed
        },
        source: {
            type: DataTypes.ENUM('AR', 'AP', 'GL'), // use ENUM to limit the possible values
            allowNull: false,
            defaultValue: 'GL', // set a default value if needed
        },
    }, {
        sequelize,
        // don't forget to enable timestamps!
        timestamps: true,
        // I don't want createdAt
        createdAt: true,
        // I want updatedAt to actually be called updateTimestamp
        updatedAt: 'updateTimestamp'
    })
    logger.info(GeneralLedger === sequelize.models.GeneralLedger); // true
    return GeneralLedger;
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