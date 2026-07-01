module.exports = (sequelize, DataTypes) => {
    const ProjectContract = sequelize.define('ProjectContract', {
        contractNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            field: 'contract_number'
        },
        contractorName: {
            type: DataTypes.STRING(255),
            allowNull: false,
            field: 'contractor_name'
        },
        totalValue: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'total_value'
        },
        committedValue: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'committed_value'
        },
        spentValue: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'spent_value'
        },
        retentionRate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 10.00,
            field: 'retention_rate'
        },
        status: {
            type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'TERMINATED'),
            defaultValue: 'ACTIVE'
        }
    }, {
        sequelize,
        tableName: 'pwt_project_contracts',
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    ProjectContract.associate = models => {
        ProjectContract.belongsTo(models.Project, {
            foreignKey: 'projectId',
            as: 'project'
        });
        ProjectContract.belongsTo(models.currency, {
            foreignKey: 'currencyId',
            as: 'currency'
        });
        ProjectContract.hasMany(models.ProjectInvoice, {
            foreignKey: 'contractId',
            as: 'invoices'
        });
    };

    return ProjectContract;
};
