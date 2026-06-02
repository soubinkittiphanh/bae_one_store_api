module.exports = (sequelize, DataTypes) => {
    const SalePayment = sequelize.define('salePayment', {
        amount: {
            type: DataTypes.DOUBLE,
            allowNull: false,
        },
        referenceNo: {
            type: DataTypes.STRING(100),
            defaultValue: '',
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        sync: {
            alter: true,
            force: false
        }
    });

    SalePayment.associate = models => {
        SalePayment.belongsTo(models.saleHeader, {
            foreignKey: 'saleHeaderId',
            as: 'saleHeader',
        });

        SalePayment.belongsTo(models.payment, {
            foreignKey: 'paymentId',
            as: 'paymentMethod',
        });

        SalePayment.belongsTo(models.ticket, {
            foreignKey: 'ticketId',
            as: 'ticket',
        });
    };

    return SalePayment;
};
