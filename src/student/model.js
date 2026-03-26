const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const Student = sequelize.define('student', {
        studentId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            comment: 'Official School ID Number'
        },
        firstName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        lastName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        grade: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        phoneNumber: {
            type: DataTypes.STRING,
            allowNull: true,
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

    Student.associate = models => {
        logger.info('Associating table Student with models');

        // Student -> Card (One-to-Many) 
        // A student could lose a card and get a new one, so we keep history
        Student.hasMany(models.nfcCard, {
            foreignKey: 'studentId',
            as: 'nfcCards'
        });

        // Student -> Account (One-to-One)
        // This is the "Wallet" where the balance lives
        Student.hasOne(models.bankAccount, {
            foreignKey: 'studentId',
            as: 'bankAccount'
        });
    };

    return Student;
};