// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// APPLICANT MODEL
// models/Applicant.js
module.exports = (sequelize, DataTypes) => {
  const Applicant = sequelize.define('Applicant', {
    // ===============================================================
    // BASIC IDENTIFICATION
    // ===============================================================

    // ชื่อ ตอม บามสะกุน - Name and Surname
    firstName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    education: {
      type: DataTypes.STRING,
    },

    // ===============================================================
    // PERSONAL INFORMATION
    // ===============================================================

    // เพศ - Gender
    gender: {
      type: DataTypes.ENUM('male', 'female'),
      allowNull: false
    },
    depositAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0
    },
    isRefund: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    depositByCensusBook: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },

    // อายุ - Age
    age: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    // สถานะการสมรส - Marital Status
    maritalStatus: {
      type: DataTypes.ENUM('single', 'married', 'divorced', 'widowed'),
      allowNull: true
    },

    // ===============================================================
    // CONTACT INFORMATION
    // ===============================================================

    // เบอใช - Phone Number
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // เบอติดตอชุมชน - Emergency Contact Number
    emergencyContactNo: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // ===============================================================
    // ADDRESS INFORMATION
    // ===============================================================

    // ที่อยู่ - Address
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // บ้าน - Village
    village: {
      type: DataTypes.STRING,
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
    // PASSPORT/DOCUMENT INFORMATION
    // ===============================================================

    // มีพาสปอร์ต - Passport Availability
    passportAvailability: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    passportRecieve: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },

    // เลขพาสปอร์ต - Passport Number
    passportNo: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // วันหมดอายุพาสปอร์ต - Passport Expiry Date
    passportIssueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    // วันหมดอายุพาสปอร์ต - Passport Expiry Date
    passportExpiredDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // ===============================================================
    // WORK/CONTRACT INFORMATION
    // ===============================================================

    // สถานที่ทำงาน - Work Place
    workPlace: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // วันที่เริ่มสัญญา - Contract Start Date
    contactStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // วันที่สิ้นสุดสัญญา - Contract End Date
    contactEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // ===============================================================
    // APPLICATION DATES
    // ===============================================================

    // วันที่ลงทะเบียน - Register Date
    registertDate: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // วันที่สัมภาษณ์ - Interview Exam Date
    interviewExamDate: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // ===============================================================
    // PHOTOS/DOCUMENTS
    // ===============================================================

    // รูปถ่ายพาสปอร์ต - Passport Photo
    passportPhoto: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL or path to passport photo'
    },

    // รูปถ่ายผู้สมัคร - Applicant Photo
    applicantPhoto: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL or path to applicant photo'
    },

    // ===============================================================
    // APPLICATION STATUS
    // ===============================================================

    // สถานะการสมัคร - Application Status
    status: {
      type: DataTypes.ENUM('INTERVIEW', 'REGISTER', 'CONFIRM', 'SUBMITED','rejected'),
      allowNull: false,
      defaultValue: 'INTERVIEW'
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
        fields: ['gender']
      },
      {
        fields: ['status']
      },
      {
        fields: ['passportAvailability']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['phone']
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
    Applicant.belongsTo(models.JobBatch, {
      foreignKey: 'jobBatchId',
      as: 'jobBatch',
    });
    Applicant.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency',
    });
    Applicant.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency',
    });
    Applicant.belongsTo(models.Agency, {
      foreignKey: 'employeeId',
      as: 'employee',
    });
  };

  return Applicant;
};