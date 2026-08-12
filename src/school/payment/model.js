module.exports = (sequelize, DataTypes) => {
    const SchoolPayment = sequelize.define('schoolPayment', {
        amount: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        referenceNo: {
            type: DataTypes.STRING(100),
            defaultValue: ''
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    SchoolPayment.associate = models => {
        SchoolPayment.belongsTo(models.schoolInvoice, {
            foreignKey: 'schoolInvoiceId',
            as: 'invoice'
        });
        SchoolPayment.belongsTo(models.payment, {
            foreignKey: 'paymentMethodId',
            as: 'paymentMethod'
        });
        SchoolPayment.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'cashier'
        });
        SchoolPayment.belongsTo(models.cashierShift, {
            foreignKey: 'cashierShiftId',
            as: 'shift'
        });
    };

    return SchoolPayment;
};
