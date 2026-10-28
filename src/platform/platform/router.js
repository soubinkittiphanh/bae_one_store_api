const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../../api/jwtApi');

// Public/merchant accessible routes
router.get('/', controller.getAllPlatforms);
router.get('/active', controller.getActivePlatforms);
router.get('/code/:code', controller.getPlatformByCode);
router.get('/:id', controller.getPlatformById);

// Admin-managed routes (protected with token)
router.post('/create', validateToken, controller.createPlatform);
router.put('/update/:id', validateToken, controller.updatePlatform);
router.patch('/toggle-status/:id', validateToken, controller.togglePlatformStatus);
router.delete('/delete/:id', validateToken, controller.deletePlatform);

module.exports = router;
