
// RECEIVE HEADER MODEL

const logger = require("../../../api/logger");

// models/ReceiveHeader.js  
module.exports = (sequelize, DataTypes) => {
  const ReceiveHeader = sequelize.define('ARReceiveHeader', {
    receiptNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    bookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    receivedDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    totalReceivedAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    paymentMethod: {
      type: DataTypes.ENUM('cash', 'check', 'bank_transfer', 'credit_card', 'other'),
      allowNull: false,
      defaultValue: 'cash'
    },
    referenceNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    indexes: [
      {
        fields: ['receiptNumber']
      },
      {
        fields: ['bookingDate']
      },
      {
        fields: ['invoiceHeaderId']
      }
    ]
  });

  ReceiveHeader.associate = models => {
    logger.info(`Associating table ReceiveHeader with models`);
    ReceiveHeader.belongsTo(models.arInvoiceHeader, {
      foreignKey: 'invoiceHeaderId',
      as: 'invoiceHeader',
    });
    ReceiveHeader.belongsTo(models.user, {
      foreignKey: 'inputterId',
      as: 'inputter',
    });
    ReceiveHeader.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    ReceiveHeader.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
    ReceiveHeader.hasMany(models.arReceiveLine, {
      foreignKey: 'receiveHeaderId',
      as: 'receiveLines',
    });
  };

  return ReceiveHeader;
};
