module.exports = (sequelize, DataTypes) => {
    const ProjectInvoice = sequelize.define('ProjectInvoice', {
        invoiceNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
            field: 'invoice_number'
        },
        claimNumber: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'claim_number'
        },
        invoiceDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: 'invoice_date'
        },
        grossAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'gross_amount'
        },
        retentionAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'retention_amount'
        },
        netAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'net_amount'
        },
        adbFundingAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'adb_funding_amount'
        },
        counterpartFundingAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'counterpart_funding_amount'
        },
        status: {
            type: DataTypes.ENUM('DRAFT', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED'),
            defaultValue: 'DRAFT'
        }
    }, {
        sequelize,
        tableName: 'pwt_project_invoices',
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    ProjectInvoice.associate = models => {
        ProjectInvoice.belongsTo(models.ProjectContract, {
            foreignKey: 'contractId',
            as: 'contract'
        });
        ProjectInvoice.belongsTo(models.WithdrawalApplication, {
            foreignKey: 'withdrawalApplicationId',
            as: 'withdrawalApplication'
        });
    };

    return ProjectInvoice;
};
