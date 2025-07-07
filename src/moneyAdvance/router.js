
const controller = require("./controller")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
const { body } = require('express-validator');
router.use(validateToken);
const MoneyAdvanceController = require('./controller');

// GET routes
router.get('/', MoneyAdvanceController.getAll);
router.get('/dashboard', MoneyAdvanceController.getDashboard);
router.get('/:id', MoneyAdvanceController.getById);

// POST routes
router.post('/', MoneyAdvanceController.create);

// PUT routes
router.put('/:id', MoneyAdvanceController.update);
router.put('/:id/approve', MoneyAdvanceController.approve);
router.put('/:id/settle', MoneyAdvanceController.settle);

// DELETE routes
router.delete('/:id', MoneyAdvanceController.delete);

module.exports = router;