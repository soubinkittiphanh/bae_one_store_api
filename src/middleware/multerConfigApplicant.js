// ===============================================================
// APPLICANT PHOTO UPLOAD MIDDLEWARE
// middleware/applicantUpload.js
// ===============================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure upload directories exist
const uploadDir = 'uploads';
const applicantImageDir = path.join(uploadDir, 'applicants');

[uploadDir, applicantImageDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// File filter function specifically for applicant photos
const fileFilter = (req, file, cb) => {
  console.log('Processing applicant file:', file.originalname, 'Field:', file.fieldname);
  
  // Allow only specific fields for applicant photos
  const allowedFields = ['passportPhoto', 'applicantPhoto'];
  
  if (!allowedFields.includes(file.fieldname)) {
    cb(new Error(`Invalid field name. Only ${allowedFields.join(', ')} are allowed`), false);
    return;
  }
  
  // Allow only image files
  if (file.mimetype.startsWith('image/')) {
    // Additional check for specific image types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
    }
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Storage configuration specifically for applicant photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, applicantImageDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with field identification
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    
    // Create filename pattern: fieldname_timestamp_uniqueid.ext
    // Example: passportPhoto_1641234567890_a1b2c3d4.jpg
    const filename = `${file.fieldname}_${timestamp}_${uniqueSuffix}${extension}`;
    
    cb(null, filename);
  }
});

// Multer configuration for applicant photos
const applicantUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 2 // Maximum 2 files (passport + applicant photo)
  }
});

// Configure specific fields for applicant photos
const uploadApplicantPhotos = applicantUpload.fields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'applicantPhoto', maxCount: 1 }
]);

// Alternative single field uploads
const uploadPassportPhoto = applicantUpload.single('passportPhoto');
const uploadApplicantPhoto = applicantUpload.single('applicantPhoto');

// Helper function to get image URL for response
const getImageUrl = (req, filename) => {
  if (!filename) return null;
  
  const baseUrl = req.protocol + '://' + req.get('host');
  return `${baseUrl}/uploads/applicants/${filename}`;
};

// Helper function to extract filename from path
const getFilenameFromPath = (imagePath) => {
  if (!imagePath) return null;
  return path.basename(imagePath);
};

// Middleware to handle file upload errors
const handleUploadErrors = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB per image'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 1 file per photo type'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field. Only passportPhoto and applicantPhoto are allowed'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${error.message}`
    });
  }
  
  // Handle custom file filter errors
  if (error.message.includes('Invalid field name') || 
      error.message.includes('Only image files are allowed') ||
      error.message.includes('Only JPEG, PNG, GIF, and WebP images are allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

module.exports = {
  uploadApplicantPhotos,
  uploadPassportPhoto,
  uploadApplicantPhoto,
  handleUploadErrors,
  getImageUrl,
  getFilenameFromPath,
  applicantImageDir
};