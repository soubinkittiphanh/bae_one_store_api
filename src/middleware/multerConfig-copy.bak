// ===============================================================
// FILE UPLOAD MIDDLEWARE - multerConfig.js
// ===============================================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure upload directories exist
const uploadDir = 'uploads';
const imageDir = path.join(uploadDir, 'images');
const documentDir = path.join(uploadDir, 'documents');

[uploadDir, imageDir, documentDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  console.log('Processing file:', file.originalname, 'Field:', file.fieldname);
  
  if (file.fieldname === 'images') {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for images field'), false);
    }
  } else if (file.fieldname === 'documents') {
    // Allow document files
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, XLS, XLSX, and TXT files are allowed for documents'), false);
    }
  } else {
    cb(new Error('Unexpected field'), false);
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'images') {
      cb(null, imageDir);
    } else if (file.fieldname === 'documents') {
      cb(null, documentDir);
    } else {
      cb(new Error('Invalid field name'), null);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(file.originalname);
    const filename = `${file.fieldname}_${Date.now()}_${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 20 // Maximum 20 files
  }
});

// Export configured multer
const uploadFiles = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'documents', maxCount: 10 }
]);

module.exports = {
  uploadFiles,
  imageDir,
  documentDir
};
