module.exports = (sequelize, DataTypes) => {
    const LoyaltyTransaction = sequelize.define('loyalty_transaction', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        clientId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        saleHeaderId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        points: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Positive for awarded, negative for redeemed'
        },
        type: {
            type: DataTypes.ENUM('AWARDED', 'REDEEMED', 'CANCELLED', 'ADJUSTED'),
            allowNull: false,
            defaultValue: 'AWARDED'
        },
        remark: {
            type: DataTypes.STRING(255),
            allowNull: true
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
    });

    LoyaltyTransaction.associate = (models) => {
        LoyaltyTransaction.belongsTo(models.client, {
            foreignKey: 'clientId',
            as: 'client'
        });
        LoyaltyTransaction.belongsTo(models.saleHeader, {
            foreignKey: 'saleHeaderId',
            as: 'saleHeader'
        });
    };

    return LoyaltyTransaction;
};
