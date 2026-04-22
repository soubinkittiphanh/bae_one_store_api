const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../api/jwtApi');
const multer = require('multer');
const path = require('path');

// Configure multer for SQL file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `restore_${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.sql') {
            cb(null, true);
        } else {
            cb(new Error('Only .sql files are allowed'));
        }
    }
});

// GET /api/database/export - Backup DB
router.get('/export', validateToken, controller.exportDatabase);

// POST /api/database/import - Restore DB
router.post('/import', validateToken, upload.single('file'), controller.importDatabase);

module.exports = router;
