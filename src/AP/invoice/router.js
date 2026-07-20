// ===============================================================
// AP INVOICE ROUTES
// ===============================================================
const express = require('express');
const router = express.Router();
const APInvoiceController = require('./controller');
const {apInvoice}  = require("../../models");
// ===============================================================
// MIDDLEWARE (Add your authentication/authorization middleware here)
// ===============================================================
// const authenticate = require('../middleware/authenticate');
// const authorize = require('../middleware/authorize');

// ===============================================================
// ROUTES
// ===============================================================

const { uploadFiles } = require('../../middleware/multerConfig');

// CREATE AP INVOICE
// POST /api/ap-invoices
router.post('/', uploadFiles, APInvoiceController.createInvoice);

// GET ALL AP INVOICES WITH FILTERS
// GET /api/ap-invoices?page=1&limit=10&status=draft&vendorId=123&startDate=2025-01-01&endDate=2025-12-31&search=INV
router.get('/', APInvoiceController.getAllInvoices);
router.get('/sequence', APInvoiceController.getNextInvoiceNumber);

// GET AP INVOICE BY ID
// GET /api/ap-invoices/:id
router.get('/:id', APInvoiceController.getInvoiceById);
router.get('/audit/:id', APInvoiceController.getInvoiceAuditById);

// UPDATE AP INVOICE
// PUT /api/ap-invoices/:id
router.put('/:id', uploadFiles, APInvoiceController.updateInvoice);

// APPROVE AP INVOICE
// POST /api/ap-invoices/:id/approve
router.post('/:id/approve', APInvoiceController.approveInvoice);

// CANCEL AP INVOICE
// POST /api/ap-invoices/:id/cancel
router.post('/:id/cancel', APInvoiceController.cancelInvoice);

// GET OVERDUE INVOICES
// GET /api/ap-invoices/reports/overdue
router.get('/reports/overdue', APInvoiceController.getOverdueInvoices);

// GET AP SUMMARY
// GET /api/ap-invoices/reports/summary
router.get('/reports/summary', APInvoiceController.getAPSummary);
router.get('/invoices/outstanding', APInvoiceController.getOutstandingInvoices);

module.exports = router;

// ===============================================================
// USAGE EXAMPLES
// ===============================================================

/*

1. CREATE AP INVOICE
POST /api/ap-invoices
{
  "invoiceNumber": "INV-2025-001",
  "vendorInvoiceNumber": "VENDOR-12345",
  "invoiceDate": "2025-07-22",
  "dueDate": "2025-08-21",
  "description": "Office supplies for Q3",
  "totalAmount": 1500.00,
  "exchangeRate": 1.00,
  "vendorId": "vendor-uuid-123",
  "currencyId": "currency-uuid-456",
  "makerId": "user-uuid-789",
  "note": "Urgent payment required"
}

2. GET ALL INVOICES WITH FILTERS
GET /api/ap-invoices?page=1&limit=10&status=draft&vendorId=vendor-123

3. GET INVOICE BY ID
GET /api/ap-invoices/invoice-uuid-123

4. UPDATE INVOICE
PUT /api/ap-invoices/invoice-uuid-123
{
  "description": "Updated description",
  "totalAmount": 1600.00,
  "note": "Updated note"
}

5. APPROVE INVOICE
POST /api/ap-invoices/invoice-uuid-123/approve
{
  "checkerId": "approver-user-uuid-456"
}

6. CANCEL INVOICE
POST /api/ap-invoices/invoice-uuid-123/cancel
{
  "reason": "Vendor invoice was incorrect"
}

7. GET OVERDUE INVOICES
GET /api/ap-invoices/reports/overdue

8. GET AP SUMMARY
GET /api/ap-invoices/reports/summary

*/

// ===============================================================
// INTEGRATION WITH EXPRESS APP
// ===============================================================

/*
// In your main app.js or server.js
const express = require('express');
const apInvoiceRoutes = require('./routes/apInvoiceRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/ap-invoices', apInvoiceRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
*/