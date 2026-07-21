module.exports = (sequelize, DataTypes) => {
  const MFCollateral = sequelize.define('mfCollateral', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    collateralNo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    cifId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('PROPERTY', 'VEHICLE', 'CASH', 'GROUP_GUARANTEE', 'OTHER'),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    marketValue: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    haircutPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 20.00,
      allowNull: false
    },
    lendableValue: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    currencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'LIQUIDATED', 'RELEASED'),
      defaultValue: 'ACTIVE',
      allowNull: false
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    hooks: {
      beforeValidate: (collateral) => {
        // Automatically calculate lendableValue based on marketValue and haircutPercentage
        if (collateral.marketValue != null && collateral.haircutPercentage != null) {
          const haircutFraction = parseFloat(collateral.haircutPercentage) / 100.0;
          collateral.lendableValue = parseFloat(collateral.marketValue) * (1.0 - haircutFraction);
        }
      }
    }
  });

  MFCollateral.associate = (models) => {
    // Collateral belongs to a CIF Customer
    MFCollateral.belongsTo(models.cifCustomer, {
      foreignKey: 'cifId',
      as: 'customer'
    });
    // Link to currency model
    MFCollateral.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency'
    });
  };

  return MFCollateral;
};
