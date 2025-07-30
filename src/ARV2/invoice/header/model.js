// ===============================================================
// AR ACCOUNTING MODELS - SEQUELIZE

const logger = require("../../../api/logger");

// ===============================================================
// INVOICE HEADER MODEL
// models/InvoiceHeader.js
module.exports = (sequelize, DataTypes) => {
  const InvoiceHeader = sequelize.define('ARInvoiceHeader', {
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    invoiceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 1
    },
    totalAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    taxAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    netAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft'
    },
    description: {
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
        fields: ['invoiceNumber']
      },
      {
        fields: ['status']
      },
      {
        fields: ['invoiceDate']
      },
      {
        fields: ['customerId']
      }
    ]
  });

  InvoiceHeader.associate = models => {
    logger.info(`Associating table InvoiceHeader with models`);
    InvoiceHeader.belongsTo(models.customer, {
      foreignKey: 'customerId',
      as: 'customer',
    });
    InvoiceHeader.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency',
    });
    InvoiceHeader.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    InvoiceHeader.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
    InvoiceHeader.hasMany(models.arInvoiceLine, {
      foreignKey: 'invoiceHeaderId',
      as: 'invoiceLines',
    });
    InvoiceHeader.hasMany(models.arReceiveHeader, {
      foreignKey: 'invoiceHeaderId',
      as: 'receiveHeaders',
    });
  };

  return InvoiceHeader;
};
