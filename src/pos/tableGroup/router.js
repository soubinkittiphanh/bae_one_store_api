

const {validateToken} = require("../api/jwtApi")
const tableGroupController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post('/table-groups', tableGroupController.createTableGroup);
router.get('/table-groups', tableGroupController.getAllTableGroups);
router.get('/table-groups/:id', tableGroupController.getTableGroupById);
router.put('/table-groups/:id', tableGroupController.updateTableGroup);
router.delete('/table-groups/:id', tableGroupController.deleteTableGroup);

    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router