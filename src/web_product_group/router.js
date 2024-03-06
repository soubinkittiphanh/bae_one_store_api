

const validateToken = require("../api/jwtApi").validateToken
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

router.use(validateToken)
router.post("/create", controller.create)
    .put("/update/:id", controller.update)
    .delete("/find/:id", controller.delete)
    .get("/find", controller.findActive)
    .get("/findAll", controller.findAll)
    .get("/find/:id", controller.findOne)
    .put("/product_set_groups/:id", controller.assingGroups)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router