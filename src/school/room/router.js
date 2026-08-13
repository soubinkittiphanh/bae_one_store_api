const express = require('express');
const router = express.Router();
const schoolRoomController = require('./controller');

router.post('/', schoolRoomController.create);
router.get('/', schoolRoomController.getAll);
router.put('/update/:id', schoolRoomController.update);
router.delete('/delete/:id', schoolRoomController.delete);

module.exports = router;
