const { logger } = require("sequelize/lib/utils/logger");


const dbClient = require("./dbClient").clientDB
const config = {
    port: process.env.PORT || 8888,
    nodeEnv: process.env.NODE_ENV || "development",
    host: process.env.HOST || "localhost",
    actksecret: `${process.env.PORT || 8888}Jacke3848b9bd2e3eee522325953aafc118ed017c811cc93fae99a4b2f5ba3506e0e217636b3b509055900cb1da7594b0ce6c7192907213291818a4fdc89bf605ce8`,
    rfTkSecret: `${process.env.PORT || 8888}Jacke3848b9bd2e3eee522325953aafc118ed017c811cc93fae99a4b2f5ba3506e0e217636b3b509055900cb1da7`,
    db: dbClient.bmart, // change to  'auto' for auto api generationasss
}
logger.warn(`ENVIRONMENT DB ${dbClient.env_auto.database}`)
// 28800290 ssss
module.exports = config;