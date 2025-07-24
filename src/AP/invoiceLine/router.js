// ===============================================================
// INVOICE LINE ITEM ROUTES
// ===============================================================
const express = require('express');
const router = express.Router();
const InvoiceLineItemController = require('./controller');

// ===============================================================
// MIDDLEWARE (Add your authentication/authorization middleware here)
// ===============================================================
// const authenticate = require('../middleware/authenticate');
// const authorize = require('../middleware/authorize');

// ===============================================================
// ROUTES
// ===============================================================

// CREATE INVOICE LINE ITEM
// POST /api/invoice-line-items
router.post('/', InvoiceLineItemController.createLineItem);

// BULK CREATE LINE ITEMS
// POST /api/invoice-line-items/bulk
router.post('/bulk', InvoiceLineItemController.bulkCreateLineItems);

// GET LINE ITEMS PENDING GL POSTING
// GET /api/invoice-line-items/pending-gl
router.get('/pending-gl', InvoiceLineItemController.getPendingGLLineItems);

// GET LINE ITEM BY ID
// GET /api/invoice-line-items/:id
router.get('/:id', InvoiceLineItemController.getLineItemById);

// UPDATE LINE ITEM
// PUT /api/invoice-line-items/:id
router.put('/:id', InvoiceLineItemController.updateLineItem);

// DELETE LINE ITEM
// DELETE /api/invoice-line-items/:id
router.delete('/:id', InvoiceLineItemController.deleteLineItem);

// GET GL ENTRIES FOR LINE ITEM
// GET /api/invoice-line-items/:id/gl-entries
router.get('/:id/gl-entries', InvoiceLineItemController.getGLEntries);

// GET LINE ITEMS BY INVOICE ID
// GET /api/invoices/:invoiceId/line-items
router.get('/invoice/:invoiceId', InvoiceLineItemController.getLineItemsByInvoice);

module.exports = router;

// ===============================================================
// USAGE EXAMPLES
// ===============================================================

/*

1. CREATE LINE ITEM
POST /api/invoice-line-items
{
  "invoiceId": "invoice-uuid-123",
  "lineNumber": 1,
  "description": "Office Supplies - Printer Paper",
  "quantity": 10,
  "unitPrice": 8.99,
  "taxRate": 8.5,
  "discountRate": 5.0,
  "DRglAccountId": "gl-account-uuid-456",
  "CRglAccountId": "gl-account-uuid-789",
  "makerId": "user-uuid-123",
  "note": "Bulk purchase discount applied"
}

2. BULK CREATE LINE ITEMS
POST /api/invoice-line-items/bulk
{
  "invoiceId": "invoice-uuid-123",
  "lineItems": [
    {
      "lineNumber": 1,
      "description": "Printer Paper",
      "quantity": 10,
      "unitPrice": 8.99,
      "DRglAccountId": "gl-account-uuid-456",
      "CRglAccountId": "gl-account-uuid-789",
      "makerId": "user-uuid-123"
    },
    {
      "lineNumber": 2,
      "description": "Blue Pens",
      "quantity": 5,
      "unitPrice": 12.50,
      "DRglAccountId": "gl-account-uuid-456",
      "CRglAccountId": "gl-account-uuid-789",
      "makerId": "user-uuid-123"
    }
  ]
}

3. GET LINE ITEMS BY INVOICE
GET /api/invoice-line-items/invoice/invoice-uuid-123

4. GET LINE ITEM BY ID
GET /api/invoice-line-items/line-item-uuid-456

5. UPDATE LINE ITEM
PUT /api/invoice-line-items/line-item-uuid-456
{
  "description": "Updated description",
  "quantity": 12,
  "unitPrice": 9.99,
  "note": "Updated quantity and price"
}

6. DELETE LINE ITEM
DELETE /api/invoice-line-items/line-item-uuid-456

7. GET GL ENTRIES FOR LINE ITEM
GET /api/invoice-line-items/line-item-uuid-456/gl-entries

8. GET PENDING GL LINE ITEMS
GET /api/invoice-line-items/pending-gl

*/

// ===============================================================
// ALTERNATIVE NESTED ROUTES (if you prefer nested under invoices)
// ===============================================================

/*
// Alternative router setup for nested routes under invoices
const express = require('express');
const router = express.Router();
const InvoiceLineItemController = require('../controllers/InvoiceLineItemController');

// All routes are under /api/invoices/:invoiceId/line-items

// GET ALL LINE ITEMS FOR INVOICE
// GET /api/invoices/:invoiceId/line-items
router.get('/', InvoiceLineItemController.getLineItemsByInvoice);

// CREATE LINE ITEM FOR INVOICE
// POST /api/invoices/:invoiceId/line-items
router.post('/', (req, res) => {
  // Add invoiceId from params to body
  req.body.invoiceId = req.params.invoiceId;
  InvoiceLineItemController.createLineItem(req, res);
});

// BULK CREATE LINE ITEMS FOR INVOICE
// POST /api/invoices/:invoiceId/line-items/bulk
router.post('/bulk', (req, res) => {
  // Add invoiceId from params to body
  req.body.invoiceId = req.params.invoiceId;
  InvoiceLineItemController.bulkCreateLineItems(req, res);
});

// GET SPECIFIC LINE ITEM
// GET /api/invoices/:invoiceId/line-items/:lineId
router.get('/:lineId', InvoiceLineItemController.getLineItemById);

// UPDATE LINE ITEM
// PUT /api/invoices/:invoiceId/line-items/:lineId
router.put('/:lineId', InvoiceLineItemController.updateLineItem);

// DELETE LINE ITEM
// DELETE /api/invoices/:invoiceId/line-items/:lineId
router.delete('/:lineId', InvoiceLineItemController.deleteLineItem);

// GET GL ENTRIES FOR LINE ITEM
// GET /api/invoices/:invoiceId/line-items/:lineId/gl-entries
router.get('/:lineId/gl-entries', InvoiceLineItemController.getGLEntries);

module.exports = router;

// In your main app.js, you would use it like:
// app.use('/api/invoices/:invoiceId/line-items', invoiceLineItemRoutes);

*/

// ===============================================================
// INTEGRATION WITH EXPRESS APP
// ===============================================================

/*
// In your main app.js or server.js
const express = require('express');
const invoiceLineItemRoutes = require('./routes/invoiceLineItemRoutes');
const apInvoiceRoutes = require('./routes/apInvoiceRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/invoice-line-items', invoiceLineItemRoutes);
app.use('/api/ap-invoices', apInvoiceRoutes);

// Or if you prefer nested routes:
// app.use('/api/invoices/:invoiceId/line-items', invoiceLineItemRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
*/

// ===============================================================
// COMPLETE API WORKFLOW EXAMPLE
// ===============================================================

/*

WORKFLOW: Creating an Invoice with Line Items

1. CREATE INVOICE
POST /api/ap-invoices
{
  "invoiceNumber": "INV-2025-001",
  "vendorInvoiceNumber": "VENDOR-12345",
  "invoiceDate": "2025-07-22",
  "dueDate": "2025-08-21",
  "description": "Office supplies order",
  "vendorId": "vendor-uuid-123",
  "currencyId": "currency-uuid-456",
  "makerId": "user-uuid-789"
}

2. ADD LINE ITEMS TO INVOICE
POST /api/invoice-line-items/bulk
{
  "invoiceId": "invoice-uuid-from-step-1",
  "lineItems": [
    {
      "lineNumber": 1,
      "description": "Printer Paper A4 - 500 sheets",
      "quantity": 10,
      "unitPrice": 8.99,
      "taxRate": 8.5,
      "DRglAccountId": "office-supplies-expense-account",
      "CRglAccountId": "accounts-payable-account",
      "makerId": "user-uuid-789"
    },
    {
      "lineNumber": 2,
      "description": "Blue Ballpoint Pens - Pack of 12",
      "quantity": 5,
      "unitPrice": 12.50,
      "taxRate": 8.5,
      "DRglAccountId": "office-supplies-expense-account",
      "CRglAccountId": "accounts-payable-account",
      "makerId": "user-uuid-789"
    }
  ]
}

3. VIEW INVOICE WITH LINE ITEMS
GET /api/ap-invoices/invoice-uuid-from-step-1

4. APPROVE INVOICE
POST /api/ap-invoices/invoice-uuid-from-step-1/approve
{
  "checkerId": "approver-user-uuid"
}

5. GENERATE GL ENTRIES FOR LINE ITEMS
GET /api/invoice-line-items/pending-gl

6. POST TO GL (would be handled by GL posting process)
- Get GL entries for each line item
- Create journal entries
- Mark line items as posted

*/