const orderRouter = require("./orderRouter")
const dymCustomerRouter =require("./dymCustomerRouter")
const reportRouter =  require("./reportRouter")
const generalLedger = require("./generalLedger")
const chartAccount = require("../account").router
const upgrade = require("./upgrade")
const rider = require("../rider").router
const location = require("../location").router
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
const menuHeader = require("../menu").router
const menuLine = require("../menu/line").router
const product = require("../product").router
const saleLine = require("../sales/line").router
const quotation = require("../quotation").router
const quotationLine = require("../quotation/line").router
const transfer = require("../transfer").router
const terminal = require("../terminal").router
const user = require("../user").router
const shipping = require("../shipping").router
const company = require("../company").router
const tutorial = require("../tutorial").router
const group = require("../group").router
const authority = require("../authority").router
const account = require("../account").router
const priceList = require("../priceList").router
const order = require("../order").router
const vendor = require("../vendor").router

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
    product,
    quotation,
    quotationLine,
    location,
    transfer,
    terminal,
    user,
    shipping,
    company,
    tutorial,
    group,
    authority,
    account,
    priceList,
    order,
    vendor,
    menuHeader,
    menuLine
}