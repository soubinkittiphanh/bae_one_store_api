module.exports = (sequelize, DataTypes) => {
  const MFLoanAccount = sequelize.define('mfLoanAccount', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    accountNo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    cifId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    productCode: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    sanctionedAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    interestRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    valueDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    maturityDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'PAID', 'WRITTEN_OFF', 'NPA_SUBSTANDARD', 'NPA_DOUBTFUL'),
      defaultValue: 'ACTIVE',
      allowNull: false
    },
    currencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    linkedSavingsAcc: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true
  });

  MFLoanAccount.associate = (models) => {
    // Account belongs to a CIF Customer
    MFLoanAccount.belongsTo(models.cifCustomer, {
      foreignKey: 'cifId',
      as: 'customer'
    });
    // Account belongs to a Loan Product template
    MFLoanAccount.belongsTo(models.mfLoanProduct, {
      foreignKey: 'productCode',
      as: 'product'
    });
    // Account has many repayment schedules
    MFLoanAccount.hasMany(models.mfRepaymentSchedule, {
      foreignKey: 'loanAccountId',
      as: 'schedules'
    });
    // Account has many accounting journal entries
    MFLoanAccount.hasMany(models.mfJournalEntry, {
      foreignKey: 'loanAccountId',
      as: 'journalEntries'
    });
    // Link to currency model
    MFLoanAccount.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency'
    });
  };

  return MFLoanAccount;
};
