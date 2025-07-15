module.exports = (sequelize, DataTypes) => {
  const ArInvoiceItem = sequelize.define('ar_invoice_item', {
    invoiceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'ar_invoices',
        key: 'id'
      }
    },
    itemCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    itemName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'pcs'
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 1.00
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    lineTotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    discountRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    taxRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    taxAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    netAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'products',
        key: 'id'
      }
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'services',
        key: 'id'
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    remark: {
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
        fields: ['invoiceId']
      },
      {
        fields: ['itemCode']
      },
      {
        fields: ['productId']
      },
      {
        fields: ['serviceId']
      },
      {
        fields: ['sortOrder']
      }
    ]
  });

  // Define associations
  ArInvoiceItem.associate = function(models) {
    // Association with AR Invoice
    ArInvoiceItem.belongsTo(models.ArInvoice, {
      foreignKey: 'invoiceId',
      as: 'invoice'
    });

    // Association with Product (if applicable)
    ArInvoiceItem.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'product'
    });

    // Association with Service (if applicable)
    ArInvoiceItem.belongsTo(models.Service, {
      foreignKey: 'serviceId',
      as: 'service'
    });
  };

  // Instance methods
  ArInvoiceItem.prototype.calculateTotals = function() {
    // Calculate line total before discount
    this.lineTotal = this.quantity * this.unitPrice;
    
    // Calculate discount amount
    this.discountAmount = (this.lineTotal * this.discountRate) / 100;
    
    // Calculate amount after discount
    const amountAfterDiscount = this.lineTotal - this.discountAmount;
    
    // Calculate tax amount
    this.taxAmount = (amountAfterDiscount * this.taxRate) / 100;
    
    // Calculate net amount
    this.netAmount = amountAfterDiscount + this.taxAmount;
  };

  // Hook to automatically calculate totals before save
  ArInvoiceItem.beforeSave(async (item, options) => {
    item.calculateTotals();
  });

  return ArInvoiceItem;
};