const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router()
const validator = require("./validator")

// Configure multer for file upload
const storage = multer.diskStorage({
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
    cb(null, `company_${companyId}_${timestamp}${extension}`);
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

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

router.use(validateToken)
// No auth
// router.use((req,res,next)=>{
// next()
// })

// Existing routes
router.post("/create", controller.createCompany)
 .put("/update/:id", controller.updateCompanyById)
 .delete("/find/:id", controller.deleteCompanyById)
 .get("/find", controller.getAllCompanies)
 .get("/findAll", controller.getAllActiveCompanies)
 .get("/find/:id", controller.getCompanyById)

// New image upload routes
router.post("/upload-profile-image/:id", upload.single('profile_image'), controller.uploadProfileImage)
 .put("/update-profile-image/:id", controller.updateCompanyProfileImage)
 .delete("/delete-profile-image/:id", controller.deleteProfileImage)

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

// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router