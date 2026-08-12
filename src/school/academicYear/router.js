const express = require('express');
const router = express.Router();
const academicYearController = require('./controller');

router.post('/', academicYearController.create);
router.get('/', academicYearController.getAll);
router.put('/update/:id', academicYearController.update);
router.delete('/delete/:id', academicYearController.delete);

module.exports = router;
