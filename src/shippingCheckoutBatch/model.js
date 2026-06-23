module.exports = (sequelize, DataTypes) => {
    const ShippingCheckoutBatch = sequelize.define('shipping_checkout_batch', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        customer_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'client',
                key: 'id'
            }
        },
        total_price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'shipping_checkout_batches'
    });

    return ShippingCheckoutBatch;
};
