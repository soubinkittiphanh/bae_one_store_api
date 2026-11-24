/**
 * Recipe / BOM, Step 3: what the sale engine needs on top of step 1.
 *
 *  - recipe_stock_impacts: what happened to each deduction when its line was cancelled / voided / deleted
 *      disposition 'consumed' (sold, default) | 'returned' (put back on stock) | 'wasted' (made, then not sold)
 *      + who decided, when and why. The kitchen rule: an 'ordered' line returns, 'preparing' / 'ready' /
 *      'served' is waste, unless a manager returns it (src/rawMaterial/recipeEngine.js).
 *  - productOption.ingredientQuantity / ingredientUnitId: how much of a raw-material ingredient an option
 *      uses ("Extra shot" = 9 g). Without them a raw-material option ingredient is not deducted
 *      (card-based option ingredients keep taking one card per item as before).
 *
 * Same conventions as 20261124_recipe_bom_step1.js: idempotent, runs at startup after sequelize.sync and via
 * `node pos_migrate.js`, isApplied checks the marker row and the objects sync cannot make.
 */
const NAME = '20261125_recipe_engine_step3';
const DISPOSITIONS = ['consumed', 'returned', 'wasted'];

const tableExists = async (q, table) =>
  (await q('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table])).length > 0;

const columnExists = async (q, table, col) =>
  (await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, col])).length > 0;

const indexExists = async (q, table, name) =>
  (await q('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [table, name])).length > 0;

const hasForeignKey = async (q, table, col) =>
  (await q(
    `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, col]
  )).length > 0;

const count = async (q, sql, params = []) => Number((await q(sql, params))[0].n);

const addColumn = async (q, table, col, definition) => {
  if (!(await columnExists(q, table, col))) await q(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${definition}`);
};

const dropColumn = async (q, table, col) => {
  if (!(await columnExists(q, table, col))) return;
  const fks = await q(
    `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, col]
  );
  for (const fk of fks) await q(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.name}\``);
  await q(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
};

const missingObjects = async q => {
  const missing = [];
  for (const col of ['disposition', 'disposition_at', 'disposition_by', 'disposition_note']) {
    if (!(await columnExists(q, 'recipe_stock_impacts', col))) missing.push(`recipe_stock_impacts.${col}`);
  }
  if (!(await indexExists(q, 'recipe_stock_impacts', 'idx_rsi_disposition'))) missing.push('idx_rsi_disposition');
  for (const col of ['ingredientQuantity', 'ingredientUnitId']) {
    if (!(await columnExists(q, 'productOption', col))) missing.push(`productOption.${col}`);
  }
  if ((await columnExists(q, 'productOption', 'ingredientUnitId')) && !(await hasForeignKey(q, 'productOption', 'ingredientUnitId'))) {
    missing.push('FK productOption.ingredientUnitId');
  }
  return missing;
};

module.exports = {
  name: NAME,
  description: 'Recipe/BOM step 3: deduction disposition (consumed/returned/wasted), option ingredient quantity',

  async isApplied(q) {
    if (!(await tableExists(q, 'pos_schema_migrations'))) return false;
    if ((await q('SELECT 1 FROM `pos_schema_migrations` WHERE `name` = ?', [NAME])).length === 0) return false;
    return (await missingObjects(q)).length === 0;
  },

  async up(q) {
    for (const t of ['recipe_stock_impacts', 'productOption', 'unitModel', 'pos_schema_migrations']) {
      if (!(await tableExists(q, t))) throw new Error(`${NAME}: table ${t} is missing; apply 20261124_recipe_bom_step1 first`);
    }

    await addColumn(q, 'recipe_stock_impacts', 'disposition',
      `ENUM(${DISPOSITIONS.map(d => `'${d}'`).join(',')}) NOT NULL DEFAULT 'consumed' COMMENT 'consumed = sold; returned = put back on stock; wasted = made but not sold'`);
    await addColumn(q, 'recipe_stock_impacts', 'disposition_at', 'DATETIME NULL');
    await addColumn(q, 'recipe_stock_impacts', 'disposition_by', "INT(11) NULL COMMENT 'user id'");
    await addColumn(q, 'recipe_stock_impacts', 'disposition_note', 'VARCHAR(255) NULL');
    if (!(await indexExists(q, 'recipe_stock_impacts', 'idx_rsi_disposition'))) {
      await q('ALTER TABLE `recipe_stock_impacts` ADD KEY `idx_rsi_disposition` (`disposition`, `ingredient_id`, `disposition_at`)');
    }

    await addColumn(q, 'productOption', 'ingredientQuantity',
      "DECIMAL(18,6) NULL COMMENT 'amount of ingredientProductId per item, in ingredientUnitId (raw materials)'");
    await addColumn(q, 'productOption', 'ingredientUnitId', 'INT(11) NULL');
    if (!(await hasForeignKey(q, 'productOption', 'ingredientUnitId'))) {
      await q('ALTER TABLE `productOption` ADD CONSTRAINT `fk_product_option_ingredient_unit` FOREIGN KEY (`ingredientUnitId`) ' +
        'REFERENCES `unitModel` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');
    }

    await q('INSERT IGNORE INTO `pos_schema_migrations` (`name`) VALUES (?)', [NAME]);
  },

  async assertCanRollBack(q) {
    const problems = [];
    if (await columnExists(q, 'recipe_stock_impacts', 'disposition')) {
      const n = await count(q, "SELECT COUNT(*) AS n FROM `recipe_stock_impacts` WHERE `disposition` <> 'consumed'");
      if (n > 0) problems.push(`${n} deduction(s) are already returned or wasted`);
    }
    if (await columnExists(q, 'productOption', 'ingredientQuantity')) {
      const n = await count(q, 'SELECT COUNT(*) AS n FROM `productOption` WHERE `ingredientQuantity` IS NOT NULL');
      if (n > 0) problems.push(`${n} option(s) have an ingredient quantity`);
    }
    if (problems.length) throw new Error(`Refusing to roll back ${NAME}: ${problems.join('; ')}.`);
  },

  async down(q) {
    await module.exports.assertCanRollBack(q);
    if (await tableExists(q, 'pos_schema_migrations')) {
      await q('DELETE FROM `pos_schema_migrations` WHERE `name` = ?', [NAME]);
    }
    if (await indexExists(q, 'recipe_stock_impacts', 'idx_rsi_disposition')) {
      await q('ALTER TABLE `recipe_stock_impacts` DROP INDEX `idx_rsi_disposition`');
    }
    for (const col of ['disposition_note', 'disposition_by', 'disposition_at', 'disposition']) {
      await dropColumn(q, 'recipe_stock_impacts', col);
    }
    await dropColumn(q, 'productOption', 'ingredientUnitId');
    await dropColumn(q, 'productOption', 'ingredientQuantity');
  }
};
