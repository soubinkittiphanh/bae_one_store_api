const express = require('express');
const router = express.Router();
const { validateToken } = require('../api/jwtApi');
const controller = require('./controller');

router.use(validateToken);

router
    .get('/find', controller.getDashboardMenus)
    .get('/all', controller.getAllDashboardMenus)
    .get('/mdi-icons', controller.getMdiIcons)
    .get('/groups', controller.getUserGroups)
    .get('/find/:id', controller.getDashboardMenuById)
    .post('/create', controller.createDashboardMenu)
    .put('/update/:id', controller.updateDashboardMenu)
    .delete('/delete/:id', controller.deleteDashboardMenu)
    .delete('/find/:id', controller.deleteDashboardMenu)
    .put('/reorder', controller.reorderDashboardMenus)
    .post('/seed-defaults', controller.seedDefaultShortcuts);

module.exports = router;
