
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post("/create", controller.createTerminal)
    .put("/update/:id", controller.updateTerminal)
    .delete("/find/:id", controller.deleteTerminal)
    .get("/find", controller.getAllTerminals)
    .get("/find/:id", controller.getTerminalById)
module.exports = router