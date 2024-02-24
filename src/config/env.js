

const dbClient = require("./dbClient").clientDB
const config = {
    port: process.env.PORT || 8888,
    nodeEnv: process.env.NODE_ENV || "development",
    host: process.env.HOST || "localhost",
    actksecret: 'Jacke3848b9bd2e3eee522325953aafc118ed017c811cc93fae99a4b2f5ba3506e0e217636b3b509055900cb1da7594b0ce6c7192907213291818a4fdc89bf605ce8',
    rfTkSecret: 'Jacke3848b9bd2e3eee522325953aafc118ed017c811cc93fae99a4b2f5ba3506e0e217636b3b509055900cb1da7',
    db: dbClient.waenta_saii
}
module.exports = config;