---
name: dc-api-core
description: >-
  Core architectural standards, development workflows, database conventions, and runbooks
  for the dc_api backend (Dcommerce Express / MariaDB / Sequelize API).
  Use when creating or modifying API modules, controllers, services, Sequelize models,
  writing migrations, configuring routes, implementing auth/middleware, or seeding menus.
---

# DC-API Core Architecture & Development Runbook

`dc_api` is the backend REST API engine for the **Dcommerce** multi-tenant enterprise suite, powering [dc_web](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/dc_web.code-workspace) (Nuxt 2 / Vuetify Admin Web Portal) and `dc_pos` (Flutter Mobile POS).

---

## 1. Quick Project & Environment Context

- **Runtime & Framework**: Node.js (CommonJS `require`), [Express.js 4.x](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/app.js)
- **Database ORM**: [Sequelize 6.x](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/models/index.js) running on **MariaDB 10.x / MySQL 8.x**
- **Strict Timezone**: `Asia/Vientiane` (+07:00). UTC conversion is explicitly disabled (`useUTC: false`, `dateStrings: true`).
- **Database Multi-Tenancy**: Tenant and business isolation is scoped via `companyId` (with `clientId` / `tenantId` in shared modules).
- **WAN & Remote DB Resiliency**: Connection pool uses `min: 0`, `idle: 10000`, `evict: 10000`, and automatic retries to prevent connection drops across remote cloud MariaDB nodes.

---

## 2. Standard 6-Step Module Implementation Lifecycle

Every new feature or business vertical in `dc_api` follows this mandatory 6-step lifecycle:

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────────┐
│ 1. SQL DDL  │ ──> │ 2. Sequelize │ ──> │ 3. Register in Model  │
│  Migration  │     │    Model     │     │    Index & Assocs     │
└─────────────┘     └──────────────┘     └───────────────────────┘
                                                     │
┌─────────────┐     ┌──────────────┐                 │
│ 6. App Mount│ <── │ 5. Router &  │ <── 4. Service & Controller
│  & Menu Seed│     │  Validation  │
└─────────────┘     └──────────────┘
```

### Step 1: SQL Migration Script (`YYYYMMDD_create_<feature>_tables.sql`)
- Place DDL in the project root: `YYYYMMDD_create_<feature>_tables.sql`.
- Follow MariaDB InnoDB conventions: `utf8mb4_unicode_ci`, explicit foreign keys, indexing for `companyId`, `createdAt`, `status`.

### Step 2: Sequelize Model (`src/<feature>/model.js` or `models/`)
- Export a function `(sequelize, DataTypes) => sequelize.define('tableName', { ... }, { freezeTableName: true, timestamps: true })`.
- For multi-file domain groups (like `parking`, `school`, `packaging`), place models in `src/<feature>/models/`.

### Step 3: Register in Central Models Index (`src/models/index.js`)
- Import into `initializeModels()` in [src/models/index.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/models/index.js#L113).
- Define associations in `defineAssociations()` (e.g., `hasMany`, `belongsTo`) with explicit `foreignKey` and `as` aliases.

### Step 4: Business Service (`src/<feature>/service.js`)
- Encapsulate all database queries, domain logic, fee calculations, and multi-table updates.
- Wrap multi-table modifications inside `sequelize.transaction(async (t) => { ... })`.

### Step 5: Controller & Validator (`src/<feature>/controller.js`, `validation.js`)
- Extract `userId` from `req.user?.id` (injected by `validateToken`).
- Return standard JSON envelope: `{ success: true, message: '...', data: ... }` or `{ success: false, message: err.message }`.
- Log failures using [src/api/logger.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/api/logger.js): `logger.error(...)`.

### Step 6: Router Registration & Menu Seeding
1. Map routes in `src/<feature>/router.js`, applying [validateToken](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/api/jwtApi.js#L5) and role checks.
2. Export router in [src/router/index.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/router/index.js).
3. Mount route prefix in [src/app.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/app.js) (e.g. `app.use('/api/<feature>', myRouter.<feature>)`).
4. Create idempotent menu seed script: `seed_<feature>_menus.js`.

> [!TIP]
> For complete copy-pasteable boilerplates of all 6 components, see [references/module_blueprint.md](./references/module_blueprint.md).

---

## 3. Database & Query Guidelines

### Timezone & Date Configuration
Never allow UTC string conversions for Lao local time:
```javascript
// Correct date retrieval for queries
const todayVientiane = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' }); // 'YYYY-MM-DD'
```

### Managed Transactions
Always use managed transactions for multi-statement atomic operations:
```javascript
const { sequelize } = require('../models/database');

const result = await sequelize.transaction(async (t) => {
  const record = await db.myModel.create({ ...data }, { transaction: t });
  await db.auditLog.create({ ...log }, { transaction: t });
  return record;
});
```

### Dynamic Startup Alterations (`sqlExecutor.js`)
Any schema reconciliation, constraint dropping, or dynamic alter commands that must run safely across customer databases without crashing server startup should be registered in [src/helper/sqlExecutor.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/helper/sqlExecutor.js).

> [!NOTE]
> Read [references/database_conventions.md](./references/database_conventions.md) for full details on connection pooling, query optimization, and Sequelize association rules.

---

## 4. Navigation & Menu Seeding System

Web Admin (`dc_web`) dynamically loads its sidebar from `menu_header` and `menu_line` tables. All new modules must seed bilingual menu items:

| Field | Description | Example |
| :--- | :--- | :--- |
| `code` | Header identifier (<= 10 chars) | `'PARKING'`, `'PLATFORM'` |
| `name` | English Display Name | `'Parking Management'` |
| `llname` | Lao Language Display Name (`Noto Sans Lao`) | `'ລະບົບຄຸ້ມຄອງບ່ອນຈອດລົດ'` |
| `icon` | Material Design Icon class | `'mdi-car-brake-parking'` |
| `path` | Vue Router Path for `dc_web` | `'/admin/parking/zones'` |
| `target_systems` | Target client classification | `'ALL'`, `'RETAIL'`, `'RESTAURANT'` |

Menu seed scripts must be idempotent using `findOrCreate`:
```bash
node seed_<feature>_menus.js
```

---

## 5. Security & Authentication

- **JWT Validation**: Use `const { validateToken } = require('../api/jwtApi')`. Extracts user into `req.user`.
- **Sensitive Token Encryption**: When storing third-party secrets (e.g., Facebook / TikTok / Shopee OAuth tokens), use [src/platform/tokenHelper.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/platform/tokenHelper.js) (`encryptToken` / `decryptToken` with AES-256-CBC).
- **Public vs Protected Routes**: Public webhook callbacks (such as BCEL OnePay `/api/v1/direct/callback`) must bypass `validateToken` and be mounted before authenticated middleware in [src/app.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/app.js#L102).

---

## 6. Operational Runbooks & Commands

| Task | Command | Notes |
| :--- | :--- | :--- |
| **Start Development API** | `npm run dev` | Runs nodemon with `TZ=Asia/Vientiane` |
| **Start Production API** | `npm start` | Runs node with `TZ=Asia/Vientiane` |
| **Apply DB Migration** | `mysql -u root -p <db_name> < <migration_file>.sql` | Or execute in MariaDB client |
| **Seed Menus** | `node seed_<feature>_menus.js` | Idempotent sidebar menu insertion |
| **Run Standalone Test** | `node test_<feature>_services.js` | Direct end-to-end service verification |

---

## 7. Multi-Industry Business Domains

`dc_api` supports several specialized business verticals. Review the comprehensive [references/domain_directory.md](./references/domain_directory.md) for module paths and responsibilities:

1. **POS & Restaurant Ordering**: [src/sales/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/sales), [src/pos/table/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/pos/table), [src/pos/ticket/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/pos/ticket)
2. **Beerlao Returnable Packaging Ledger**: [src/packaging/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/packaging)
3. **Car Parking Management**: [src/parking/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/parking)
4. **School Fee & Tuition Billing**: [src/school/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/school)
5. **Microfinance (CIF & Loan Accounts)**: [src/microfinance/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/microfinance)
6. **Multi-Platform Social Commerce**: [src/platform/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/platform)
7. **Financials & Accounting (GL, AR/AP, Advances)**: [src/GL/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/GL), [src/AR/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/AR), [src/AP/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/AP), [src/PWT/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/PWT)
8. **BCEL OnePay Dynamic QR Payment**: [src/QRRequest/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/QRRequest), [src/PaymentCallback/](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/PaymentCallback)
