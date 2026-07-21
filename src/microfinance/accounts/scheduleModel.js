module.exports = (sequelize, DataTypes) => {
  const MFRepaymentSchedule = sequelize.define('mfRepaymentSchedule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    loanAccountId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    installmentNo: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    principalDue: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    interestDue: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    feesDue: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      allowNull: false
    },
    principalPaid: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      allowNull: false
    },
    interestPaid: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      allowNull: false
    },
    feesPaid: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID'),
      defaultValue: 'UNPAID',
      allowNull: false
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true
  });

  MFRepaymentSchedule.associate = (models) => {
    // Schedule belongs to a single active Loan Account
    MFRepaymentSchedule.belongsTo(models.mfLoanAccount, {
      foreignKey: 'loanAccountId',
      as: 'loanAccount'
    });
  };

  return MFRepaymentSchedule;
};
