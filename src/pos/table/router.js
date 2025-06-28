

const {validateToken} = require("../../api/jwtApi")
const tableController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })

// Basic CRUD routes
router.get('/', tableController.getAllTables);
router.get('/:id', tableController.getTableById);
router.post('/', tableController.createTable);
router.put('/:id', tableController.updateTable);
router.delete('/:id', tableController.deleteTable);

// Special routes
router.get('/number/:number', tableController.getTableByNumber);
router.patch('/:id/status', tableController.updateTableStatus);
router.get('/filter/available', tableController.getAvailableTables);
router.get('/filter/occupied', tableController.getOccupiedTables);
router.patch('/bulk/status', tableController.bulkUpdateStatus);
// New routes for customer seating
router.post('/:id/seat-customer', tableController.seatCustomer);
router.post('/:id/clear', tableController.clearTable);

    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router