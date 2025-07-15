module.exports = (sequelize, DataTypes) => {
  const Ministry = sequelize.define('ministry', {
    ministryCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      unique: {
        name: 'unique_ministry_code',
        msg: 'Ministry code must be unique'
      }
    },
    ministryName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ministryNameEn: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ministryType: {
      type: DataTypes.ENUM('Ministry', 'Department', 'Agency', 'Commission'),
      allowNull: false,
      defaultValue: 'Ministry'
    },
    parentMinistryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'ministry',
        key: 'id'
      }
    },
    ministerName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    establishedDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true
      }
    },
    province: {
      type: DataTypes.STRING,
      allowNull: true
    },
    district: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('Active', 'Inactive', 'Restructured', 'Merged'),
      allowNull: false,
      defaultValue: 'Active'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
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
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['ministryCode']
      },
      {
        fields: ['ministryType']
      },
      {
        fields: ['status']
      },
      {
        fields: ['parentMinistryId']
      }
    ]
  });

  // Define associations
  Ministry.associate = function(models) {
    // Self-referencing association for parent ministry
    Ministry.belongsTo(models.ministry, {
      foreignKey: 'parentMinistryId',
      as: 'parentMinistry'
    });
    
    Ministry.hasMany(models.ministry, {
      foreignKey: 'parentMinistryId',
      as: 'subMinistries'
    });
  };

  return Ministry;
};