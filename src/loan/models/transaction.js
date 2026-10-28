module.exports = (sequelize, DataTypes) => {
  const lnTransaction = sequelize.define('lnTransaction', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    txNo: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    branchId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    eventCode: { type: DataTypes.STRING(30), allowNull: false },
    valueDate: { type: DataTypes.DATEONLY, allowNull: false },
    postingDate: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    currencyId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    exchangeRate: { type: DataTypes.DECIMAL(20, 8), allowNull: false, defaultValue: 1.00000000 },
    baseAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    paymentMethod: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CASH' },
    paymentMethodId: { type: DataTypes.INTEGER, allowNull: true },
    bankAccountId: { type: DataTypes.INTEGER, allowNull: true },
    isReversed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reversalOfTxId: { type: DataTypes.INTEGER, allowNull: true },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' },
    makerId: { type: DataTypes.INTEGER, allowNull: true },
    checkerId: { type: DataTypes.INTEGER, allowNull: true },
    authorizedAt: { type: DataTypes.DATE, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_transaction', timestamps: true });

  const lnTransactionAllocation = sequelize.define('lnTransactionAllocation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    transactionId: { type: DataTypes.INTEGER, allowNull: false },
    scheduleComponentId: { type: DataTypes.INTEGER, allowNull: false },
    componentId: { type: DataTypes.INTEGER, allowNull: false },
    allocatedAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 }
  }, { freezeTableName: true, tableName: 'ln_transaction_allocation', timestamps: true });

  const lnJournalPosting = sequelize.define('lnJournalPosting', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    transactionId: { type: DataTypes.INTEGER, allowNull: true },
    glBatchId: { type: DataTypes.STRING(50), allowNull: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: true },
    eventCode: { type: DataTypes.STRING(30), allowNull: false },
    amountTag: { type: DataTypes.STRING(50), allowNull: false },
    roleCode: { type: DataTypes.STRING(50), allowNull: false },
    chartAccountId: { type: DataTypes.INTEGER, allowNull: false },
    drCr: { type: DataTypes.STRING(10), allowNull: false },
    amount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    baseAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    exchangeRate: { type: DataTypes.DECIMAL(20, 8), allowNull: false, defaultValue: 1.00000000 },
    glRecordId: { type: DataTypes.INTEGER, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_journal_posting', timestamps: true });

  const lnStatusHistory = sequelize.define('lnStatusHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    oldStatus: { type: DataTypes.STRING(30), allowNull: false },
    newStatus: { type: DataTypes.STRING(30), allowNull: false },
    changeReason: { type: DataTypes.TEXT, allowNull: true },
    triggeredBy: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'EOD_BATCH' },
    approvalUserId: { type: DataTypes.INTEGER, allowNull: true },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false }
  }, { freezeTableName: true, tableName: 'ln_status_history', timestamps: true, updatedAt: false });

  const lnAmendmentHistory = sequelize.define('lnAmendmentHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    amendmentType: { type: DataTypes.STRING(30), allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    oldValuesJson: { type: DataTypes.TEXT('long'), allowNull: false },
    newValuesJson: { type: DataTypes.TEXT('long'), allowNull: false },
    approvedBy: { type: DataTypes.INTEGER, allowNull: false }
  }, { freezeTableName: true, tableName: 'ln_amendment_history', timestamps: true, updatedAt: false });

  return {
    lnTransaction,
    lnTransactionAllocation,
    lnJournalPosting,
    lnStatusHistory,
    lnAmendmentHistory
  };
};
