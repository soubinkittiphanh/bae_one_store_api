module.exports = (sequelize, DataTypes) => {
  const lnIdempotency = sequelize.define('lnIdempotency', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    endpoint: { type: DataTypes.STRING(100), allowNull: false },
    accountId: { type: DataTypes.INTEGER, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: false },
    requestHash: { type: DataTypes.STRING(64), allowNull: false },
    responseBody: { type: DataTypes.TEXT('long'), allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 200 }
  }, { freezeTableName: true, tableName: 'ln_idempotency', timestamps: true, updatedAt: false });

  const lnSystemDate = sequelize.define('lnSystemDate', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    branchId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, unique: true },
    currentBusinessDate: { type: DataTypes.DATEONLY, allowNull: false },
    prevBusinessDate: { type: DataTypes.DATEONLY, allowNull: false },
    nextBusinessDate: { type: DataTypes.DATEONLY, allowNull: false },
    periodLockDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'OPEN' }
  }, { freezeTableName: true, tableName: 'ln_system_date', timestamps: true });

  const lnNumberingSequence = sequelize.define('lnNumberingSequence', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sequenceCode: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    prefix: { type: DataTypes.STRING(20), allowNull: false },
    nextNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    paddingLength: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6 },
    formatPattern: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '{PREFIX}-{YEAR}{MONTH}-{NUMBER}' }
  }, { freezeTableName: true, tableName: 'ln_numbering_sequence', timestamps: true });

  const lnBatchJob = sequelize.define('lnBatchJob', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    jobCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    executionOrder: { type: DataTypes.INTEGER, allowNull: false },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastRunDate: { type: DataTypes.DATEONLY, allowNull: true },
    lastStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'IDLE' }
  }, { freezeTableName: true, tableName: 'ln_batch_job', timestamps: true });

  const lnBatchLog = sequelize.define('lnBatchLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    businessDate: { type: DataTypes.DATEONLY, allowNull: false },
    jobCode: { type: DataTypes.STRING(30), allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    recordsProcessed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recordsFailed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    logMessage: { type: DataTypes.TEXT('long'), allowNull: true },
    executionTimeMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, { freezeTableName: true, tableName: 'ln_batch_log', timestamps: true, updatedAt: false });

  const lnBatchLock = sequelize.define('lnBatchLock', {
    lockName: { type: DataTypes.STRING(50), primaryKey: true },
    acquiredAt: { type: DataTypes.DATE, allowNull: false },
    acquiredBy: { type: DataTypes.STRING(100), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false }
  }, { freezeTableName: true, tableName: 'ln_batch_lock', timestamps: false });

  return {
    lnIdempotency,
    lnSystemDate,
    lnNumberingSequence,
    lnBatchJob,
    lnBatchLog,
    lnBatchLock
  };
};
