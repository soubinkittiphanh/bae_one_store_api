

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
        const dfUserId = env.db.database.split('_')[3]
        const defaultUser = {
            "cus_id": dfUserId,
            "cus_pass": dfUserId,
            "cus_name": "DC Auto user",
            "isActive": true
        }

        userService.ensureDefaultUserExists(defaultUser)

    }).setTimeout(0)



}
startApp();