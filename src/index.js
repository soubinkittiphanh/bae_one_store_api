

const logger = require("./api/logger.js");
const buildApp = require("./app.js");
const env = require("./config");
const userService = require('../src/user/service.js')
const startApp = async () => {

    const app = await buildApp();

    app.listen(env.port || 4000, () => {
        logger.info("Dcommerce is up")
        logger.info("app is runing: " + env.port || 4000);
        logger.warn("env: " + env.db.database);
    }).setTimeout(0)



}
startApp();
