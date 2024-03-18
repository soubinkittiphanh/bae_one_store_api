const controller = require('../controllers/financial/generalLedger')
const express = require('express')
const router = express.Router();
const {body,validationResult,check} = require('express-validator')
const validator = require('validator');
router.use((req,res,next)=>{
    // res.send("test")
    console.log('Routing for GL');
    next()
})


const validateTransaction = [
  body('accountNumber').exists().isInt(),
  body('bookingDate').exists().isISO8601(),
  body('postingReference').exists().isString(),
  body('debit').exists().isNumeric(),
  body('credit').exists().isNumeric(),
  body('description').exists().isString(),
  body('descriptionLL').exists().isString(),
  body('currency').exists().isString(),
  body('rate').exists().isNumeric(),
  body('source').exists().isString()
];
const createValidation = [
body('accountNumber').notEmpty().withMessage('accountNumber is required'),
body('bookingDate').notEmpty().withMessage('booking date is required'),
body('postingReference').notEmpty().withMessage('reference  is required'),
body('description').notEmpty().withMessage('descrition is required'),
body('source').notEmpty().withMessage('posting source is required'),
body('debit').notEmpty().withMessage('debit amount is required'),
body('credit').notEmpty().withMessage('credit amount is required'),
]

const updateValidation = [
    body("accountName").notEmpty().withMessage("Account name is require"),
    body("id").notEmpty().withMessage("Id  is require"),
]
router
.post('/generate',controller.generateGL)
.get("/find",controller.findAll)
.post("/create",createValidation,controller.create)
.put("/update",updateValidation,controller.update)
.delete("/delete/:id",controller.deleteGLById)





module.exports = router;