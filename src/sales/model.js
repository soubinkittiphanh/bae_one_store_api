

module.exports = (sequelize, DataTypes) => {
    const SaleHeader = sequelize.define('saleHeader', {
        bookingDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        referenceNo: {
            type: DataTypes.STRING(100),
            defaultValue: '',
        },
        remark: {
            type: DataTypes.STRING(100),
            allowNull: false,
            defaultValue: 1,
        },
        discount: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
        },
        total: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
        },
        exchangeRate: {
            type: DataTypes.DOUBLE,
            defaultValue: 1,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
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
        sync: {
            alter: false,
            force: false
        }
    })

    SaleHeader.associate = models => {
        // SaleHeader.hasMany(models.saleLine, {
        //     foreignKey: 'saleHeaderId',
        //     as: 'saleLines',
        // });
        // Sale header associations
        SaleHeader.belongsTo(models.payment, { foreignKey: 'paymentId', as: 'payment' });
        SaleHeader.belongsTo(models.client, { foreignKey: 'clientId', as: 'client' });
        SaleHeader.belongsTo(models.currency, { foreignKey: 'currencyId', as: 'currency' });
        SaleHeader.belongsTo(models.user, { foreignKey: 'userId', as: 'user' });
        SaleHeader.belongsTo(models.location, { foreignKey: 'locationId', as: 'location' });
        SaleHeader.belongsTo(models.orderTable, { foreignKey: 'orderTableId', as: 'orderTable' });
        SaleHeader.belongsTo(models.washjob, { foreignKey: 'washJobId', as: 'washJob' });
        SaleHeader.belongsTo(models.customer, { foreignKey: 'customerId', as: 'customer' });
        SaleHeader.belongsTo(models.QRRequest, { foreignKey: 'qrRequestId', as: 'qrRequest' });
        SaleHeader.hasMany(models.saleLine, { as: 'lines' });
        SaleHeader.belongsTo(models.ticket, {
            foreignKey: 'ticketId',
            as: 'ticket',
        });
        SaleHeader.hasOne(models.customer);
        SaleHeader.hasMany(models.salePayment, {
            foreignKey: 'saleHeaderId',
            as: 'payments',
        });

        // Optional: Link back to ticket for reference

    };


    return SaleHeader;
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