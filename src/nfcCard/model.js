const logger = require("../api/logger");


module.exports = (sequelize, DataTypes) => {
    const NfcCard = sequelize.define('nfcCard', {
        cardUid: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            comment: 'The Hex or Decimal UID from the ACR122U reader'
        },
        cardStatus: {
            type: DataTypes.ENUM('ACTIVE', 'LOST', 'INACTIVE'),
            allowNull: false,
            defaultValue: 'ACTIVE'
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
        indexes: [
            {
                unique: true,
                fields: ['cardUid']
            }
        ]
    });

    NfcCard.associate = models => {
        logger.info('Associating table NfcCard with models');

        // Card -> Student (Many-to-One)
        NfcCard.belongsTo(models.student, {
            foreignKey: 'studentId',
            as: 'student'
        });
    };

    return NfcCard;
};