const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router()
const validator = require("./validator")

// Configure multer for profile image upload
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/company-profiles/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: companyId_timestamp.extension
    const companyId = req.params.id;
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `company_profile_${companyId}_${timestamp}${extension}`);
  }
});

// Configure multer for bank QR image upload
const qrStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/company-qr/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: companyId_timestamp.extension
    const companyId = req.params.id;
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `company_qr_${companyId}_${timestamp}${extension}`);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  console.log('File received:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  // Check both mimetype and file extension
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const fileExtension = file.originalname.toLowerCase().split('.').pop();
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    console.log('File rejected - mimetype:', file.mimetype, 'extension:', fileExtension);
    cb(new Error('Only image files are allowed'), false);
  }
};

// Create upload middleware for profile images
const uploadProfile = multer({
  storage: profileStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Create upload middleware for QR images
const uploadQR = multer({
  storage: qrStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// PUBLIC ROUTES (no authentication required)
router.get("/findAll", controller.getAllActiveCompanies)
router.get("/find", controller.getAllCompanies)
router.get('/company-theme/:id', controller.getCompanyTheme);

// Apply token validation to all subsequent routes
router.use(validateToken)

// PROTECTED ROUTES (authentication required)
router.post("/create", controller.createCompany)
  .put("/update/:id", controller.updateCompanyById)
  .delete("/find/:id", controller.deleteCompanyById)
  .get("/find/:id", controller.getCompanyById)

// Theme management routes
router.put('/company-theme/:id', controller.updateCompanyTheme);

// Profile image upload routes
router.post("/upload-profile-image/:id", uploadProfile.single('profile_image'), controller.uploadProfileImage)
  .put("/update-profile-image/:id", controller.updateCompanyProfileImage)
  .delete("/delete-profile-image/:id", controller.deleteProfileImage)

// NEW: Bank QR image upload routes
router.post("/upload-bank-qr-image/:id", uploadQR.single('bank_qr_image'), controller.uploadBankQRImage)
  .put("/update-bank-qr-image/:id", controller.updateCompanyBankQRImage)
  .delete("/delete-bank-qr-image/:id", controller.deleteBankQRImage)

// NEW: Bank QR image 2 upload routes
router.post("/upload-bank-qr-image-2/:id", uploadQR.single('bank_qr_image_2'), controller.uploadBankQRImage2)
  .put("/update-bank-qr-image-2/:id", controller.updateCompanyBankQRImage2)
  .delete("/delete-bank-qr-image-2/:id", controller.deleteBankQRImage2)

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size too large. Maximum 5MB allowed.' });
    }
    return res.status(400).json({ message: 'File upload error: ' + error.message });
  }
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({ message: 'Only image files are allowed' });
  }
  next(error);
});

module.exports = router