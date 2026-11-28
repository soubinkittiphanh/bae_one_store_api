// Clean Stock Transaction Routes - Only Routing Logic
const { validateToken } = require("../api/jwtApi");
const { requirePosGrant } = require("../security/middleware");
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
        requirePosGrant("STOCK", "EDIT"),
        controller.validateStockTransaction,
        controller.createStockTransaction
    )
    .get("/findAll", controller.getStockTransactions)
    .get("/find", controller.getStockTransactions)
    .get("/find/:id", controller.getStockTransactionById)
    .delete("/find/:id", requirePosGrant("STOCK", "EDIT"), controller.deleteStockTransaction)

// Product-specific routes
router
    .get("/product/:productId", controller.getStockTransactionsByProduct)
    .get("/product/:productId/summary", controller.getStockSummary)
    .get("/product/:productId/history", controller.getProductStockHistory)

// Bulk operations
router
    .post("/bulk", requirePosGrant("STOCK", "EDIT"), controller.bulkCreateStockTransactions)

// Stock management operations
router
    .post("/stock-increase", requirePosGrant("STOCK", "EDIT"), controller.createStockIncrease)
    .post("/stock-adjust", requirePosGrant("STOCK", "EDIT"), controller.createStockAdjustment)
    .post("/bulk-stock-increase", requirePosGrant("STOCK", "EDIT"), controller.bulkStockIncrease)

// Analytics and reporting
router
    .get("/statistics", controller.getStockStatistics)
    .get("/export", controller.exportStockTransactions)
    .get("/report", controller.getStockTransactions)

// Utility endpoints
router
    .get("/recent-suppliers", controller.getRecentSuppliers)

module.exports = router;