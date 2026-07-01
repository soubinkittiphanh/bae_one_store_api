const controller = require("./controller")
const express = require("express")
const router = express.Router()
const { validateToken } = require('../../api').jwtApi

router.use(validateToken);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
