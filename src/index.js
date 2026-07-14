

const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

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
        const { product, unit, company } = require('./models');
        const redeemProduct = await product.findByPk(999);
        if (!redeemProduct) {
            logger.info("Seeding REDEEM product (ID 999)");
            
            // Find first available unit and company IDs
            const firstUnit = await unit.findOne();
            const firstCompany = await company.findOne();
            const unitId = firstUnit ? firstUnit.id : 1;
            const companyId = firstCompany ? firstCompany.id : 1;

            await product.create({
                id: 999,
                pro_id: 999,
                pro_name: 'REDEEM',
                pro_price: 0,
                validateStockOnSale: false,
                isActive: true,
                _category: 'service',
                receiveUnitId: unitId,
                stockUnitId: unitId,
                baseUnitId: unitId,
                companyId: companyId
            });
            logger.info(`REDEEM product seeded successfully with unitId: ${unitId}, companyId: ${companyId}`);
        } else {
            // Ensure existing REDEEM product has unitId and companyId populated if they are null
            const firstUnit = await unit.findOne();
            const firstCompany = await company.findOne();
            const unitId = firstUnit ? firstUnit.id : 1;
            const companyId = firstCompany ? firstCompany.id : 1;

            let updated = false;
            if (!redeemProduct.receiveUnitId || !redeemProduct.stockUnitId || !redeemProduct.baseUnitId) {
                redeemProduct.receiveUnitId = redeemProduct.receiveUnitId || unitId;
                redeemProduct.stockUnitId = redeemProduct.stockUnitId || unitId;
                redeemProduct.baseUnitId = redeemProduct.baseUnitId || unitId;
                updated = true;
            }
            if (!redeemProduct.companyId) {
                redeemProduct.companyId = companyId;
                updated = true;
            }
            if (updated) {
                await redeemProduct.save();
                logger.info(`Existing REDEEM product updated with unitId: ${unitId}, companyId: ${companyId}`);
            } else {
                logger.info("REDEEM product already exists and is fully configured");
            }
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

