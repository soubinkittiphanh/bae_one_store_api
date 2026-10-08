const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateExpenseBudget, validateUpdateExpenseBudget } = require('./validator');

// Summary & Check headroom endpoints
router.get('/summary/:year', controller.getBudgetSummary);
router.get('/check-headroom', controller.checkHeadroom);

// Standard CRUD
router.get('/find', controller.getAllBudgets);
router.get('/find/:id', controller.getBudgetById);
router.post('/create', validateExpenseBudget, controller.createBudget);
router.put('/update/:id', validateUpdateExpenseBudget, controller.updateBudget);
router.patch('/toggle-status/:id', controller.toggleBudgetStatus);

module.exports = router;
