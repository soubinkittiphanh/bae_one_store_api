const express = require('express');
const router = express.Router();
const studentController = require('./controller');

// Create a new student (and their automatic wallet)
router.post('/', studentController.create);

// List all students
router.get('/find', studentController.getAll);

// Get student profile with balance
router.get('/:id', studentController.getProfile);

// The Core POS Route: Identify student by tapping card
// Used in Electron when the ACR122U scans a UID
router.get('/identify/:cardUid', studentController.getByCardUid);


// Update student profile
router.put('/update/:id', studentController.update);

// Delete student
router.delete('/delete/:id', studentController.delete);

module.exports = router;