/**
 * Recipe / BOM, Step 1: schema only. No stock data is moved and no sale flow changes.
 *
 *  - product.stockMode ENUM('card','quantity') DEFAULT 'card'
 *      'card'     = today's behaviour: one `card` row per unit (retail goods, returnable packaging).
 *      'quantity' = raw material tracked as a decimal balance in stock_balances (grams, ml, ...).
 *    Every existing product stays 'card'. Switching a product is an explicit action (Step 2).
 *  - stock_balances: one row per (product, location) for 'quantity' products.
 *      quantity is in the product's stock unit (stockUnitId, else baseUnitId); avg_cost is LCY per that unit.
 *  - stock_transactions (existing ledger, written by nothing yet): + location_id, created_by, reversal_of_id,
 *      extra transaction_type / reference_type values, DECIMAL(18,x) quantities so gram totals fit.
 *  - recipe_stock_impacts: one row per ingredient consumed by a sold line (ticket line or sale line),
 *      so voids/refunds can reverse exactly what was deducted. Replaces the never-registered old model.
 *
 * product.stock_count is NOT changed: the Flutter app reads it as an int and DECIMAL would arrive as "12.0000".
 *
 * Runs at server startup after sequelize.sync (src/models/index.js) on every client DB, and by hand with
 * `node pos_migrate.js up`. Idempotent: each table/column/index/FK is created only when missing, so it also
 * completes a schema that sync created first (sync makes tables from the models but not the named FKs).
 *
 * `q(sql, params)` runs one statement and returns rows for SELECT/SHOW (see src/posMigrations/index.js).
 */
const NAME = '20261124_recipe_bom_step1';
const LEGACY_IMPACTS = 'recipe_stock_impacts_legacy_20261124';

const TX_TYPES_OLD = ['purchase', 'sale', 'adjustment', 'recipe_deduction', 'return', 'transfer'];
const TX_TYPES = [...TX_TYPES_OLD, 'recipe_reversal', 'opening', 'count'];
const REF_TYPES_OLD = ['ticket', 'purchase_order', 'adjustment', 'manual', 'transfer'];
const REF_TYPES = [...REF_TYPES_OLD, 'sale', 'receiving', 'conversion'];

const enumSql = values => `ENUM(${values.map(v => `'${v}'`).join(',')})`;

// ---------------------------------------------------------------- schema helpers
const tableExists = async (q, table) =>
  (await q('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table])).length > 0;

const column = async (q, table, col) =>
  (await q(
    `SELECT COLUMN_TYPE AS columnType, NUMERIC_PRECISION AS numPrecision
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col]
  ))[0] || null;

const indexExists = async (q, table, name) =>
  (await q('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [table, name])).length > 0;

// Any FK on the column (sync may have added an unnamed one); avoids a duplicate constraint.
const hasForeignKey = async (q, table, col) =>
  (await q(
    `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, col]
  )).length > 0;

const count = async (q, sql, params = []) => Number((await q(sql, params))[0].n);

const addColumn = async (q, table, col, definition) => {
  if (await column(q, table, col)) return;
  await q(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${definition}`);
};

const addIndex = async (q, table, name, definition) => {
  if (await indexExists(q, table, name)) return;
  await q(`ALTER TABLE \`${table}\` ADD ${definition}`);
};

const addForeignKey = async (q, table, name, col, refTable, onDelete) => {
  if (await hasForeignKey(q, table, col)) return;
  await q(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${col}\`) ` +
    `REFERENCES \`${refTable}\` (\`id\`) ON DELETE ${onDelete} ON UPDATE CASCADE`
  );
};

const enumHas = (columnType, values) => values.every(v => columnType.includes(`'${v}'`));

// ---------------------------------------------------------------- DDL
const STOCK_BALANCES = `CREATE TABLE IF NOT EXISTS \`stock_balances\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`product_id\` INT(11) NOT NULL,
  \`location_id\` INT(11) NOT NULL,
  \`quantity\` DECIMAL(18,4) NOT NULL DEFAULT 0.0000 COMMENT 'On hand, in the product stock unit (stockUnitId, else baseUnitId); may be negative when the product allows it',
  \`avg_cost\` DECIMAL(18,6) NOT NULL DEFAULT 0.000000 COMMENT 'Weighted average cost in LCY per stock unit',
  \`last_transaction_id\` INT(11) NULL COMMENT 'stock_transactions.id of the last movement',
  \`createdAt\` DATETIME NOT NULL,
  \`updateTimestamp\` DATETIME NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_stock_balance_product_location\` (\`product_id\`, \`location_id\`),
  KEY \`idx_stock_balance_location\` (\`location_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const STOCK_TRANSACTIONS = `CREATE TABLE IF NOT EXISTS \`stock_transactions\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`transaction_type\` ${enumSql(TX_TYPES)} NOT NULL,
  \`transaction_quantity\` DECIMAL(18,4) NOT NULL,
  \`transaction_rate\` DECIMAL(18,6) NOT NULL DEFAULT 1.000000 COMMENT 'Conversion rate from transaction unit to base unit',
  \`base_quantity_change\` DECIMAL(18,4) NOT NULL COMMENT 'Change in base units (positive for increase, negative for decrease)',
  \`base_quantity_before\` DECIMAL(18,4) NOT NULL,
  \`base_quantity_after\` DECIMAL(18,4) NOT NULL,
  \`unit_cost\` DECIMAL(18,6) DEFAULT NULL COMMENT 'Cost per transaction unit',
  \`total_cost\` DECIMAL(18,2) DEFAULT NULL COMMENT 'Total transaction cost',
  \`reference_type\` ${enumSql(REF_TYPES)} DEFAULT NULL,
  \`reference_id\` INT(11) DEFAULT NULL,
  \`notes\` TEXT DEFAULT NULL,
  \`createdAt\` DATETIME NOT NULL,
  \`transactionUnitId\` INT(11) DEFAULT NULL,
  \`baseUnitId\` INT(11) DEFAULT NULL,
  \`productId\` INT(11) DEFAULT NULL,
  \`location_id\` INT(11) DEFAULT NULL,
  \`created_by\` INT(11) DEFAULT NULL COMMENT 'user id',
  \`reversal_of_id\` INT(11) DEFAULT NULL COMMENT 'stock_transactions.id this row reverses (void/refund)',
  PRIMARY KEY (\`id\`),
  KEY \`stock_transactions_reference_type_reference_id\` (\`reference_type\`, \`reference_id\`),
  KEY \`stock_transactions_transaction_type\` (\`transaction_type\`),
  KEY \`idx_stock_tx_product_location\` (\`productId\`, \`location_id\`, \`createdAt\`),
  KEY \`idx_stock_tx_reversal_of\` (\`reversal_of_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const RECIPE_STOCK_IMPACTS = `CREATE TABLE IF NOT EXISTS \`recipe_stock_impacts\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`stock_transaction_id\` INT(11) NOT NULL COMMENT 'the recipe_deduction ledger row',
  \`source_type\` ENUM('ticket','sale') NOT NULL COMMENT 'ticket = restaurant ticketLine, sale = merchant saleLine',
  \`source_line_id\` INT(11) NOT NULL COMMENT 'ticketLine.id or saleLine.id',
  \`product_sold_id\` INT(11) NOT NULL,
  \`ingredient_id\` INT(11) NOT NULL,
  \`recipe_id\` INT(11) NULL COMMENT 'recipe row used; NULL once that row is deleted',
  \`location_id\` INT(11) NULL,
  \`quantity_sold\` DECIMAL(18,4) NOT NULL,
  \`recipe_quantity_per_unit\` DECIMAL(18,6) NOT NULL COMMENT 'as written in the recipe, in recipe_unit_id',
  \`recipe_unit_id\` INT(11) NULL,
  \`ingredient_quantity\` DECIMAL(18,4) NOT NULL COMMENT 'deducted, in the ingredient stock unit',
  \`ingredient_unit_id\` INT(11) NULL,
  \`unit_cost\` DECIMAL(18,6) NOT NULL DEFAULT 0.000000 COMMENT 'LCY per ingredient stock unit',
  \`total_cost\` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  \`reversed_at\` DATETIME NULL,
  \`reversal_transaction_id\` INT(11) NULL,
  \`createdAt\` DATETIME NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_rsi_source\` (\`source_type\`, \`source_line_id\`),
  KEY \`idx_rsi_ingredient\` (\`ingredient_id\`, \`createdAt\`),
  KEY \`idx_rsi_product_sold\` (\`product_sold_id\`, \`createdAt\`),
  KEY \`idx_rsi_stock_tx\` (\`stock_transaction_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

// ---------------------------------------------------------------- steps
const ensureMarkerTable = q => q(`CREATE TABLE IF NOT EXISTS \`pos_schema_migrations\` (
  \`name\` VARCHAR(100) NOT NULL,
  \`appliedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

const upProduct = async q => {
  await addColumn(q, 'product', 'stockMode',
    "ENUM('card','quantity') NOT NULL DEFAULT 'card' COMMENT 'card = one card row per unit; quantity = decimal balance in stock_balances (raw materials)'");
};

const upStockBalances = async q => {
  await q(STOCK_BALANCES);
  // When sync created the table first, complete it
  await addIndex(q, 'stock_balances', 'uk_stock_balance_product_location',
    'UNIQUE KEY `uk_stock_balance_product_location` (`product_id`, `location_id`)');
  await addIndex(q, 'stock_balances', 'idx_stock_balance_location', 'KEY `idx_stock_balance_location` (`location_id`)');
  await addForeignKey(q, 'stock_balances', 'fk_stock_balance_product', 'product_id', 'product', 'CASCADE');
  await addForeignKey(q, 'stock_balances', 'fk_stock_balance_location', 'location_id', 'location', 'RESTRICT');
};

const upStockTransactions = async q => {
  await q(STOCK_TRANSACTIONS);

  await addColumn(q, 'stock_transactions', 'location_id', 'INT(11) DEFAULT NULL');
  await addColumn(q, 'stock_transactions', 'created_by', "INT(11) DEFAULT NULL COMMENT 'user id'");
  await addColumn(q, 'stock_transactions', 'reversal_of_id',
    "INT(11) DEFAULT NULL COMMENT 'stock_transactions.id this row reverses (void/refund)'");

  const txType = await column(q, 'stock_transactions', 'transaction_type');
  if (!enumHas(txType.columnType, TX_TYPES)) {
    await q(`ALTER TABLE \`stock_transactions\` MODIFY \`transaction_type\` ${enumSql(TX_TYPES)} NOT NULL`);
  }
  const refType = await column(q, 'stock_transactions', 'reference_type');
  if (!enumHas(refType.columnType, REF_TYPES)) {
    await q(`ALTER TABLE \`stock_transactions\` MODIFY \`reference_type\` ${enumSql(REF_TYPES)} DEFAULT NULL`);
  }

  // Widen: DECIMAL(10,4) tops out at 999,999.9999 (1 tonne in grams)
  const widen = [
    ['transaction_quantity', 'DECIMAL(18,4) NOT NULL'],
    ['transaction_rate', "DECIMAL(18,6) NOT NULL DEFAULT 1.000000 COMMENT 'Conversion rate from transaction unit to base unit'"],
    ['base_quantity_change', "DECIMAL(18,4) NOT NULL COMMENT 'Change in base units (positive for increase, negative for decrease)'"],
    ['base_quantity_before', 'DECIMAL(18,4) NOT NULL'],
    ['base_quantity_after', 'DECIMAL(18,4) NOT NULL'],
    ['unit_cost', "DECIMAL(18,6) DEFAULT NULL COMMENT 'Cost per transaction unit'"],
    ['total_cost', "DECIMAL(18,2) DEFAULT NULL COMMENT 'Total transaction cost'"]
  ];
  for (const [col, def] of widen) {
    const info = await column(q, 'stock_transactions', col);
    if (info && Number(info.numPrecision) < 18) {
      await q(`ALTER TABLE \`stock_transactions\` MODIFY \`${col}\` ${def}`);
    }
  }

  await addIndex(q, 'stock_transactions', 'idx_stock_tx_product_location',
    'KEY `idx_stock_tx_product_location` (`productId`, `location_id`, `createdAt`)');
  await addIndex(q, 'stock_transactions', 'idx_stock_tx_reversal_of', 'KEY `idx_stock_tx_reversal_of` (`reversal_of_id`)');
  await addForeignKey(q, 'stock_transactions', 'fk_stock_tx_location', 'location_id', 'location', 'SET NULL');
  await addForeignKey(q, 'stock_transactions', 'fk_stock_tx_reversal_of', 'reversal_of_id', 'stock_transactions', 'SET NULL');
};

const upRecipeStockImpacts = async q => {
  // A table from the old, never-registered model has a different shape: keep its rows aside, never drop data.
  if ((await tableExists(q, 'recipe_stock_impacts')) && !(await column(q, 'recipe_stock_impacts', 'source_type'))) {
    const rows = await count(q, 'SELECT COUNT(*) AS n FROM `recipe_stock_impacts`');
    if (rows === 0) await q('DROP TABLE `recipe_stock_impacts`');
    else await q(`RENAME TABLE \`recipe_stock_impacts\` TO \`${LEGACY_IMPACTS}\``);
  }
  await q(RECIPE_STOCK_IMPACTS);

  const indexes = [
    ['idx_rsi_source', 'KEY `idx_rsi_source` (`source_type`, `source_line_id`)'],
    ['idx_rsi_ingredient', 'KEY `idx_rsi_ingredient` (`ingredient_id`, `createdAt`)'],
    ['idx_rsi_product_sold', 'KEY `idx_rsi_product_sold` (`product_sold_id`, `createdAt`)'],
    ['idx_rsi_stock_tx', 'KEY `idx_rsi_stock_tx` (`stock_transaction_id`)']
  ];
  for (const [name, def] of indexes) await addIndex(q, 'recipe_stock_impacts', name, def);

  // RESTRICT on products: deleting a product must not erase what was consumed
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_stock_tx', 'stock_transaction_id', 'stock_transactions', 'RESTRICT');
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_product_sold', 'product_sold_id', 'product', 'RESTRICT');
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_ingredient', 'ingredient_id', 'product', 'RESTRICT');
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_recipe', 'recipe_id', 'recipe', 'SET NULL');
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_recipe_unit', 'recipe_unit_id', 'unitModel', 'SET NULL');
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_ingredient_unit', 'ingredient_unit_id', 'unitModel', 'SET NULL');
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_location', 'location_id', 'location', 'SET NULL');
  await addForeignKey(q, 'recipe_stock_impacts', 'fk_rsi_reversal_tx', 'reversal_transaction_id', 'stock_transactions', 'SET NULL');
};

const missingObjects = async q => {
  const missing = [];
  if (!(await column(q, 'product', 'stockMode'))) missing.push('product.stockMode');
  for (const [table, col] of [
    ['stock_balances', 'product_id'], ['stock_balances', 'location_id'],
    ['stock_transactions', 'location_id'],
    ['recipe_stock_impacts', 'stock_transaction_id'], ['recipe_stock_impacts', 'ingredient_id']
  ]) {
    if (!(await tableExists(q, table)) || !(await hasForeignKey(q, table, col))) missing.push(`FK ${table}.${col}`);
  }
  const txType = await column(q, 'stock_transactions', 'transaction_type');
  if (!txType || !enumHas(txType.columnType, TX_TYPES)) missing.push('stock_transactions.transaction_type values');
  return missing;
};

// ---------------------------------------------------------------- down helpers
const dropForeignKeysOn = async (q, table, col) => {
  const fks = await q(
    `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, col]
  );
  for (const fk of fks) await q(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.name}\``);
};

const dropIndex = async (q, table, name) => {
  if (await indexExists(q, table, name)) await q(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
};

const dropColumn = async (q, table, col) => {
  if (!(await column(q, table, col))) return;
  await dropForeignKeysOn(q, table, col);
  await q(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
};

const assertCanRollBack = async q => {
  const problems = [];
  if (await tableExists(q, 'stock_balances')) {
    const n = await count(q, 'SELECT COUNT(*) AS n FROM `stock_balances`');
    if (n > 0) problems.push(`stock_balances has ${n} row(s)`);
  }
  if (await tableExists(q, 'recipe_stock_impacts')) {
    const n = await count(q, 'SELECT COUNT(*) AS n FROM `recipe_stock_impacts`');
    if (n > 0) problems.push(`recipe_stock_impacts has ${n} row(s)`);
  }
  if (await column(q, 'product', 'stockMode')) {
    const n = await count(q, "SELECT COUNT(*) AS n FROM `product` WHERE `stockMode` = 'quantity'");
    if (n > 0) problems.push(`${n} product(s) use stockMode = 'quantity'`);
  }
  if (await column(q, 'stock_transactions', 'location_id')) {
    const newTx = TX_TYPES.filter(t => !TX_TYPES_OLD.includes(t));
    const newRef = REF_TYPES.filter(t => !REF_TYPES_OLD.includes(t));
    const n = await count(q,
      `SELECT COUNT(*) AS n FROM \`stock_transactions\`
        WHERE location_id IS NOT NULL OR created_by IS NOT NULL OR reversal_of_id IS NOT NULL
           OR transaction_type IN (${newTx.map(() => '?').join(',')})
           OR reference_type IN (${newRef.map(() => '?').join(',')})`,
      [...newTx, ...newRef]);
    if (n > 0) problems.push(`stock_transactions has ${n} row(s) written by the recipe engine`);
  }
  if (problems.length) throw new Error(`Refusing to roll back ${NAME}: ${problems.join('; ')}.`);
};

module.exports = {
  name: NAME,
  description: 'Recipe/BOM step 1: product.stockMode, stock_balances, stock_transactions extensions, recipe_stock_impacts',

  // Marker row AND the objects sync cannot create (named FKs, enum values), so a schema left half-done
  // (failed run, partial rollback, tables made by sync) is completed by the next up.
  async isApplied(q) {
    if (!(await tableExists(q, 'pos_schema_migrations'))) return false;
    if ((await q('SELECT 1 FROM `pos_schema_migrations` WHERE `name` = ?', [NAME])).length === 0) return false;
    return (await missingObjects(q)).length === 0;
  },

  async up(q) {
    for (const t of ['product', 'location', 'unitModel', 'recipe']) {
      if (!(await tableExists(q, t))) throw new Error(`${NAME}: base table ${t} is missing; run after sequelize.sync`);
    }
    await ensureMarkerTable(q);
    await upProduct(q);
    await upStockBalances(q);
    await upStockTransactions(q);
    await upRecipeStockImpacts(q);
    await q('INSERT IGNORE INTO `pos_schema_migrations` (`name`) VALUES (?)', [NAME]);
  },

  assertCanRollBack,

  // Undoes the schema only while none of it holds data. stock_transactions keeps its wider DECIMALs
  // (narrowing could truncate values; the wider type is harmless to the old code).
  async down(q) {
    await assertCanRollBack(q);
    // Marker first: if a later step fails, status shows "not applied" and up repairs the schema
    if (await tableExists(q, 'pos_schema_migrations')) {
      await q('DELETE FROM `pos_schema_migrations` WHERE `name` = ?', [NAME]);
    }

    if (await tableExists(q, 'recipe_stock_impacts')) await q('DROP TABLE `recipe_stock_impacts`');
    if (await tableExists(q, 'stock_balances')) await q('DROP TABLE `stock_balances`');

    if (await tableExists(q, 'stock_transactions')) {
      // dropColumn removes the column's FK first; its single-column index goes with the column
      await dropColumn(q, 'stock_transactions', 'reversal_of_id');
      await dropColumn(q, 'stock_transactions', 'created_by');
      // MariaDB needs a replacement index on productId for its FK before dropping the composite one
      if (!(await indexExists(q, 'stock_transactions', 'productId'))) {
        await q('ALTER TABLE `stock_transactions` ADD KEY `productId` (`productId`)');
      }
      await dropIndex(q, 'stock_transactions', 'idx_stock_tx_product_location');
      await dropColumn(q, 'stock_transactions', 'location_id');
      await q(`ALTER TABLE \`stock_transactions\` MODIFY \`transaction_type\` ${enumSql(TX_TYPES_OLD)} NOT NULL`);
      await q(`ALTER TABLE \`stock_transactions\` MODIFY \`reference_type\` ${enumSql(REF_TYPES_OLD)} DEFAULT NULL`);
    }

    await dropColumn(q, 'product', 'stockMode');
  }
};
