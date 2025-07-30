// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../api/logger");

// APPLICANT MODEL
// models/Applicant.js
module.exports = (sequelize, DataTypes) => {
  const Applicant = sequelize.define('Applicant', {
    // Basic Personal Information
    firstName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    gender: {
      type: DataTypes.ENUM('male', 'female'),
      allowNull: false
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    age: {
      type: DataTypes.VIRTUAL,
      get() {
        if (this.dateOfBirth) {
          const today = new Date();
          const birthDate = new Date(this.dateOfBirth);
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          return age;
        }
        return null;
      }
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // Requirements Check
    hasPassport: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    healthStatus: {
      type: DataTypes.ENUM('good', 'fair', 'poor'),
      allowNull: true,
      defaultValue: 'good'
    },
    eyesightGood: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    chineseLanguageLevel: {
      type: DataTypes.ENUM('none', 'basic', 'intermediate', 'advanced'),
      allowNull: true,
      defaultValue: 'none'
    },
    hasVisibleTattoos: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    
    // Application Status
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending'
    },
    applicationDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    
    indexes: [
      {
        fields: ['gender']
      },
      {
        fields: ['status']
      },
      {
        fields: ['applicationDate']
      }
    ]
  });

  Applicant.associate = models => {
    logger.info(`Associating table Applicant with models`);
    
    Applicant.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    
    Applicant.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
    
    Applicant.belongsTo(models.user, {
      foreignKey: 'checkerId',
      as: 'checker',
    });
  };

  return Applicant;
};