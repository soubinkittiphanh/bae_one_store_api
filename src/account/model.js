module.exports = (sequelize, DataTypes) => {
    const ChartOfAccount = sequelize.define('chart_of_account', {
        accountNumber: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        accountName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        accountLLName: {
            type: DataTypes.STRING,
        },
        accountType: {
            type: DataTypes.ENUM('Asset', 'Liability', 'Equity', 'Revenue', 'Expense'),
            allowNull: false
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        }
    }, {
        sequelize,

        // don't forget to enable timestamps!
        timestamps: true,

        // I don't want createdAt
        createdAt: true,

        // I want updatedAt to actually be called updateTimestamp
        updatedAt: 'updateTimestamp',
        // disable the modification of tablenames; By default, sequelize will automatically
        // transform all passed model names (first parameter of define) into plural.
        // if you don't want that, set the following
        freezeTableName: true,
    });
    return ChartOfAccount
}