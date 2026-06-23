module.exports = (sequelize, DataTypes) => {
    const ShippingOrder = sequelize.define('shipping_order', {
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
        currency_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null,
            references: {
                model: 'currency',
                key: 'id'
            }
        },
        barcode: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        final_price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            defaultValue: null
        },
        status: {
            type: DataTypes.ENUM('PENDING', 'ARRIVED', 'COMPLETED'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        arrived_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        picked_up_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        checkout_batch_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null,
            references: {
                model: 'shipping_checkout_batches',
                key: 'id'
            }
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'shipping_orders'
    });

    return ShippingOrder;
};
