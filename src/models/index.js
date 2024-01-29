const { Sequelize, DataTypes } = require('sequelize')
const logger = require('../api/logger')
const env = require('../config/env').db
const sequelize = new Sequelize(
    env.database,
    env.user,
    env.password,
    {
        host: env.host,
        dialect: 'mariadb',
        port: env.port,
        pool: {
            max: 10,
            min: 10,
            acquire: 30000,
            idle: 10000
        }
    }, {
    define: {
        indexes: false,
    }
}
)

// Connect to the tutorial database
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
// Authenticate tutorial db
tutorialDB.authenticate().then(() => {
    logger.info("tutorial_db Connection established")
}).catch(err => {
    logger.error("tutorial_db Connection error: " + err);
})

// DataTypes.NUMBER
sequelize.authenticate().then(() => {
    logger.info("client_db Connection established")
}).catch(err => {
    logger.error("client_db Connection error: " + err);
})

const db = {}
db.sequelize = sequelize;
db.Sequelize = Sequelize
db.centralSequelize = tutorialDB;
db.product = require("../product/model")(sequelize, DataTypes);
db.orderTable = require("../orderTable/model")(sequelize, DataTypes);
db.menuHeader = require("../menu/model")(sequelize, DataTypes);
db.menuLine = require("../menu/line/model")(sequelize, DataTypes);
db.orderHIS = require("../order_history/model")(sequelize, DataTypes);
db.order = require("../order/model")(sequelize, DataTypes);
db.vendor = require("../vendor/model")(sequelize, DataTypes);
db.priceList = require("../priceList/model")(sequelize, DataTypes);
db.quotationHeader = require("../quotation/model")(sequelize, DataTypes);
db.quotationLine = require("../quotation/line/model")(sequelize, DataTypes);
db.customer = require("../dynamicCustomer/model")(sequelize, DataTypes);
db.group = require("../group/model")(sequelize, DataTypes);
db.authority = require("../authority/model")(sequelize, DataTypes);
db.tuturial = require("../tutorial/model")(tutorialDB, DataTypes);
db.company = require("../company/model")(sequelize, DataTypes);
db.saleHeader = require("../sales/model")(sequelize, DataTypes);
db.shipping = require("../shipping/model")(sequelize, DataTypes);
db.user = require("../user/model")(sequelize, DataTypes);
db.location = require("../location/model")(sequelize, DataTypes);
db.terminal = require("../terminal/model")(sequelize, DataTypes);
db.transferHeader = require("../transfer/model")(sequelize, DataTypes);
db.transferLine = require("../transfer/line/model")(sequelize, DataTypes);
db.card = require("../card/model")(sequelize, DataTypes);
db.chartAccount = require("../account/model")(sequelize, DataTypes);
db.gl = require("../GL/model")(sequelize, DataTypes);
db.apPaymentHeader = require("../AP/payment/header/model")(sequelize, DataTypes);
db.arReceiveHeader = require("../AR/receive/header/model")(sequelize, DataTypes);
db.campaign = require("../controllers/admin/campaign/model")(sequelize, DataTypes);
db.campaignEntry = require("../controllers/admin/campaign/entry/model")(sequelize, DataTypes);
db.rider = require("../rider/model")(sequelize, DataTypes);
db.category = require("../category/model")(sequelize, DataTypes);
db.outlet = require("../outlet/model")(sequelize, DataTypes);
db.poHeader = require("../PO/model")(sequelize, DataTypes);
db.poLine = require("../PO/line/model")(sequelize, DataTypes);
db.currency = require("../currency/model")(sequelize, DataTypes);
db.geography = require("../geography/model")(sequelize, DataTypes);
db.client = require("../client/model")(sequelize, DataTypes);
db.saleLine = require("../sales/line/model")(sequelize, DataTypes);
db.unit = require("../unit/model")(sequelize, DataTypes);
db.payment = require("../paymentMethod/model")(sequelize, DataTypes);
db.country = require("../country/model")(sequelize, DataTypes);
// const UserTerminals = sequelize.define('user_terminals', {});

db.rider.hasMany(db.order, {
    as: 'shippingOrders'
})
db.orderTable.hasMany(db.saleHeader,{
    as: 'saleHeader'
})
db.saleHeader.belongsTo(db.orderTable, {
    foreignKey: 'orderTableId',
    as: 'orderTable'
})
db.menuHeader.belongsToMany(db.menuLine, { through: 'MenuHeaderLines' })
db.menuLine.belongsToMany(db.menuHeader, { through: 'MenuHeaderLines' })
// db.menuHeader.hasMany(db.menuLine, {
//     as: 'line'
// })
// db.menuLine.belongsTo(db.menuHeader, {
//     foreignKey: 'headerId',
//     as: 'header'
// })

// db.location.belongsTo(db.country,{
//     foreignKey:'countryId',
//     as:'country'
// })

db.orderHIS.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})
db.orderHIS.belongsTo(db.location, {
    foreignKey: 'endLocationId',
    as: 'endLocation'
})
db.orderHIS.belongsTo(db.client, {
    foreignKey: 'senderId',
    as: 'sender'
})
db.orderHIS.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.orderHIS.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.orderHIS.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})

db.orderHIS.belongsTo(db.currency, {
    foreignKey: 'shippingFeeCurrencyId',
    as: 'shippingFeeCurrency'
})

db.orderHIS.belongsTo(db.vendor, {
    foreignKey: 'vendorId',
    as: 'vendor'
})
db.orderHIS.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment',
})
db.orderHIS.belongsTo(db.order,{
    foreignKey:'originalId',
    as:'original'
})
db.orderHIS.belongsTo(db.rider, {
    foreignKey: 'riderId',
    as: 'rider'
})
db.orderHIS.belongsTo(db.shipping, {
    foreignKey: 'shippingId',
    as: 'shipping'
})

db.order.hasMany(db.orderHIS,{
    as:'histories'
})
db.order.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})
db.order.belongsTo(db.location, {
    foreignKey: 'endLocationId',
    as: 'endLocation'
})
db.order.belongsTo(db.client, {
    foreignKey: 'senderId',
    as: 'sender'
})
db.order.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.order.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.order.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})

db.order.belongsTo(db.currency, {
    foreignKey: 'shippingFeeCurrencyId',
    as: 'shippingFeeCurrency'
})

db.order.belongsTo(db.vendor, {
    foreignKey: 'vendorId',
    as: 'vendor'
})
db.order.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment',
})
db.order.belongsTo(db.rider, {
    foreignKey: 'riderId',
    as: 'rider'
})
db.order.belongsTo(db.shipping, {
    foreignKey: 'shippingId',
    as: 'shipping'
})

db.user.belongsTo(db.group, {
    foreignKey: 'groupId',
    as: 'userGroup'
})
db.priceList.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.priceList.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.product.hasMany(db.priceList, {
    as: 'priceLists'
})

//***************Map order to delivery customer**************/
db.customer.belongsTo(db.saleHeader, {
    foreignKey: 'saleHeaderId',
    as: 'saleHeader'
})
db.saleHeader.hasOne(db.customer)

db.sequelize.sync({ force: false, alter: true }).then(() => {
    logger.info("Datatase client is synchronize")
})
db.centralSequelize.sync({ force: false, alter: true }).then(() => {
    logger.info("Datatase central is synchronize")
})
db.product.belongsTo(db.currency, {
    foreignKey: 'costCurrencyId',
    as: 'costCurrency'
})
db.product.belongsTo(db.currency, {
    foreignKey: 'saleCurrencyId',
    as: 'saleCurrency'
})
db.card.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.user.belongsToMany(db.terminal, { through: 'UserTerminals' })
db.terminal.belongsToMany(db.user, { through: 'UserTerminals' })
db.authority.belongsToMany(db.group, { through: 'GroupAuthorities' })
db.group.belongsToMany(db.authority, { through: 'GroupAuthorities' })

db.menuHeader.belongsToMany(db.group, { through: 'GroupMenuHeader' })
db.group.belongsToMany(db.menuHeader, { through: 'GroupMenuHeader' })


db.terminal.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})
db.location.belongsTo(db.company, {
    foreignKey: 'companyId',
    as: 'company'
})

db.transferHeader.belongsTo(db.location, {
    foreignKey: 'srcLocationId',
    as: 'srcLocation'
})
db.transferHeader.belongsTo(db.location, {
    foreignKey: 'desLocationId',
    as: 'desLocation'
})
db.transferHeader.hasMany(db.transferLine, {
    as: 'lines'
})
db.transferHeader.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.transferLine.belongsTo(db.transferHeader, {
    foreignKey: 'headerId',
    as: 'header'
})
db.transferLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.transferLine.belongsTo(db.unit, {
    foreignKey: 'unitId',
    as: 'unit'
})
db.transferLine.hasMany(db.card, {
    as: 'cards'
})
db.card.belongsTo(db.transferLine, {
    foreignKey: 'transferLineId',
    as: 'transferLine'

})
// ********** END TRANSFER MAPPING ***********//

db.card.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})

db.product.belongsTo(db.unit, {
    foreignKey: 'stockUnitId',
    as: 'stockUnit'
})
db.product.belongsTo(db.unit, {
    foreignKey: 'receiveUnitId',
    as: 'receiveUnit'
})
//Campaign relation
db.campaign.hasMany(db.campaignEntry, {
    as: 'entries'
})
db.campaignEntry.belongsTo(db.campaign, {
    foreignKey: 'campaign_id',
    as: 'campaign'
})
db.chartAccount.hasMany(db.gl, {
    as: 'gls'
})
db.gl.belongsTo(db.chartAccount, {
    foreignKey: 'account_id',
    as: 'chart_of_account'
})

//********************************** */
// ***** NEW RELATION ************** */
//********************************** */
db.category.hasMany(db.product, {
    as: 'products'
})
db.product.belongsTo(db.category, {
    foreignKey: 'pro_category',
    as: 'category'
})

// db.outlet.hasMany(db.product, {
//     as: 'products'
// })
db.product.belongsTo(db.company, {
    foreignKey: 'companyId',
    as: 'company'
})
db.poHeader.hasMany(db.poLine, {
    as: 'lines'
})
db.poLine.belongsTo(db.poHeader, {
    foreignKey: 'headerId',
    as: 'header'
})

// db.poLine.hasOne(db.product)
db.poLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.poLine.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.rider.hasMany(db.customer, {
    as: 'orders'
})
db.customer.belongsTo(db.rider, {
    foreignKey: 'riderId',
    as: 'rider'
})
db.customer.belongsTo(db.geography, {
    foreignKey: 'geoId',
    as: 'geography'
})
db.customer.belongsTo(db.shipping, {
    foreignKey: 'shippingId',
    as: 'shipping'
})
// Sale mapping //
db.saleHeader.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment'
})
db.saleHeader.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.saleHeader.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.saleHeader.hasMany(db.saleLine, {
    as: 'lines'
})
db.saleHeader.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})
db.saleHeader.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})
// ,{
//     foreignKey:'locationId',
//     as:'location',
// }

db.saleLine.belongsTo(db.saleHeader, {
    foreignKey: 'headerId',
    as: 'header'
})
db.saleLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.saleLine.belongsTo(db.unit, {
    foreignKey: 'unitId',
    as: 'unit'
})
db.saleLine.hasMany(db.card, {
    as: 'cards'
})
db.card.belongsTo(db.saleLine, {
    foreignKey: 'saleLineId',
    as: 'saleLine'

})

// Quotation mapping //
db.quotationHeader.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment'
})
db.quotationHeader.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.quotationHeader.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.quotationHeader.hasMany(db.quotationLine, {
    as: 'lines'
})
db.quotationHeader.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.quotationLine.belongsTo(db.quotationHeader, {
    foreignKey: 'headerId',
    as: 'header'
})
db.quotationLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.quotationLine.belongsTo(db.unit, {
    foreignKey: 'unitId',
    as: 'unit'
})
// Quotation mapping //

db.card.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'

})

db.saleHeader.belongsTo(db.customer, {
    foreignKey: 'customerId',
    as: 'customer'
})

// User.hasMany(Post, { onUpdate: 'CASCADE' });
// User.hasMany(Post, { onDelete: 'CASCADE' });

module.exports = db