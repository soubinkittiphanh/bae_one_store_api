const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../../api/jwtApi');

// Protect all account routes with token validation
router.use(validateToken);

// Merchant connected account management
router.get('/', controller.getAccountsByCompany);
router.get('/quota', controller.checkCompanyQuota);
router.get('/:id', controller.getAccountById);
router.post('/connect', controller.connectAccount);
router.put('/update/:id', controller.updateAccount);
router.post('/disconnect/:id', controller.disconnectAccount);
router.delete('/delete/:id', controller.deleteAccount);

// Admin-managed quota upgrade route
router.post('/admin/quota', controller.updateCompanyQuota);

module.exports = router;
