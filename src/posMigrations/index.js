/**
 * POS schema migrations: changes that every client database needs, applied in order.
 *
 * Each migration exports { name, isApplied(q), up(q), down(q), assertCanRollBack?(q) } and must be idempotent.
 * `q(sql, params)` runs one statement with `?` placeholders and returns the rows of a SELECT/SHOW.
 *
 *  - Server startup: src/models/index.js calls runPosMigrations(sequelize) after sequelize.sync,
 *    so each client DB is migrated on its next restart. A failure is logged and does not stop the server.
 *  - By hand: node pos_migrate.js status | up | down --yes
 */
const { QueryTypes } = require('sequelize');

const MIGRATIONS = [
  require('./20261124_recipe_bom_step1'),
  require('./20261125_recipe_engine_step3'),
  require('./20261128_mobile_menu_grants'),
  require('./20261129_pos_grants_enforced'),
  require('./20261130_retire_user_roles')
];

const isReadQuery = sql => /^\s*(SELECT|SHOW)\b/i.test(sql);

// q() on top of a Sequelize instance
const sequelizeRunner = sequelize => async (sql, params = []) => {
  const options = { type: isReadQuery(sql) ? QueryTypes.SELECT : QueryTypes.RAW };
  if (params.length) options.replacements = params;
  const result = await sequelize.query(sql, options);
  return isReadQuery(sql) ? result : result[0];
};

// q() on top of a mariadb connection (CLI)
const connectionRunner = conn => async (sql, params = []) => {
  const rows = await conn.query(sql, params);
  return Array.isArray(rows) ? Array.from(rows) : rows;
};

const pending = async q => {
  const list = [];
  for (const m of MIGRATIONS) if (!(await m.isApplied(q))) list.push(m);
  return list;
};

const runPosMigrations = async (sequelize, logger = console) => {
  const q = sequelizeRunner(sequelize);
  for (const m of MIGRATIONS) {
    try {
      if (await m.isApplied(q)) continue;
      logger.info(`POS migration ${m.name}: applying`);
      await m.up(q);
      logger.info(`POS migration ${m.name}: applied`);
    } catch (err) {
      // Later migrations may depend on this one: stop here and retry on the next start
      logger.error(`POS migration ${m.name} failed: ${err.message}`);
      return false;
    }
  }
  logger.info('POS migrations: up to date');
  return true;
};

module.exports = { MIGRATIONS, runPosMigrations, sequelizeRunner, connectionRunner, pending };
