

module.exports = (sequelize, DataTypes) => {
  const District = sequelize.define('district', {
    status: {
      type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
      defaultValue: 'PENDING',
    },
    notes: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    startedAt: DataTypes.DATE,
    completedAt: DataTypes.DATE,
    totalAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
  });
  // ✅ Define the association in a method
  // District.associate = models => {
  //   District.hasMany(models.village, { as: 'villages' });
  // };

  District.associate = models => {
    District.hasMany(models.village, {
      // foreignKey: 'districtId',
      as: 'villages'
    });
  };
  return District;
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