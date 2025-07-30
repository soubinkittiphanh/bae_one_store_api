
// RECEIVE LINE MODEL

const logger = require("../../../api/logger");

// models/ReceiveLine.js
module.exports = (sequelize, DataTypes) => {
  const ReceiveLine = sequelize.define('ARReceiveLine', {
    lineNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    allocatedAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    allocationDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
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
        fields: ['receiveHeaderId', 'lineNumber']
      },
      {
        fields: ['invoiceLineId']
      }
    ]
  });

  ReceiveLine.associate = models => {
    logger.info(`Associating table ReceiveLine with models`);
    ReceiveLine.belongsTo(models.arReceiveHeader, {
      foreignKey: 'receiveHeaderId',
      as: 'receiveHeader',
    });
    ReceiveLine.belongsTo(models.arInvoiceLine, {
      foreignKey: 'invoiceLineId',
      as: 'invoiceLine',
    });
    ReceiveLine.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    ReceiveLine.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
  };

  return ReceiveLine;
};