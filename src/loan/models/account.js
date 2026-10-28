module.exports = (sequelize, DataTypes) => {
  const lnAccount = sequelize.define('lnAccount', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accountNo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    branchId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    applicationId: { type: DataTypes.INTEGER, allowNull: false },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    productVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    currencyId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    saleHeaderId: { type: DataTypes.INTEGER, allowNull: true },
    sanctionedAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    disbursedAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    downPaymentAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    downPaymentCollected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    interestRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    rateIndexId: { type: DataTypes.INTEGER, allowNull: true },
    spread: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    effectiveInterestRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    balloonAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    tenorMonths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    firstDueDate: { type: DataTypes.DATEONLY, allowNull: false },
    valueDate: { type: DataTypes.DATEONLY, allowNull: false },
    maturityDate: { type: DataTypes.DATEONLY, allowNull: false },
    disbursementTarget: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'SALE_INVOICE_SETTLEMENT' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ACTIVE' },
    regulatoryClass: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CLASS_A' },
    currentDpd: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    optLockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  }, { freezeTableName: true, tableName: 'ln_account', timestamps: true });

  const lnAccountParamSnapshot = sequelize.define('lnAccountParamSnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    productVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    snapshotJson: { type: DataTypes.TEXT('long'), allowNull: false }
  }, { freezeTableName: true, tableName: 'ln_account_param_snapshot', timestamps: true });

  const lnAccountUde = sequelize.define('lnAccountUde', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    udeCode: { type: DataTypes.STRING(30), allowNull: false },
    udeValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 }
  }, { freezeTableName: true, tableName: 'ln_account_ude', timestamps: true });

  const lnAccountBalance = sequelize.define('lnAccountBalance', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    componentId: { type: DataTypes.INTEGER, allowNull: false },
    outstandingAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    totalAccrued: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    totalBilled: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    totalPaid: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    totalWaived: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    optLockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  }, { freezeTableName: true, tableName: 'ln_account_balance', timestamps: true });

  return {
    lnAccount,
    lnAccountParamSnapshot,
    lnAccountUde,
    lnAccountBalance
  };
};
