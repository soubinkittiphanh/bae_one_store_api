

const {validateToken} = require("../api/jwtApi")
const productSizeController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })const productSizeController = require('../controllers/productSizeController');

router.post('/', productSizeController.create);
router.get('/', productSizeController.getAll);
router.get('/product/:productId', productSizeController.getByProductId);
router.put('/:id', productSizeController.update);
router.delete('/:id', productSizeController.delete);

module.exports = router;