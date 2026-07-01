module.exports = (sequelize, DataTypes) => {
    const WithdrawalApplication = sequelize.define('WithdrawalApplication', {
        waNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            field: 'wa_number'
        },
        waDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: 'wa_date'
        },
        amount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        status: {
            type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'DISBURSED', 'REJECTED'),
            defaultValue: 'DRAFT'
        }
    }, {
        sequelize,
        tableName: 'pwt_withdrawal_applications',
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    WithdrawalApplication.associate = models => {
        WithdrawalApplication.belongsTo(models.Project, {
            foreignKey: 'projectId',
            as: 'project'
        });
        WithdrawalApplication.hasMany(models.ProjectInvoice, {
            foreignKey: 'withdrawalApplicationId',
            as: 'invoices'
        });
    };

    return WithdrawalApplication;
};
