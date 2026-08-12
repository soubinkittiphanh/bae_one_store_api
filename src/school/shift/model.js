module.exports = (sequelize, DataTypes) => {
    const CashierShift = sequelize.define('cashierShift', {
        status: {
            type: DataTypes.ENUM('OPEN', 'CLOSED'),
            allowNull: false,
            defaultValue: 'OPEN'
        },
        openTime: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        closeTime: {
            type: DataTypes.DATE,
            allowNull: true
        },
        openingCash: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0.00
        },
        closingCash: {
            type: DataTypes.DOUBLE,
            allowNull: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    CashierShift.associate = models => {
        CashierShift.belongsTo(models.user, {
            foreignKey: 'userId',
            as: 'user'
        });
        CashierShift.hasMany(models.schoolPayment, {
            foreignKey: 'cashierShiftId',
            as: 'payments'
        });
    };

    return CashierShift;
};
