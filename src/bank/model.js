module.exports = (sequelize, DataTypes) => {
    const Bank = sequelize.define('bank', {
        code: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
            comment: 'Short code for the bank, e.g., BCEL, LDB'
        },
        bank_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: 'Full name of the bank in Lao/English'
        },
        bank_remark: {
            type: DataTypes.STRING(200),
            allowNull: true,
            comment: 'Additional details or English name'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        config: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'JSON configuration object containing payment integration credentials'
        }
    }, {
        sequelize,
        // Enabling timestamps as per your pattern
        timestamps: true,
        createdAt: true,
        // Customizing updatedAt name as requested
        updatedAt: 'updateTimestamp',
        // Preventing Sequelize from pluralizing the table name
        freezeTableName: true,
    });

    return Bank;
};