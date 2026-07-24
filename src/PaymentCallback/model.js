const logger = require("../api/logger");


module.exports = (sequelize, DataTypes) => {
    const PaymentCallback = sequelize.define('PaymentCallback', {
        // Bank Institution ID
        instId: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        
        // Transaction Amount
        txnAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        
        // Bank Transaction Reference (Unique)
        txnRefId: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
        
        // Additional Info
        additionalInfo: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        
        // Payer Account Information
        paymentAccount: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        
        paymentAccountName: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        
        // Callback Dates
        callbackRegDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        
        callBackConfirmDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        
        // Transaction Status
        txnStatus: {
            type: DataTypes.STRING(10),
            allowNull: false,
        },
        
        message: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        
        // Store/Terminal
        storeLabel: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        
        terminalLabel: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        
        // Bill Number (Link to QR Request)
        billNumber: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        
        // Payment Success Flag
        isPaymentSuccess: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        
        // Raw Callback Data
        rawCallbackData: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'payment_callback',
        hooks: {
            beforeCreate: (callback) => {
                // Auto-set isPaymentSuccess based on txnStatus (1 for Indochina Bank, 000 for Lao-Viet Bank)
                callback.isPaymentSuccess = !!callback.isPaymentSuccess || callback.txnStatus === '1' || callback.txnStatus === '000';
            }
        }
    });

    PaymentCallback.associate = models => {
        logger.info('Associating table PaymentCallback with models');
        
        // PaymentCallback -> QRRequest (Many-to-One)
        PaymentCallback.belongsTo(models.QRRequest, {
            foreignKey: 'billNumber',
            targetKey: 'billNumber',
            as: 'qrRequest',
        });
    };

    return PaymentCallback;
};