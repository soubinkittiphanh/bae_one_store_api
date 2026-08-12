module.exports = (sequelize, DataTypes) => {
    const SchoolInvoiceLine = sequelize.define('schoolInvoiceLine', {
        amount: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0.00
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    SchoolInvoiceLine.associate = models => {
        SchoolInvoiceLine.belongsTo(models.schoolInvoice, {
            foreignKey: 'schoolInvoiceId',
            as: 'invoice'
        });
        SchoolInvoiceLine.belongsTo(models.feeItem, {
            foreignKey: 'feeItemId',
            as: 'feeItem'
        });
    };

    return SchoolInvoiceLine;
};
