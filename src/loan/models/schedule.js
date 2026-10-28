module.exports = (sequelize, DataTypes) => {
  const lnSchedule = sequelize.define('lnSchedule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    installmentNo: { type: DataTypes.INTEGER, allowNull: false },
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    originalDueDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'UNPAID' },
    optLockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  }, { freezeTableName: true, tableName: 'ln_schedule', timestamps: true });

  const lnScheduleComponent = sequelize.define('lnScheduleComponent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    scheduleId: { type: DataTypes.INTEGER, allowNull: false },
    componentId: { type: DataTypes.INTEGER, allowNull: false },
    amountDue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    amountPaid: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    amountWaived: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'UNPAID' }
  }, { freezeTableName: true, tableName: 'ln_schedule_component', timestamps: true });

  const lnAccrualLedger = sequelize.define('lnAccrualLedger', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    componentId: { type: DataTypes.INTEGER, allowNull: false },
    accrualDate: { type: DataTypes.DATEONLY, allowNull: false },
    dailyAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    cumulativeAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    isSuspended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    glBatchId: { type: DataTypes.STRING(50), allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_accrual_ledger', timestamps: true });

  return {
    lnSchedule,
    lnScheduleComponent,
    lnAccrualLedger
  };
};
