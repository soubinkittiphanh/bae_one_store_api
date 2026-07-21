module.exports = (sequelize, DataTypes) => {
  const MFJournalEntry = sequelize.define('mfJournalEntry', {
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
    eventCode: {
      type: DataTypes.ENUM('BOOK', 'DSBR', 'ACCR', 'ALIQ', 'MLIQ', 'STCH'),
      allowNull: false
    },
    valueDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    debitGL: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    creditGL: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    currencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true
  });

  MFJournalEntry.associate = (models) => {
    // Journal entry belongs to an active Loan Account
    MFJournalEntry.belongsTo(models.mfLoanAccount, {
      foreignKey: 'loanAccountId',
      as: 'loanAccount'
    });
    // Link to currency model
    MFJournalEntry.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency'
    });
  };

  return MFJournalEntry;
};
