/**
 * Phase 6 branch support (20261107_loan_branch_support). A branch is a POS location (location.id).
 *  - lnBranchProfile: the loan code and on/off switch of a location used as a branch (maker-checker)
 *  - lnBranchBankAccount: bank/cash accounts a branch may post to (maker-checker)
 *  - lnAccountBranchHistory: one row per BRANCH_TRANSFER of an account
 */
const { makerChecker } = require('./common');

module.exports = (sequelize, DataTypes) => {
  const lnBranchProfile = sequelize.define('lnBranchProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    locationId: { type: DataTypes.INTEGER, allowNull: false },
    branchCode: { type: DataTypes.STRING(10), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_branch_profile', timestamps: true,
    indexes: [
      { name: 'uk_branch_profile_location', unique: true, fields: ['locationId'] },
      { name: 'uk_branch_profile_code', unique: true, fields: ['branchCode'] }
    ] });

  const lnBranchBankAccount = sequelize.define('lnBranchBankAccount', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    locationId: { type: DataTypes.INTEGER, allowNull: false },
    bankAccountId: { type: DataTypes.INTEGER, allowNull: false },
    purpose: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'BANK' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_branch_bank_account', timestamps: true,
    indexes: [
      { name: 'uk_branch_bank', unique: true, fields: ['locationId', 'bankAccountId'] }
    ] });

  const lnAccountBranchHistory = sequelize.define('lnAccountBranchHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    fromBranchId: { type: DataTypes.INTEGER, allowNull: false },
    toBranchId: { type: DataTypes.INTEGER, allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    transactionId: { type: DataTypes.INTEGER, allowNull: true },
    makerId: { type: DataTypes.INTEGER, allowNull: true },
    checkerId: { type: DataTypes.INTEGER, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_account_branch_history', timestamps: true, updatedAt: false,
    indexes: [
      { name: 'idx_abh_account', fields: ['loanAccountId'] }
    ] });

  return { lnBranchProfile, lnBranchBankAccount, lnAccountBranchHistory };
};
