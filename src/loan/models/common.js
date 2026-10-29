/**
 * Maker-checker columns shared by every loan parameter table
 * (added by 20261029_loan_phase2a_corrections.sql). New rows start PENDING;
 * engines read only AUTHORIZED rows.
 */
const makerChecker = (DataTypes) => ({
  authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PENDING' },
  makerId: { type: DataTypes.INTEGER, allowNull: true },
  checkerId: { type: DataTypes.INTEGER, allowNull: true },
  authorizedAt: { type: DataTypes.DATE, allowNull: true }
});

module.exports = { makerChecker };
