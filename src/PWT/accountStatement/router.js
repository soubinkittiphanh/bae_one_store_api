// routes/accountStatementRoutes.js
const express = require('express');
const router = express.Router();
const accountStatementController = require('./controller');

// Middleware (adjust based on your auth setup)
// const { authenticate, authorize } = require('../middleware/auth');

// ===============================================================
// ACCOUNT STATEMENT ROUTES
// ===============================================================

// Create new account statement
router.post('/', 
    // authenticate, 
    accountStatementController.createAccountStatement
);

// Get all account statements (with filters)
router.get('/', 
    // authenticate, 
    accountStatementController.getAllAccountStatements
);

// Get balance summary
router.get('/summary', 
    // authenticate, 
    accountStatementController.getAccountBalanceSummary
);

// Get account statement by ID
router.get('/:id', 
    // authenticate, 
    accountStatementController.getAccountStatementById
);

// Update account statement
router.put('/:id', 
    // authenticate, 
    accountStatementController.updateAccountStatement
);

// Delete account statement
router.delete('/:id', 
    // authenticate, 
    // authorize(['admin']), 
    accountStatementController.deleteAccountStatement
);

// Reconcile account statement
router.patch('/:id/reconcile', 
    // authenticate, 
    accountStatementController.reconcileAccountStatement
);

// Bulk create account statements
router.post('/bulk', 
    // authenticate, 
    accountStatementController.bulkCreateAccountStatements
);

module.exports = router;