

const {validateToken} = require("../../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
router.use(validateToken)
router
    .post("/create", controller.createMenuLine)  
    .post("/generate", controller.generateMenuLine)  
    .put("/update/:id", controller.updateMenuLine)
    .delete("/find/:id", controller.deleteMenuLine)
    .get("/find", controller.getMenuLines)
    .get("/find/:id", controller.getMenuLineById)
module.exports = router