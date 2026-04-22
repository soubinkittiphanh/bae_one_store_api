module.exports = (sequelize, DataTypes) => {
    const BusinessDate = sequelize.define('businessDate', {
        currentDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            unique: true
        },
        lastWorkingDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('OPEN', 'CLOSED'),
            allowNull: false,
            defaultValue: 'OPEN'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
    });

    return BusinessDate;
};
