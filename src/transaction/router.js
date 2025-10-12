
const transactionController = require("./controller")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
router.use(validateToken);

router.post('/', transactionController.create);
router.get('/', transactionController.getAll);
router.get('/:id', transactionController.getById);
router.put('/:id', transactionController.update);
router.patch('/:id/deactivate', transactionController.deactivate);
router.delete('/:id', transactionController.delete);

module.exports = router;
