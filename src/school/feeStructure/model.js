module.exports = (sequelize, DataTypes) => {
    const FeeStructure = sequelize.define('feeStructure', {
        amount: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0.00
        },
        isOptional: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
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

    FeeStructure.associate = models => {
        FeeStructure.belongsTo(models.feeItem, {
            foreignKey: 'feeItemId',
            as: 'feeItem'
        });
        FeeStructure.belongsTo(models.schoolClass, {
            foreignKey: 'classId',
            as: 'schoolClass'
        });
        FeeStructure.belongsTo(models.academicYear, {
            foreignKey: 'academicYearId',
            as: 'academicYear'
        });
    };

    return FeeStructure;
};
