module.exports = (sequelize, DataTypes) => {
    const FeeItem = sequelize.define('feeItem', {
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            comment: 'e.g. Tuition, Registration, Uniforms, Books'
        },
        description: {
            type: DataTypes.TEXT,
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

    return FeeItem;
};
