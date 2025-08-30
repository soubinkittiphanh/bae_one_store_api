const orderRouter = require("./orderRouter")
const dymCustomerRouter =require("./dymCustomerRouter")
const reportRouter =  require("./reportRouter")
const generalLedger = require("../GL").router
const chartAccount = require("../account").router
const upgrade = require("./upgrade")
const rider = require("../rider").router
const location = require("../location").router
const campaign = require("../controllers/admin/campaign").router
const campaignEntry = require("../controllers/admin/campaign/entry").router
const card = require("../card").router
const paymentHeadAP = require("../AP/payment/header").router
const receiveHeadAR = require("../AR/receive/header").router
const poheader = require("../purchasing").router
const poLine = require("../purchasing/line").router
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
const reservation = require("../reservation").router
const receiving = require("../receiving").router
const receivingLine = require("../receiving/line").router
const spf = require("../spf").router
const webProductGroup = require("../web_product_group").router
const service = require("../service").router
const washJob = require("../washJob").router
const table = require("../pos/table").router
const ticket = require("../pos/ticket").router
const ticketLine = require("../pos/ticketLine").router
const tax = require("../tax/router")
const moneyAdvance = require("../PWT/moneyAdvance/router")
const moneySettlement = require("../PWT/moneySettlement/router")
const bankAccount = require("../bankAccount/router")
const ministry = require("../ministry/router")
const revenueTarget = require("../revenueTarget/router")
const apInvoice = require("../AP/invoice/router")
const apInvoiceLine = require("../AP/invoiceLine/router")
const apInvoiceSettlement = require("../AP/invoiceSettlement/router")
const apInvoiceSettlementLine = require("../AP/invoiceSettlementLine/router")
const applicant = require("../job-fair/applicant/router")
const MOU = require("../job-fair/MOU/router")
const agency = require("../job-fair/agency/router")
const jobAdvertise = require("../job-fair/jobDescription/router")
const benefit = require("../benefit/router")
const arInvoiceHeader = require("../ARV2/invoice/header/router")
const arInvoiceLine = require("../ARV2/invoice/line/router")
const arReceiveHeader = require("../ARV2/receive/header/router")
const arReceiveLine = require("../ARV2/receive/line/router")
const batchJob = require("../job-fair/job-batch/router")

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
    menuLine,
    reservation,
    receiving,
    receivingLine,
    webProductGroup,
    spf,
    service,
    table,
    ticket,
    ticketLine,
    washJob,
    moneyAdvance,
    moneySettlement,
    tax,
    bankAccount,
    ministry,
    revenueTarget,
    apInvoice,
    apInvoiceLine,
    apInvoiceSettlement,
    apInvoiceSettlementLine,
    applicant,
    jobAdvertise,
    benefit,
    arInvoiceHeader,
    arInvoiceLine,
    arReceiveHeader,
    arReceiveLine,
    batchJob,
    agency,
    MOU,
}