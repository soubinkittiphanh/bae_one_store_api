module.exports = (sequelize, DataTypes) => {
    const SchoolClass = sequelize.define('schoolClass', {
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: 'e.g. Grade 1A, Grade 2'
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

    SchoolClass.associate = models => {
        SchoolClass.belongsTo(models.academicYear, {
            foreignKey: 'academicYearId',
            as: 'academicYear'
        });
        SchoolClass.hasMany(models.student, {
            foreignKey: 'classId',
            as: 'students'
        });
    };

    return SchoolClass;
};
