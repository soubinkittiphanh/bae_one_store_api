const express = require('express');
const { validateToken } = require('../../api/jwtApi');
const controller = require('./controller');

const router = express.Router();
router.use(validateToken);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.changeStatus);
router.patch('/:id/hold', controller.hold);

module.exports = router;
