const express = require('express');
const router = express.Router();
const { validateToken } = require('../api/jwtApi');
const { requirePermission } = require('./middleware');
const controller = require('./controller');

router.use(validateToken);

// Any logged-in user may read their own permissions (UIs use it to hide actions)
router.get('/my-permissions', controller.myPermissions);

// Group x function grant matrix
router.get('/matrix', requirePermission('SEC_GRANT', 'VIEW'), controller.matrix);
router.put('/grants', requirePermission('SEC_GRANT', 'EDIT'), controller.setGrant);

module.exports = router;
