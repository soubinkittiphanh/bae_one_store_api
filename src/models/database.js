const { Sequelize } = require('sequelize');
const logger = require('../api/logger');
const env = require('../config/env').db;

// Main client database
const sequelize = new Sequelize(env.database, env.user, env.password, {
  host: env.host,
  dialect: 'mariadb',
  port: env.port,

  // ⭐ CRITICAL FIX: Tell Sequelize to treat dates as strings,
  // preventing automatic UTC conversion during read/write operations.
  dateStrings: true, 

  // Secondary setting to ensure the connection uses the correct offset
  timezone: '+07:00', 
  
  dialectOptions: {
    useUTC: false,   // Do not convert date to UTC
    dateStrings: true, // Also set here for good measure
  },
  
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
