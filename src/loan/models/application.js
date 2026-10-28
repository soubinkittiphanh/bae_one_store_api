module.exports = (sequelize, DataTypes) => {
  const lnApplication = sequelize.define('lnApplication', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    appNo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    branchId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    currencyId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    vehicleSaleHeaderId: { type: DataTypes.INTEGER, allowNull: true },
    vehiclePrice: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    downPaymentAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    downPaymentPct: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.200000 },
    requestedAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    tenorMonths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    interestRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    balloonAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    purposeCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'VEHICLE_PURCHASE' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
    currentApprovalLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdBy: { type: DataTypes.INTEGER, allowNull: false },
    approvedBy: { type: DataTypes.INTEGER, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_application', timestamps: true });

  const lnGuarantor = sequelize.define('lnGuarantor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    applicationId: { type: DataTypes.INTEGER, allowNull: false },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: true },
    fullName: { type: DataTypes.STRING(100), allowNull: false },
    idCardPassport: { type: DataTypes.STRING(50), allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    relationship: { type: DataTypes.STRING(50), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    monthlyIncome: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    employerName: { type: DataTypes.STRING(100), allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_guarantor', timestamps: true });

  return {
    lnApplication,
    lnGuarantor
  };
};
