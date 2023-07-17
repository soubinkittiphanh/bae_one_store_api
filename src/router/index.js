const orderRouter = require("./orderRouter")
const dymCustomerRouter =require("./dymCustomerRouter")
const reportRouter =  require("./reportRouter")
const generalLedger = require("./generalLedger")
const chartAccount = require("./chartOfAccount")
const upgrade = require("./upgrade")
const rider = require("../rider").router
const campaign = require("../controllers/admin/campaign").router
const campaignEntry = require("../controllers/admin/campaign/entry").router
const card = require("../card").router
const paymentHeadAP = require("../AP/payment/header").router
const receiveHeadAR = require("../AR/receive/header").router
const poheader = require("../PO").router
const poLine = require("../PO/line").router
const currency = require("../currency").router
const geography = require("../geography").router
const customer = require("../dynamicCustomer").router
const category = require("../category").router
const client = require("../client").router
const unit = require("../unit").router
const paymentMethod = require("../paymentMethod").router
const sale = require("../sales").router
const product = require("../product").router
const saleLine = require("../sales/line").router

module.exports={
    orderRouter,
    dymCustomerRouter,
    reportRouter,
    generalLedger,
    chartAccount,
    upgrade,
    rider,
    campaign,
    campaignEntry,
    card,
    paymentHeadAP,
    receiveHeadAR,
    currency,
    poheader,
    poLine,
    geography,
    customer,
    category,
    client,
    unit,
    paymentMethod,
    sale,
    saleLine,
    product
}