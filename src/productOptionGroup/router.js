const { validateToken } = require("../api/jwtApi");
const ProductOptionGroupController = require("./controller");
const express = require("express");
const router = express.Router();

router.use(validateToken);

router.post('/', ProductOptionGroupController.createGroup);
router.get('/product/:productId', ProductOptionGroupController.getGroupsByProduct);
router.put('/:id', ProductOptionGroupController.updateGroup);
router.delete('/:id', ProductOptionGroupController.deleteGroup);

module.exports = router;
