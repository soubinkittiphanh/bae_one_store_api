const { validateToken } = require('../../api/jwtApi');
const controller = require('./controller');
const express = require('express');
const router = express.Router();

router.use(validateToken);

router
  .post('/preview-schedule', controller.previewSchedule)
  .post('/create', controller.create)
  .post('/pay/:id', controller.makePayment)
  .get('/find', controller.findAll)
  .get('/find/:id', controller.findOne);

module.exports = router;
