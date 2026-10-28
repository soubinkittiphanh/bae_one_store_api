module.exports = (sequelize, DataTypes) => {
  const lnCollateralMaster = sequelize.define('lnCollateralMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    collateralNo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    collateralTypeCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'VEHICLE' },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    appraisedValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    appraisedDate: { type: DataTypes.DATEONLY, allowNull: false },
    currencyId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PLEDGED' }
  }, { freezeTableName: true, tableName: 'ln_collateral_master', timestamps: true });

  const lnCollateralVehicle = sequelize.define('lnCollateralVehicle', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    collateralId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    vinChassisNo: { type: DataTypes.STRING(50), allowNull: false },
    engineNo: { type: DataTypes.STRING(50), allowNull: true },
    licensePlate: { type: DataTypes.STRING(30), allowNull: true },
    registrationBookRef: { type: DataTypes.STRING(50), allowNull: true },
    brand: { type: DataTypes.STRING(50), allowNull: false },
    model: { type: DataTypes.STRING(50), allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    color: { type: DataTypes.STRING(30), allowNull: true },
    insurancePolicyNo: { type: DataTypes.STRING(50), allowNull: true },
    insuranceCompany: { type: DataTypes.STRING(100), allowNull: true },
    insuranceExpiryDate: { type: DataTypes.DATEONLY, allowNull: true },
    insuranceCoverageAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 }
  }, { freezeTableName: true, tableName: 'ln_collateral_vehicle', timestamps: true });

  const lnLoanCollateral = sequelize.define('lnLoanCollateral', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    collateralId: { type: DataTypes.INTEGER, allowNull: false },
    allocatedValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    ltvPct: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 }
  }, { freezeTableName: true, tableName: 'ln_loan_collateral', timestamps: true });

  return {
    lnCollateralMaster,
    lnCollateralVehicle,
    lnLoanCollateral
  };
};
