

module.exports = (sequelize, DataTypes) => {
  const Tax = sequelize.define('tax', {
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100]
      }
    },
    rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      validate: {
        min: 0,
        max: 1,
        isDecimal: true
      },
      comment: 'VAT rate as decimal (e.g., 0.0850 for 8.5%)'
    },
    taxType: {
      type: DataTypes.ENUM('INC', 'EXC'),
      allowNull: false,
      defaultValue: 'INC'
    },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [1, 20],
        isUppercase: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    effectiveFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: true,
        notEmpty: true
      }
    },
    effectiveTo: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      validate: {
        // ✅ FIXED: Custom validator that properly handles null/empty values
        isValidEffectiveToDate(value) {
          // Allow null, undefined, or empty string (will be converted to null)
          if (value === null || value === undefined || value === '') {
            return true;
          }

          // Validate it's a proper date format
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new Error('Effective to date must be a valid date');
          }

          // Check if it's after effectiveFrom
          if (this.effectiveFrom) {
            const fromDate = new Date(this.effectiveFrom);
            const toDate = new Date(value);

            if (toDate <= fromDate) {
              throw new Error('Effective to date must be after effective from date');
            }
          }

          return true;
        }
      }
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,

    // ✅ ADD: Hooks to clean up data before validation and saving
    hooks: {
      beforeValidate: (tax, options) => {
        // Clean up string fields
        if (tax.name && typeof tax.name === 'string') {
          tax.name = tax.name.trim();
        }

        if (tax.code && typeof tax.code === 'string') {
          tax.code = tax.code.toUpperCase().trim();
        }

        if (tax.description === '') {
          tax.description = null;
        } else if (tax.description && typeof tax.description === 'string') {
          tax.description = tax.description.trim();
        }

        // ✅ CRITICAL FIX: Convert empty effectiveTo to null
        if (tax.effectiveTo === '' || tax.effectiveTo === undefined) {
          tax.effectiveTo = null;
        }

        console.log('Before validation - effectiveTo:', tax.effectiveTo); // Debug log
      },

      beforeSave: async (tax, options) => {
        // Ensure only one default tax rate exists
        if (tax.isDefault) {
          await Tax.update(
            { isDefault: false },
            {
              where: {
                isDefault: true,
                id: { [sequelize.Sequelize.Op.ne]: tax.id || 0 }
              },
              transaction: options.transaction
            }
          );
        }

        console.log('Before save - effectiveTo:', tax.effectiveTo); // Debug log
      }
    }
  });

  // ✅ ADD: Useful class methods
  Tax.getActiveRates = async function (date = new Date()) {
    const { Op } = sequelize.Sequelize;
    return await this.findAll({
      where: {
        isActive: true,
        effectiveFrom: { [Op.lte]: date },
        [Op.or]: [
          { effectiveTo: null },
          { effectiveTo: { [Op.gte]: date } }
        ]
      },
      order: [['isDefault', 'DESC'], ['name', 'ASC']]
    });
  };

  Tax.getDefaultRate = async function (date = new Date()) {
    const { Op } = sequelize.Sequelize;
    return await this.findOne({
      where: {
        isDefault: true,
        isActive: true,
        effectiveFrom: { [Op.lte]: date },
        [Op.or]: [
          { effectiveTo: null },
          { effectiveTo: { [Op.gte]: date } }
        ]
      }
    });
  };

  Tax.getRateByCode = async function (code, date = new Date()) {
    const { Op } = sequelize.Sequelize;
    return await this.findOne({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        effectiveFrom: { [Op.lte]: date },
        [Op.or]: [
          { effectiveTo: null },
          { effectiveTo: { [Op.gte]: date } }
        ]
      }
    });
  };

  // ✅ ADD: Useful instance methods
  Tax.prototype.isValidForDate = function (date = new Date()) {
    if (!this.isActive) return false;
    if (new Date(this.effectiveFrom) > date) return false;
    if (this.effectiveTo && new Date(this.effectiveTo) < date) return false;
    return true;
  };

  Tax.prototype.getDisplayRate = function () {
    return (parseFloat(this.rate) * 100).toFixed(2) + '%';
  };

  Tax.prototype.getDaysUntilExpiry = function () {
    if (!this.effectiveTo) return null;
    const today = new Date();
    const expiryDate = new Date(this.effectiveTo);
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  Tax.prototype.isExpiringSoon = function (days = 30) {
    const daysUntilExpiry = this.getDaysUntilExpiry();
    return daysUntilExpiry !== null && daysUntilExpiry <= days && daysUntilExpiry > 0;
  };

  // ✅ ADD: Associate method for relationships (if needed)
  Tax.associate = (models) => {
    // Example associations - uncomment if you have these models

    // Tax.hasMany(models.Product, {
    //   foreignKey: 'taxRateId',
    //   as: 'products'
    // });

    // Tax.hasMany(models.TicketLine, {
    //   foreignKey: 'taxCode',
    //   sourceKey: 'code',
    //   as: 'ticketLines'
    // });
  };

  return Tax;
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