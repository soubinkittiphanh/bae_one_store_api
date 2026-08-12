const { validateToken } = require("../api/jwtApi");
const ProductOptionController = require("./controller");
const express = require("express");
const router = express.Router();

router.use(validateToken);

router.post('/', ProductOptionController.createOption);
router.put('/:id', ProductOptionController.updateOption);
router.delete('/:id', ProductOptionController.deleteOption);

module.exports = router;
