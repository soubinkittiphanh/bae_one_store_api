const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../../api').jwtApi;


router.get('/city-wide-impact', controller.getCityWideImpact);
router.get('/user-milestones', controller.getUserMilestones);
router.get('/waste-hotspots', controller.getWasteHotspots);

module.exports = router;
