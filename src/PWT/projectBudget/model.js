module.exports = (sequelize, DataTypes) => {
    const ProjectBudget = sequelize.define('ProjectBudget', {
        categoryName: {
            type: DataTypes.STRING(150),
            allowNull: false,
            field: 'category_name'
        },
        allocatedAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'allocated_amount'
        },
        committedAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'committed_amount'
        },
        spentAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'spent_amount'
        }
    }, {
        sequelize,
        tableName: 'pwt_project_budgets',
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    ProjectBudget.associate = models => {
        ProjectBudget.belongsTo(models.Project, {
            foreignKey: 'projectId',
            as: 'project'
        });
    };

    return ProjectBudget;
};
