

const logger = require("./api/logger.js");
const executeSqlScript = require("./helper/sqlExecutor.js");

const startApp = async () => {
    try {
        // Run SQL cleanup script first (e.g. toomanykey.sql) before sync/router imports
        await executeSqlScript();
    } catch (err) {
        logger.error("Failed executing initial SQL script:", err);
    }

    const buildApp = require("./app.js");
    const env = require("./config");
    const userService = require('../src/user/service.js');

    const app = await buildApp();

    // Check & seed REDEEM product
    try {
        const { product } = require('./models');
        const redeemProduct = await product.findByPk(999);
        if (!redeemProduct) {
            logger.info("Seeding REDEEM product (ID 999)");
            await product.create({
                id: 999,
                pro_id: 999,
                pro_name: 'REDEEM',
                pro_price: 0,
                validateStockOnSale: false,
                isActive: true,
                _category: 'service'
            });
            logger.info("REDEEM product seeded successfully");
        } else {
            logger.info("REDEEM product already exists");
        }
    } catch (err) {
        logger.error("Failed to seed REDEEM product:", err);
    }

    app.listen(env.port || 4000, () => {
        logger.info("Dcommerce is up")
        logger.info("app is runing: " + env.port || 4000);
        logger.warn("env: " + env.db.database);
    }).setTimeout(0)
}
startApp();

