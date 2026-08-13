module.exports = (sequelize, DataTypes) => {
    const SchoolRoom = sequelize.define('schoolRoom', {
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: 'e.g. Room 101, Room A'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    SchoolRoom.associate = models => {
        SchoolRoom.belongsTo(models.schoolClass, {
            foreignKey: 'classId',
            as: 'schoolClass'
        });
        SchoolRoom.hasMany(models.student, {
            foreignKey: 'roomId',
            as: 'students'
        });
    };

    return SchoolRoom;
};
