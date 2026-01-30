const logger = require("../api/logger");

module.exports = (sequelize, DataTypes) => {
    const QRRequest = sequelize.define('QRRequest', {
        // Member Information
        memberId: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        
        // Transaction Amount
        txnAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        
        // Purpose
        purposeOfTxn: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        
        // Bill Number (Unique)
        billNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
        
        // Merchant Information
        merchantId: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        
        storeLabel: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        
        terminalLabel: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        
        // DateTime
        memberDateTime: {
            type: DataTypes.STRING(14),
            allowNull: false,
        },
        
        // Callback URL
        callbackUrl: {
            type: DataTypes.STRING(500),
            allowNull: false,
        },
        
        // Status
        requestStatus: {
            type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'qr_request',
    });

    QRRequest.associate = models => {
        logger.info('Associating table QRRequest with models');
        
        // QRRequest -> QRResponse (One-to-One)
        QRRequest.hasOne(models.QRResponse, {
            foreignKey: 'qrRequestId',
            as: 'response',
        });
    };

    return QRRequest;
};