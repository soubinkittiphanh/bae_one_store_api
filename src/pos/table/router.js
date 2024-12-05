

const {validateToken} = require("../api/jwtApi")
const tableController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })


router.post('/tables', tableController.createTable);
router.get('/tables', tableController.getAllTables);
router.get('/tables/:id', tableController.getTableById);
router.put('/tables/:id', tableController.updateTable);
router.delete('/tables/:id', tableController.deleteTable);


    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router