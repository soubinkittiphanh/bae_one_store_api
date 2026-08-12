module.exports = (sequelize, DataTypes) => {
    const AcademicYear = sequelize.define('academicYear', {
        name: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
            comment: 'e.g. 2026-2027'
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
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

    return AcademicYear;
};
