const { validateToken } = require('../../api/jwtApi');
const controller = require('./controller');
const express = require('express');
const router = express.Router();

// Apply JWT token validation
router.use(validateToken);

router
  .post('/create', controller.create)
  .put('/update/:id', controller.update)
  .get('/find', controller.findAll)
  .get('/find/:id', controller.findOne);

module.exports = router;
