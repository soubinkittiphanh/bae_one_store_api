module.exports = (sequelize, DataTypes) => {
    const WashJobHistory = sequelize.define('washJobHistory', {
        washJobId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        data: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        modifiedBy: {
            type: DataTypes.STRING, // optional: if you track user
        },
    }, {
        timestamps: true,
        updatedAt: false,
    });

    return WashJobHistory;
};
