

const {validateToken} = require("../../api/jwtApi")
const { requirePosGrant } = require("../../security/middleware")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
router.use(validateToken)
router
    .post("/create", requirePosGrant("MENU", "EDIT"), controller.createMenuLine)  
    .post("/generate", requirePosGrant("MENU", "EDIT"), controller.generateMenuLine)  
    .put("/update/:id", requirePosGrant("MENU", "EDIT"), controller.updateMenuLine)
    .delete("/find/:id", requirePosGrant("MENU", "EDIT"), controller.deleteMenuLine)
    .get("/find", controller.getMenuLines)
    .get("/find/:id", controller.getMenuLineById)
module.exports = router