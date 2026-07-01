module.exports = (sequelize, DataTypes) => {
    const Project = sequelize.define('Project', {
        code: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        nameLo: {
            type: DataTypes.STRING(255),
            allowNull: false,
            field: 'name_lo'
        },
        nameEn: {
            type: DataTypes.STRING(255),
            field: 'name_en'
        },
        description: {
            type: DataTypes.TEXT
        },
        donor: {
            type: DataTypes.STRING(100),
            defaultValue: 'ADB'
        },
        totalBudget: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'total_budget'
        },
        counterpartRatio: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0.00,
            field: 'counterpart_ratio'
        },
        status: {
            type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'SUSPENDED'),
            defaultValue: 'ACTIVE'
        }
    }, {
        sequelize,
        tableName: 'pwt_projects',
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    Project.associate = models => {
        Project.belongsTo(models.currency, {
            foreignKey: 'currencyId',
            as: 'currency'
        });
        Project.hasMany(models.ProjectBudget, {
            foreignKey: 'projectId',
            as: 'budgets'
        });
        Project.hasMany(models.ProjectContract, {
            foreignKey: 'projectId',
            as: 'contracts'
        });
    };

    return Project;
};
