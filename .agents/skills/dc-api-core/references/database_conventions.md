# Database & Sequelize Conventions

This guide documents the database architecture, connection pooling, timezone rules, and Sequelize best practices for `dc_api`.

---

## 1. Connection Architecture & Cloud WAN Resiliency

The API frequently communicates with remote MariaDB cloud databases (e.g., cloud MariaDB instances on port 3306 or WAN IPs). To prevent dropped connections, idle timeouts, and stale sockets, [src/models/index.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/models/index.js) enforces:

```javascript
const defaultOptions = {
  host: env.host,
  dialect: 'mariadb',
  port: env.port,
  timezone: '+07:00',
  pool: {
    max: 10,
    min: 0,        // Do not hold idle connections open indefinitely
    acquire: 60000,// 60s timeout for obtaining a connection from pool
    idle: 10000,   // Release idle socket after 10s (remote DB wait_timeout is 60s)
    evict: 10000   // Evict dead/idle connections every 10s
  },
  dialectOptions: {
    useUTC: false,        // Never convert datetime strings to UTC
    dateStrings: true,    // Return dates directly as strings
    connectTimeout: 60000,
    socketTimeout: 60000,
    keepAliveDelay: 10000 // Send TCP Keep-Alive every 10s
  },
  retry: {
    max: 3,
    match: [
      /SequelizeConnectionError/,
      /ER_CONNECTION_TIMEOUT/,
      /Connection timeout/,
      /ECONNRESET/,
      /ETIMEDOUT/,
      /EPIPE/,
      /PROTOCOL_CONNECTION_LOST/
    ]
  }
};
```

---

## 2. Timezone Standards (`Asia/Vientiane`)

All timestamps, reporting queries, and business date logic in Laos operate on **UTC+7** (`Asia/Vientiane`).

### Rules:
1. **Never use `new Date().toISOString()` when querying date boundaries**. That converts to UTC (subtracts 7 hours), shifting midnight back into yesterday.
2. **Use formatted date strings**:
   ```javascript
   // Format: YYYY-MM-DD
   const todayVientiane = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });
   ```
3. **Database Date Columns**: Use `DataTypes.DATE` for timestamps and `DataTypes.DATEONLY` for calendar-only dates (`YYYY-MM-DD`).

---

## 3. Financial & Numeric Field Standards

In the Lao banking and commerce ecosystem, Kip (LAK) numbers are large, and Thai Baht (THB) / US Dollar (USD) require precise cents:

| Value Type | Sequelize Type | SQL Definition | Example |
| :--- | :--- | :--- | :--- |
| **Monetary Amounts / Prices** | `DataTypes.DECIMAL(18, 2)` | `DECIMAL(18,2) NOT NULL DEFAULT 0.00` | `1500000.00` |
| **Quantities / Units** | `DataTypes.DECIMAL(12, 3)` | `DECIMAL(12,3) NOT NULL DEFAULT 0.000` | `2.500` |
| **Percentages / Rates** | `DataTypes.DECIMAL(5, 2)` | `DECIMAL(5,2) NOT NULL DEFAULT 0.00` | `10.00` (10%) |
| **Foreign Keys / IDs** | `DataTypes.INTEGER` | `INT(11) NOT NULL` | `1001` |

---

## 4. Sequelize Association Standards

Define associations inside `defineAssociations(db)` in [src/models/index.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/models/index.js#L330).

### Example Pattern:
```javascript
const defineParkingAssociations = (db) => {
  // Zone has many Slots
  db.parkingZone.hasMany(db.parkingSlot, {
    foreignKey: 'zoneId',
    as: 'slots'
  });
  db.parkingSlot.belongsTo(db.parkingZone, {
    foreignKey: 'zoneId',
    as: 'zone'
  });

  // Ticket belongs to Slot and Vehicle
  db.parkingTicket.belongsTo(db.parkingSlot, {
    foreignKey: 'slotId',
    as: 'slot'
  });
  db.parkingTicket.belongsTo(db.parkingVehicle, {
    foreignKey: 'vehicleId',
    as: 'vehicle'
  });
};
```

### Guidelines for Querying with Associations:
- Always specify `as` matching the alias defined in `defineAssociations`:
  ```javascript
  const ticket = await db.parkingTicket.findByPk(id, {
    include: [
      { model: db.parkingSlot, as: 'slot' },
      { model: db.parkingZone, as: 'zone' }
    ]
  });
  ```

---

## 5. SQL Migrations & Schema Scripts

### Naming Convention:
`YYYYMMDD_<action>_<feature>_tables.sql`  
Example: `20261025_create_parking_tables.sql`

### Structure:
```sql
-- Create table if not exists with utf8mb4 collation
CREATE TABLE IF NOT EXISTS `parking_zones` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `companyId` INT(11) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `isActive` TINYINT(1) DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parking_zones_company` (`companyId`),
  KEY `idx_parking_zones_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 6. Dynamic Schema Alterations (`src/helper/sqlExecutor.js`)

Because multiple client databases run against this codebase without a centralized migration lock, avoid putting risky `ALTER TABLE DROP COLUMN` queries directly into startup files. Instead:

1. Use [src/helper/sqlExecutor.js](file:///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/helper/sqlExecutor.js) to inspect `INFORMATION_SCHEMA.COLUMNS` or `KEY_COLUMN_USAGE`.
2. Dynamically look up foreign key constraint names before dropping (constraint names vary across MariaDB installs).
3. Execute the alteration in the background so API boot is never blocked.
