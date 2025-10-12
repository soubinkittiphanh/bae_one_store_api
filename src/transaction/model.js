

module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('txn_code', {
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.ENUM('INCOME', 'EXPENSE'),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    timestamps: true,
    freezeTableName: true,
    updatedAt: 'updateTimestamp',
  });

  Transaction.associate = (models) => {
    // Transaction.belongsTo(models.user, {
    //   foreignKey: 'createdBy',
    //   as: 'creator'
    // });
    // Transaction.belongsTo(models.chartAccount, {
    //   foreignKey: 'chartAccountId',
    //   as: 'chartAccount'
    // });
  };

  return Transaction;
};

// 1. STRING: A variable length string.
// 2. CHAR: A fixed length string.
// 3. TEXT: A long string.
// 4. INTEGER: A 32-bit integer.
// 5. BIGINT: A 64-bit integer.
// 6. FLOAT: A floating point number.
// 7. DOUBLE: A double floating point number.
// 8. DECIMAL: A fixed-point decimal number.
// 9. BOOLEAN: A boolean value.
// 10. DATE: A date object.
// 11. DATEONLY: A date object without time.
// 12. TIME: A time object.
// 13. UUID: A universally unique identifier.
// 14. ENUM: A value from a predefined list of values.
// 15. ARRAY: An array of values.
// 16. JSON: A JSON object.
// 17. JSONB: A JSON object stored as a binary format.