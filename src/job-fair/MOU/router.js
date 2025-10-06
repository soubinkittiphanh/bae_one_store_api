// routes/mou.js
const express = require('express');
const router = express.Router();
const MOUController = require('./controller');
const { uploadFiles } = require('../../middleware/multerConfig'); // Import multer config


// Routes with file upload support
router.post('/', uploadFiles, MOUController.createMOU);
router.put('/:id', uploadFiles, MOUController.updateMOU);

// File management routes
router.delete('/image/:imageId', MOUController.deleteImage);
router.delete('/:mouId/document/:documentIndex', MOUController.deleteDocument);
// router.get('/download/:type/:id/:filename?', MOUController.downloadFile);
// router.get('/download/document/:mouId/:documentIndex', MOUController.downloadFile);
// Download routes - OPTION 2: Separate functions (RECOMMENDED)
router.get('/download/image/:imageId', MOUController.downloadImage);
router.get('/download/document/:mouId/:documentIndex', MOUController.downloadDocument);

// Existing routes (without file upload)
router.get('/', MOUController.getAllMOUs);
// router.get('/statistics', MOUController.getMOUStatistics);
router.get('/statistics', MOUController.getStatistics);
router.get('/status/:status', MOUController.getMOUsByStatus);
router.get('/:id', MOUController.getMOUById);
router.get('/:id/batch', MOUController.getBatchByMouId);
router.patch('/:mouId/status', MOUController.updateMOUStatus);
router.patch('/:id/invoice-stats', MOUController.getInvoiceStat);
router.delete('/:id', MOUController.deleteMOU);


module.exports = router;