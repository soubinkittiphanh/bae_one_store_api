const logger = require("../api/logger");


module.exports = (sequelize, DataTypes) => {
    const GeneralLedger = sequelize.define('general_ledger', {
        // Model attributes are defined here

        sequenceNumber: {
            type: DataTypes.STRING,
        },
        bookingDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        postingReference: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        debit: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
        },
        credit: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        localDebit: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
        },
        localCredit: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
        },
        rate: {
            type: DataTypes.DECIMAL(15, 6),
            allowNull: false,
            defaultValue: 1.000000,
        },
        source: {
            type: DataTypes.ENUM('AR', 'AP', 'GL', 'FA'),
            allowNull: false,
            defaultValue: 'GL',
        },
        status: {
            type: DataTypes.ENUM('DRAFT', 'POSTED', 'VOID'),
            allowNull: false,
            defaultValue: 'POSTED',
        },
        glBatchId: {
            type: DataTypes.STRING(100),
            allowNull: true,
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

    // const Account = require("./chartOfAccount")(sequelize, DataTypes)
    // GeneralLedger.belongsTo(Account)
    // Account.hasMany(GeneralLedger)

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