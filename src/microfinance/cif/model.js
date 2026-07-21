module.exports = (sequelize, DataTypes) => {
  const CIFCustomer = sequelize.define('cifCustomer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    cifNo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    firstName: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    lastName: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    cifType: {
      type: DataTypes.ENUM('INDIVIDUAL', 'CORPORATE', 'BANK'),
      defaultValue: 'INDIVIDUAL',
      allowNull: false
    },
    // Corporate fields
    companyName: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    registrationNo: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    incorporationDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    businessType: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    // Bank fields
    swiftCode: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    licenseNo: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    countryCode: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    gender: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'),
      allowNull: true
    },
    kycStatus: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
      defaultValue: 'PENDING',
      allowNull: false
    },
    riskCategory: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
      defaultValue: 'LOW',
      allowNull: false
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    roleInGroup: {
      type: DataTypes.ENUM('MEMBER', 'LEADER', 'NONE'),
      defaultValue: 'NONE',
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true
  });

  CIFCustomer.associate = (models) => {
    // A CIF Customer can belong to a Microfinance Group
    CIFCustomer.belongsTo(models.microfinanceGroup, {
      foreignKey: 'groupId',
      as: 'group'
    });
    // A CIF Customer can have multiple loan accounts
    CIFCustomer.hasMany(models.mfLoanAccount, {
      foreignKey: 'cifId',
      as: 'loanAccounts'
    });
    // A CIF Customer can pledge multiple collaterals
    CIFCustomer.hasMany(models.mfCollateral, {
      foreignKey: 'cifId',
      as: 'collaterals'
    });
  };

  return CIFCustomer;
};
