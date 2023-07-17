const campaignController = require("./controller")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
const {validateToken}= require("../../../../api").jwtApi

router.use(validateToken);

router.post('/create',validator.createCampaignEntryValidator, campaignController.createCampaignEntry);
router.get('/find', campaignController.getAllCampaignEntries);
router.get('/find/:id', campaignController.getCampaignEntryById);
router.put('/update/:id',validator.updateCampaignEntryValidator ,campaignController.updateCampaignEntryById);
router.delete('/delete/:id', campaignController.deleteCampaignEntryById);

module.exports = router;
