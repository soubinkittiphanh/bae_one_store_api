
const bankController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.get("/find", bankController.findAll);
router.post("/create", bankController.create);
router.post("/update", bankController.update);
module.exports = router