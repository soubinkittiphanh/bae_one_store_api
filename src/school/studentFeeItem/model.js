module.exports = (sequelize, DataTypes) => {
    const StudentFeeItem = sequelize.define('studentFeeItem', {
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

    StudentFeeItem.associate = models => {
        StudentFeeItem.belongsTo(models.student, {
            foreignKey: 'studentId',
            as: 'student'
        });
        StudentFeeItem.belongsTo(models.feeItem, {
            foreignKey: 'feeItemId',
            as: 'feeItem'
        });
    };

    return StudentFeeItem;
};
