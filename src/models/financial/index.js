const {Sequelize,DataTypes} = require('sequelize')
const logger = require('../../api/logger')
const env = require('../../config/env').db
const sequelize = new Sequelize(
    env.database,
    env.user,
    env.password,
    {
        host:env.host,
        dialect: 'mariadb',
        port:env.port,
        pool:{
            max:10,
            min:10,
            acquire:30000,
            idle:10000
        }
    }
)
// DataTypes.NUMBER
sequelize.authenticate().then(()=>{
    logger.info("DB Connection established")
}).catch(err=>{
    logger.error("DB Connection error: "+err);
})
const db={}
db.sequelize = sequelize;
db.Sequelize = Sequelize
db.chartAccount =  require("./chartOfAccount")(sequelize,DataTypes);
db.gl = require("./generalLedger")(sequelize,DataTypes);
db.rider = require("../../controllers/admin/rider/model")(sequelize,DataTypes);
db.campaign = require("../../controllers/admin/campaign/model")(sequelize,DataTypes);
db.campaignEntry = require("../../controllers/admin/campaign/entry/model")(sequelize,DataTypes);
db.sequelize.sync({force:false,alter: true}).then(()=>{
    logger.info("Datatase is synchronize")
})

//Campaign relation
db.campaign.hasMany(db.campaignEntry,{
    as: 'entries'
})
db.campaignEntry.belongsTo(db.campaign,{
    foreignKey:'campaign_id',
    as:'campaign'
})

// User.hasMany(Post, { onUpdate: 'CASCADE' });
// User.hasMany(Post, { onDelete: 'CASCADE' });

module.exports = db