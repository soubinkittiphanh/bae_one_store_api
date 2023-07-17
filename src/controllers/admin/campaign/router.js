const campaignController = require("./controller")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../../../api').jwtApi
const { body } = require('express-validator');

router.use(validateToken);

const validationRulesCreate = [
    body('title').not().isEmpty().withMessage('Title is required'),
    body('start').not().isEmpty().withMessage('Start date is required'),
    body('end').not().isEmpty().withMessage('End date is required'),
    body('product').not().isEmpty().withMessage('Product is required'),
    body('budget').isFloat({ min: 0 }).withMessage('Budget must be a positive number'),
]
router.post('/create',validationRulesCreate, campaignController.create);
router.get('/find', campaignController.findAll);
router.get('/find_summary', campaignController.findCampaignWithSummary);
router.get('/find/:id', campaignController.findOne);
router.put('/update/:id', campaignController.update);
router.delete('/delete/:id', campaignController.delete);

module.exports = router;
