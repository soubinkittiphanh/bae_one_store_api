

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
const dfUserId = env.db.database.split('_')[3]
const defaultUser = {
    cus_id: dfUserId,                  // User ID (integer, required)
    cus_pass: dfUserId,      // Password (string, required)
    cus_name: "DC Auto",         // Full name (string, required)
    cus_tel: "123456789",         // Telephone number (string, optional)
    cus_email: "jane.doe@example.com", // Email address (string, optional)
    cus_active: true,             // Customer active status (boolean, defaults to true)
    village: "Village Name",      // Village name (string, optional)
    district: "District Name",    // District name (string, optional)
    province: "Province Name",    // Province name (string, optional)
    remark: "New customer",       // Remark (string, optional)
    isActive: true,               // Active status (boolean, defaults to true)
};


userService.ensureDefaultUserExists(defaultUser)