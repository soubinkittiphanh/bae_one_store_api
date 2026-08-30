const express = require('express');
const router = express.Router();
const studentController = require('./controller');
const { uploadFiles } = require('../middleware/multerConfig');

// Create a new student (and their automatic wallet)
router.post('/', studentController.create);

// Upload student photo
router.post('/upload-photo', uploadFiles, studentController.uploadPhoto);

// List all students
router.get('/find', studentController.getAll);

// Get student profile with balance
router.get('/:id', studentController.getProfile);

// The Core POS Route: Identify student by tapping card
// Used in Electron when the ACR122U scans a UID
router.get('/identify/:cardUid', studentController.getByCardUid);


// Update student profile
router.put('/update/:id', studentController.update);

// Get student billing statement and history
router.get('/:id/billing', studentController.getBillingStatement);

// Delete student
router.delete('/delete/:id', studentController.delete);

module.exports = router;