// Clean Stock Transaction Routes - Only Routing Logic
const { validateToken } = require("../api/jwtApi");
const controller = require("./controller");
const express = require("express");
const router = express.Router();

// Apply authentication middleware
router.use(validateToken);

// ===========================================
// STOCK TRANSACTION CRUD ROUTES
// ===========================================

router
    .post("/create", 
        controller.validateStockTransaction,
        controller.createStockTransaction
    )
    .get("/findAll", controller.getStockTransactions)
    .get("/find", controller.getStockTransactions)
    .get("/find/:id", controller.getStockTransactionById)
    .delete("/find/:id", controller.deleteStockTransaction)

// Product-specific routes
router
    .get("/product/:productId", controller.getStockTransactionsByProduct)
    .get("/product/:productId/summary", controller.getStockSummary)
    .get("/product/:productId/history", controller.getProductStockHistory)

// Bulk operations
router
    .post("/bulk", controller.bulkCreateStockTransactions)

// Stock management operations
router
    .post("/stock-increase", controller.createStockIncrease)
    .post("/stock-adjust", controller.createStockAdjustment)
    .post("/bulk-stock-increase", controller.bulkStockIncrease)

// Analytics and reporting
router
    .get("/statistics", controller.getStockStatistics)
    .get("/export", controller.exportStockTransactions)
    .get("/report", controller.getStockTransactions)

// Utility endpoints
router
    .get("/recent-suppliers", controller.getRecentSuppliers)

module.exports = router;