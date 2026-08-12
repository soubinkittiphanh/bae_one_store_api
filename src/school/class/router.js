const express = require('express');
const router = express.Router();
const schoolClassController = require('./controller');

router.post('/', schoolClassController.create);
router.get('/', schoolClassController.getAll);
router.put('/update/:id', schoolClassController.update);
router.delete('/delete/:id', schoolClassController.delete);

module.exports = router;
