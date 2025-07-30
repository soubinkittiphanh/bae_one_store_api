
// INVOICE LINE MODEL  

const logger = require("../../../api/logger");

// models/InvoiceLine.js
module.exports = (sequelize, DataTypes) => {
  const InvoiceLine = sequelize.define('ARInvoiceLine', {
    lineNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 1.00
    },
    unitPrice: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    lineTotal: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    taxRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    taxAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    indexes: [
      {
        fields: ['invoiceHeaderId', 'lineNumber']
      }
    ]
  });

  InvoiceLine.associate = models => {
    logger.info(`Associating table InvoiceLine with models`);
    InvoiceLine.belongsTo(models.arInvoiceHeader, {
      foreignKey: 'invoiceHeaderId',
      as: 'invoiceHeader',
    });
    InvoiceLine.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    InvoiceLine.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
    InvoiceLine.hasMany(models.arReceiveLine, {
      foreignKey: 'invoiceLineId',
      as: 'receiveLines',
    });
  };

  return InvoiceLine;
};
