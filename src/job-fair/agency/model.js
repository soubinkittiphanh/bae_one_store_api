// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// AGENCY MODEL
// models/Agency.js
module.exports = (sequelize, DataTypes) => {
  const Agency = sequelize.define('Agency', {
    // ===============================================================
    // BASIC IDENTIFICATION
    // ===============================================================
    
    // ชื่อบริษัท - Agency Name
    agencyName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    
    // รหัสบริษัท - Agency Code
    agencyCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    
    // เลขทะเบียนบริษัท - Registration Number
    registrationNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // ===============================================================
    // CONTACT INFORMATION
    // ===============================================================
    
    // เบอโทรศัพท์ - Phone Number
    phone: {
      type: DataTypes.STRING,
      allowNull: false
    },
    
    // อีเมล - Email
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    
    // ที่อยู่ - Address
    village: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // ที่อยู่ - Address
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // เมือง - City
    city: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // แขวง - District
    district: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // ===============================================================
    // BUSINESS INFORMATION
    // ===============================================================
    
    // เลขใบอนุญาต - License Number
    licenseNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // วันที่จดทะเบียน - Registration Date
    registrationDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    
    // วันหมดอายุใบอนุญาต - License Expiry Date
    licenseExpiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    
    // ===============================================================
    // CONTACT PERSON
    // ===============================================================
    
    // ชื่อผู้ติดต่อ - Contact Person Name
    contactPersonName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // ตำแหน่งผู้ติดต่อ - Contact Person Position
    contactPersonPosition: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // เบอผู้ติดต่อ - Contact Person Phone
    contactPersonPhone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // ===============================================================
    // STATUS AND NOTES
    // ===============================================================
    
    // สถานะ - Status
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      allowNull: false,
      defaultValue: 'active'
    },
    
    // หมายเหตุ - Notes
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // ===============================================================
    // SYSTEM FIELDS
    // ===============================================================
    
    // ระบบใช้งาน - System Active
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    indexes: [
      {
        fields: ['agencyCode'],
        unique: true
      },
      {
        fields: ['status']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['phone']
      },
      {
        fields: ['city']
      }
    ]
  });

  Agency.associate = models => {
    logger.info(`Associating table Agency with models`);
    
    Agency.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    
    Agency.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
  };

  return Agency;
};