module.exports = (sequelize, DataTypes) => {
    const DashboardMenu = sequelize.define('dashboardMenu', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        llname: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        path: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        icon: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'cashier_2.svg'
        },
        iconType: {
            type: DataTypes.ENUM('svg', 'mdi'),
            allowNull: false,
            defaultValue: 'svg'
        },
        color: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        badge: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        target_systems: {
            type: DataTypes.STRING,
            defaultValue: 'ALL',
        },
        userGroupId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
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
        tableName: 'dashboard_menus'
    });

    DashboardMenu.associate = (models) => {
        if (models.user) {
            DashboardMenu.belongsTo(models.user, { foreignKey: 'userId', as: 'user' });
        }
        if (models.group) {
            DashboardMenu.belongsTo(models.group, { foreignKey: 'userGroupId', as: 'group' });
        }
    };

    return DashboardMenu;
};
