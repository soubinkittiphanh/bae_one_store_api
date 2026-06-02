const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const GLPostingBatch = sequelize.define('gl_posting_batch', {
        batchNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        runDate: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        module: {
            type: DataTypes.ENUM('AR', 'AP', 'ALL', 'FA'),
            allowNull: false
        },
        totalEntriesPosted: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        totalAmountPosted: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        runByUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });



    return GLPostingBatch;
};
