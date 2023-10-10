
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

router.post("/create", controller.createTutorial)
    .put("/update/:id", controller.updateTutorial)
    .put("/updateView/:id", controller.increaseViewCount)
    .delete("/find/:id", controller.deleteTutorial)
    .get("/find", controller.getAllActiveTutorials)
    .get("/findAll", controller.getAllTutorials)
    .get("/find/:id", controller.getTutorialById)
module.exports = router