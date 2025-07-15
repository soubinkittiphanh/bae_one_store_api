module.exports = (sequelize, DataTypes) => {
  const ArInvoice = sequelize.define('ar_invoice', {
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    customerAddress: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    customerPhone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customerEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    invoiceDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    paymentTerms: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'Net 30'
    },
    subtotal: {
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
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    paidAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    remainingAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft'
    },
    paymentStatus: {
      type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
      allowNull: false,
      defaultValue: 'unpaid'
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'USD'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    terms: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
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
        fields: ['invoiceNumber']
      },
      {
        fields: ['customerId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['invoiceDate']
      },
      {
        fields: ['dueDate']
      }
    ]
  });

  // Define associations
  ArInvoice.associate = function(models) {
    // Association with Customer
    ArInvoice.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    // Association with User (created by)
    ArInvoice.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator'
    });

    // Association with User (updated by)
    ArInvoice.belongsTo(models.User, {
      foreignKey: 'updatedBy',
      as: 'updater'
    });

    // Association with Invoice Items
    ArInvoice.hasMany(models.ArInvoiceItem, {
      foreignKey: 'invoiceId',
      as: 'items'
    });

    // Association with Payments
    ArInvoice.hasMany(models.ArPayment, {
      foreignKey: 'invoiceId',
      as: 'payments'
    });
  };

  // Instance methods
  ArInvoice.prototype.calculateTotals = function() {
    this.taxAmount = (this.subtotal * this.taxRate) / 100;
    this.discountAmount = (this.subtotal * this.discountRate) / 100;
    this.totalAmount = this.subtotal + this.taxAmount - this.discountAmount;
    this.remainingAmount = this.totalAmount - this.paidAmount;
  };

  ArInvoice.prototype.updatePaymentStatus = function() {
    if (this.paidAmount === 0) {
      this.paymentStatus = 'unpaid';
    } else if (this.paidAmount >= this.totalAmount) {
      this.paymentStatus = 'paid';
      this.status = 'paid';
    } else {
      this.paymentStatus = 'partial';
    }
  };

  return ArInvoice;
};