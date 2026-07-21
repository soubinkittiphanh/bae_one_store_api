module.exports = (sequelize, DataTypes) => {
  const MFLoanProduct = sequelize.define('mfLoanProduct', {
    productCode: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    minAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    maxAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    minTenorWeeks: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    maxTenorWeeks: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    interestRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      comment: 'Annual interest rate percentage'
    },
    interestType: {
      type: DataTypes.ENUM('FLAT', 'REDUCING_BALANCE'),
      allowNull: false
    },
    repaymentFrequency: {
      type: DataTypes.ENUM('WEEKLY', 'BI_WEEKLY', 'MONTHLY'),
      allowNull: false
    },
    gracePeriodWeeks: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    currencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    linkedGLAsset: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    linkedGLIncome: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true
  });

  MFLoanProduct.associate = (models) => {
    // Product defines rules for multiple loan accounts
    MFLoanProduct.hasMany(models.mfLoanAccount, {
      foreignKey: 'productCode',
      as: 'accounts'
    });
    // Associations to Chart of Accounts (COA)
    MFLoanProduct.belongsTo(models.chartAccount, {
      foreignKey: 'linkedGLAsset',
      targetKey: 'accountNumber',
      as: 'assetGL'
    });
    MFLoanProduct.belongsTo(models.chartAccount, {
      foreignKey: 'linkedGLIncome',
      targetKey: 'accountNumber',
      as: 'incomeGL'
    });
    // Link to currency model
    MFLoanProduct.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency'
    });
  };

  return MFLoanProduct;
};
