# Domain Directory & Module Index

`dc_api` powers an expansive multi-vertical enterprise and retail platform. This directory documents each business domain, its key files, database models, and API endpoints.

---

## 1. Core Retail, Restaurant & POS Engine

| Domain | Key Files | Models | Key Endpoints |
| :--- | :--- | :--- | :--- |
| **Sales & Checkout** | [src/sales/controller.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/sales/controller.js), [src/sales/service.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/sales/service.js) | `saleHeader`, `saleLine`, `salePayment` | `/api/sale`, `/api/saleLine`, `/api/sale-payment` |
| **Restaurant Tables & Dining** | [src/pos/table/controller.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/pos/table/controller.js), [src/pos/table/service.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/pos/table/service.js) | `table`, `orderTable` | `/api/tables`, `/api/tables/waiter-calls` |
| **Tickets & Kiosk Receipts** | [src/pos/ticket/controller.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/pos/ticket/controller.js) | `ticket`, `ticketLine` | `/api/ticket`, `/api/ticketLine` |
| **Recipes & Kitchen BOM** | [src/recipe/controller.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/recipe/controller.js) | `recipe` | `/api/recipes` |
| **Promotions & Loyalty** | [src/pos/promotion/controller.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/pos/promotion/controller.js), [src/loyalty/controller.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/loyalty/controller.js) | `promotion`, `MemberOffer`, `loyaltyTransaction` | `/api/promotions`, `/api/member-offers`, `/api/loyalty` |

---

## 2. Product Catalog, Inventory & Stock Flow

| Domain | Key Files | Models | Key Endpoints |
| :--- | :--- | :--- | :--- |
| **Products & Options** | [src/product/controller.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/product/controller.js), [src/productOption/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/productOption) | `product`, `productSize`, `productUnit`, `ProductOption` | `/api/product`, `/api/product-options` |
| **Categories & Units** | [src/category/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/category), [src/unit/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/unit) | `category`, `mainCategory`, `unit` | `/api/category`, `/api/unit` |
| **Stock Transactions** | [src/stockTransaction/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/stockTransaction) | `stockTransactionModel`, `stockDailyBalance` | `/api/stock-transactions` |
| **Purchasing & PO** | [src/purchasing/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/purchasing) | `poHeader`, `poLine`, `poHeaderHIS` | `/api/purchasing`, `/api/purchasing/line` |
| **Goods Receiving** | [src/receiving/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/receiving) | `receivingHeader`, `receivingLine` | `/api/receiving`, `/api/receiving/line` |
| **Warehouse Transfers** | [src/transfer/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/transfer) | `transferHeader`, `transferLine` | `/api/transfer` |

---

## 3. Specialized Multi-Industry Verticals

### A. Beerlao Agency Returnable Packaging
- **Path**: [src/packaging/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/packaging)
- **Models**: `productPackaging`, `customerPackagingLedger`, `supplierPackagingLedger`, `packagingDamageLog`
- **Purpose**: Tracks returnable glass bottle crates, plastic pallets, keg deposits, and bottle returns for Beerlao beverage distributors.

### B. Car Parking Management
- **Path**: [src/parking/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/parking)
- **Models**: `parkingZone`, `parkingSlot`, `parkingVehicle`, `parkingPricingRule`, `parkingMonthlyPass`, `parkingTicket`, `parkingPayment`
- **Purpose**: Automated gate entry check-in, real-time visual slot grid, Day/Night hourly fee engine, cashier checkout, lost ticket penalties, and monthly pass subscriptions.

### C. School & Student Billing
- **Path**: [src/school/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/school), [src/student/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/student), [src/nfcCard/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/nfcCard)
- **Models**: `academicYear`, `schoolClass`, `schoolRoom`, `feeItem`, `feeStructure`, `schoolInvoice`, `schoolPayment`, `cashierShift`, `student`, `nfcCard`
- **Purpose**: Academic terms, student enrollment, fee structures, tuition invoice generation, NFC student card tap-to-pay, and cashier shift reconciliation.

### D. Microfinance & Loans
- **Path**: [src/microfinance/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/microfinance)
- **Models**: `cifCustomer`, `microfinanceGroup`, `mfCollateral`, `mfLoanProduct`, `mfLoanAccount`, `mfRepaymentSchedule`, `mfJournalEntry`
- **Purpose**: Central Customer Information File (CIF), solidarity group lending, collateral tracking, loan repayment schedules, and journal entries.

### E. Multi-Platform Social Commerce
- **Path**: [src/platform/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/platform)
- **Models**: `platform`, `platformAccount`
- **Purpose**: Connected merchant accounts for Facebook Pages, TikTok Shop, Shopee, and Lazada. Enforces tier quotas and encrypts third-party OAuth tokens with AES-256.

### F. Car Care & Auto Wash
- **Path**: [src/carcare/washJob/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/carcare/washJob)
- **Models**: `washjob`, `washjobHis`, `washjobline`
- **Purpose**: Vehicle queue status (waiting, washing, drying, completed), technician commissions, and wash job invoices.

### G. Job Fair & Overseas Employment
- **Path**: [src/job-fair/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/job-fair)
- **Models**: `Agency`, `Applicant`, `MOU`, `jobAdvertise`, `JobBatch`
- **Purpose**: Labor export agreements, applicant dossiers, and recruitment batch management.

---

## 4. Financials, General Ledger & Accounting

| Sub-system | Path | Purpose |
| :--- | :--- | :--- |
| **General Ledger (GL)** | [src/GL/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/GL) | Double-entry journal postings, debit/credit balancing |
| **Chart of Accounts** | [src/account/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/account) | 5-level asset, liability, equity, income, expense chart |
| **Accounts Receivable (AR)** | [src/AR/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/AR) | Customer invoices, credit terms, AR receive headers & lines |
| **Accounts Payable (AP)** | [src/AP/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/AP) | Supplier bills, payment settlements, aging reports |
| **Cash Advances & Projects (PWT)** | [src/PWT/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/PWT) | Government/company money advances, expense settlements, project budgets |
| **Budgets & Targets** | [src/expenseBudget/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/expenseBudget), [src/revenueTarget/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/revenueTarget) | Annual expense budgets, revenue targets |

---

## 5. Payments, Gateway & Peripherals

- **BCEL OnePay Dynamic QR**:
  - Request: [src/QRRequest/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/QRRequest)
  - Response: [src/QRResponse/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/QRResponse)
  - Callback: [src/PaymentCallback/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/PaymentCallback)
- **Thermal Printers**: [src/printer/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/printer) (kitchen, bar, and cashier ESC/POS thermal printer endpoints)
- **Shipping & Logistics**: [src/shipping/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/shipping), [src/shippingOrder/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/shippingOrder) (parcel drop-off, tracking numbers, shipping batch checkouts)
