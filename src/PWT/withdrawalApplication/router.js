const controller = require("./controller")
const express = require("express")
const router = express.Router()
const { validateToken } = require('../../api').jwtApi

router.use(validateToken);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id/status', controller.updateStatus);

module.exports = router;
