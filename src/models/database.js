const { Sequelize } = require('sequelize');
const logger = require('../api/logger');
const env = require('../config/env').db;

// Main client database
const sequelize = new Sequelize(env.database, env.user, env.password, {
  host: env.host,
  dialect: 'mariadb',
  port: env.port,
  pool: { max: 10, min: 10, acquire: 30000, idle: 10000 },
});

// Tutorial database
const tutorialDB = new Sequelize('tutorial_db', env.user, env.password, {
  host: env.host,
  dialect: 'mariadb',
  port: env.port,
  pool: { max: 5, min: 2, acquire: 30000, idle: 10000 },
});

// Authenticate
sequelize.authenticate()
  .then(() => logger.info('client_db Connection established'))
  .catch(err => logger.error('client_db Connection error:', err));

tutorialDB.authenticate()
  .then(() => logger.info('tutorial_db Connection established'))
  .catch(err => logger.error('tutorial_db Connection error:', err));

module.exports = { sequelize, tutorialDB };
