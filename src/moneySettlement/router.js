
const controller = require("./controller")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
const { body } = require('express-validator');
router.use(validateToken);

const SettlementController = require('./controller');

// GET routes
router.get('/', SettlementController.getAll);
router.get('/dashboard', SettlementController.getDashboard);
router.get('/by-advance/:moneyAdvanceId', SettlementController.getByAdvanceId);
router.get('/:id', SettlementController.getById);

// POST routes
router.post('/', SettlementController.create);

// PUT routes
router.put('/:id', SettlementController.update);

// DELETE routes
router.delete('/:id', SettlementController.delete);

module.exports = router;
