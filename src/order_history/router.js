
const controller = require("./controller")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
const { body } = require('express-validator');
router.use(validateToken);

// const validationRulesCreate = [
//     body('twoDigits').isFloat({ min: 0 }).withMessage('Two digits must be a positive number'),
//     body('threeDigits').isFloat({ min: 0 }).withMessage('Three digits must be a positive number'),
//     body('fourDigits').isFloat({ min: 0 }).withMessage('Four digits must be a positive number'),
//     body('fiveDigits').isFloat({ min: 0 }).withMessage('Five digits must be a positive number'),
//     body('sixDigits').isFloat({ min: 0 }).withMessage('Six digits must be a positive number'),
//     // body('isActive').isBoolean().withMessage('isActive must be a boolean value'),
//   ];

router.post("/create", controller.create)
    .put("/update/:id", controller.update)
    .put("/changeStatus/:id", controller.updateStatus)
    .delete("/find/:id", controller.delete)
    .get("/find", controller.findAll)
    .get("/findAll", controller.findAll)
    .get("/findAllByDate", controller.findAllByDate)
    .get("/find/:id", controller.findOne)
module.exports = router