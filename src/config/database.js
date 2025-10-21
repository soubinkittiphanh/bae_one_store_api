const { Sequelize } = require('sequelize');
const logger = require('../api/logger');
const env = require('../config/env').db;

// Main database connection
const sequelize = new Sequelize(
    env.database,
    env.user,
    env.password,
    {
        host: env.host,
        dialect: 'mariadb',
        port: env.port,
        pool: {
            max: 5,
            min: 2,
            acquire: 30000,
            idle: 10000
        },
        timezone: '+07:00',
        dialectOptions: {
            useUTC: false, // ✅ Do not convert date to UTC
        },
        define: {
            indexes: false,
        }
    }
);

// Tutorial database connection
const tutorialDB = new Sequelize('tutorial_db', env.user, env.password, {
    host: env.host,
    dialect: 'mariadb',
    port: env.port,
    pool: {
        max: 5,
        min: 2,
        acquire: 30000,
        idle: 10000
    }
});

// Authentication functions
const authenticateConnections = async () => {
    try {
        await tutorialDB.authenticate();
        logger.info("tutorial_db Connection established");

        await sequelize.authenticate();
        logger.info("client_db Connection established");
    } catch (err) {
        logger.error("Database connection error:", err);
        throw err;
    }
};

module.exports = {
    sequelize,
    tutorialDB,
    authenticateConnections
};