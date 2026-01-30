const logger = require("../api/logger");


module.exports = (sequelize, DataTypes) => {
    const QRResponse = sequelize.define('QRResponse', {
        // Foreign Key
        qrRequestId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        
        // Response Code
        respCode: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        
        // Response Reason
        reason: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        
        // QR ID from Bank
        qrId: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        
        // QR String (Most Important!)
        qrString: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        
        // Transaction Details
        txnAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
        },
        
        txnCurrency: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        
        // Merchant Info
        merchantId: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        
        billNumber: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        
        storeLabel: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        
        terminalLabel: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        
        // Receiver Information
        receiverId: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        
        // Raw Response (Store everything from bank)
        rawResponse: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'qr_response',
    });

    QRResponse.associate = models => {
        logger.info('Associating table QRResponse with models');
        
        // QRResponse -> QRRequest (Many-to-One)
        QRResponse.belongsTo(models.QRRequest, {
            foreignKey: 'qrRequestId',
            as: 'request',
        });
    };

    return QRResponse;
};