require('dotenv').config()
process.env.TZ = 'Asia/Vientiane';
const express = require("express");
const cors = require("cors");
const Router = require('./router/router')
const myRouter = require("./router")
const controller = require("./web_product_group/controller")
const companyController = require("./company/controller")
const qrPayment = require("./QRRequest/controller.js")
const buildApp = async () => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/uploads', express.static('uploads'));// Link uploads folder available via static route
    console.log("DIRNAME " + __dirname);
    app.get("/hello", (req, res) => {
        res.send("Succeed server is ready")
    })
    app.get("/api/public/company/findAll",companyController.getAllActiveCompanies)
    app.post("/api/v1/direct/callback",qrPayment.handleCallback)
    app.use("/api/product-temps", myRouter.productTemp)
    app.use("/webproductgroup/find",controller.findActive)
    app.use("/api",myRouter.dymCustomerRouter)
    app.use("/api",myRouter.orderRouter);
    app.use("/api",myRouter.reportRouter);
    app.use("/api/gl",myRouter.generalLedger)
    app.use("/api/accountChart",myRouter.chartAccount)
    app.use("/api/upgrade",myRouter.upgrade)
    app.use("/api/rider",myRouter.rider)
    app.use("/api/bank",myRouter.bank)
    app.use("/api/bank_account",myRouter.bankAccount)
    app.use("/api/location",myRouter.location)
    app.use("/api/campaign",myRouter.campaign)
    app.use("/api/campaignEntry",myRouter.campaignEntry)
    app.use("/api/card",myRouter.card)
    app.use("/api/finanicial/ap/header",myRouter.paymentHeadAP)
    app.use("/api/finanicial/ar/header",myRouter.receiveHeadAR)
    app.use("/api/currency",myRouter.currency)
    app.use("/api/purchasing",myRouter.poheader)
    app.use("/api/purchasing/line",myRouter.poLine)
    app.use("/api/category",myRouter.category)
    app.use("/api/customer",myRouter.dymCustomerRouter)
    app.use("/api/geography",myRouter.geography)
    app.use("/api/client",myRouter.client)
    app.use("/api/paymentMethod",myRouter.paymentMethod)
    app.use("/api/unit",myRouter.unit)
    app.use("/api/quotation",myRouter.quotation)
    app.use("/api/quotationLine",myRouter.quotationLine)
    app.use("/api/sale",myRouter.sale)
    app.use("/api/sale-payment",myRouter.salePayment)
    app.use("/api/saleLine",myRouter.saleLine)
    app.use("/api/product",myRouter.product)
    // app.use("/api/product-temps",myRouter.productTemp)
    app.use("/api/recipes",myRouter.recipe)
    app.use("/api/transfer",myRouter.transfer)
    app.use("/api/terminal",myRouter.terminal)
    app.use("/api/user",myRouter.user)
    app.use("/api/shipping",myRouter.shipping)
    app.use("/api/company",myRouter.company)
    app.use("/api/tutorial",myRouter.tutorial)
    app.use("/api/group",myRouter.group)
    app.use("/api/authority",myRouter.authority)
    app.use("/api/account",myRouter.account)
    app.use("/api/priceList",myRouter.priceList)
    app.use("/api/order",myRouter.order)
    app.use("/api/vendor",myRouter.vendor)
    app.use("/api/menuHeader",myRouter.menuHeader)
    app.use("/api/menuLine",myRouter.menuLine)
    app.use("/api/reservation",myRouter.reservation)
    app.use("/api/receiving",myRouter.receiving)
    app.use("/api/receiving/line",myRouter.receivingLine)
    app.use("/api/webproductgroup",myRouter.webProductGroup)
    app.use("/api/spf",myRouter.spf)
    app.use("/api/service",myRouter.service)
    app.use("/api/washjob",myRouter.washJob)
    app.use("/api/tables",myRouter.table)
    app.use("/api/ticket",myRouter.ticket)
    app.use("/api/ticketLine",myRouter.ticketLine)
    app.use("/api/tax",myRouter.tax)
    app.use("/api/money-advances",myRouter.moneyAdvance)
    app.use("/api/ac-statement",myRouter.accountStatement)
    app.use("/api/money-advances/report",myRouter.moneyAdvanceReport)
    app.use("/api/settlements",myRouter.moneySettlement)
    app.use("/api/ministries",myRouter.ministry)
    app.use("/api/applicants",myRouter.applicant)
    app.use("/api/agency",myRouter.agency)
    app.use("/api/benefits",myRouter.benefit)
    app.use("/api/job-advertises",myRouter.jobAdvertise)
    app.use("/api/revenue-targets",myRouter.revenueTarget)
    app.use("/api/ar-invoices",myRouter.arInvoiceHeader)
    app.use("/api/ar-invoice-lines",myRouter.arInvoiceLine)
    app.use("/api/ar-receive-headers",myRouter.arReceiveHeader)
    app.use("/api/ar-receive-lines",myRouter.arReceiveLine)
    app.use("/api/ap-invoices",myRouter.apInvoice)
    app.use("/api/ap-invoices-lines",myRouter.apInvoiceLine)
    app.use("/api/ap-invoices-settlement",myRouter.apInvoiceSettlement)
    app.use("/api/ap-invoices-settlement-line",myRouter.apInvoiceSettlementLine)
    app.use("/api/batch-job",myRouter.batchJob)
    app.use("/api/mous",myRouter.MOU)
    app.use("/api/role",myRouter.userRole)
    app.use("/api/promotions",myRouter.promotions)
    app.use("/api/member-offers",myRouter.memberOffer)
    app.use("/api/transaction-codes",myRouter.transaction)
    app.use("/api/stock-transactions",myRouter.stockTransaction)
    app.use("/api/qr",myRouter.qrRouter)
    app.use("/api/size",myRouter.size)
    app.use("/api/color",myRouter.color)
    app.use("/api/printers",myRouter.printer)

    Router.category(app);
    Router.product(app);
    Router.sale(app);
    Router.user(app);
    Router.customer(app);
    Router.txntype(app);
    Router.txn(app);
    Router.txnHis(app);
    Router.login(app);
    Router.upload(app);
    Router.authenticate(app);
    Router.userorder(app);
    Router.updateUserInfo(app);
    Router.fetchStockCategory(app);
    Router.stockAction(app);
    Router.userIbox(app);
    Router.registerCus(app);
    Router.card(app);
    Router.advertise(app);
    Router.bank(app);
    Router.chatType(app);
    Router.chat(app);
    Router.walletTxn(app);
    Router.report(app);
    Router.ticket(app);
    Router.outlet(app);
    Router.payment(app);
    Router.shipping(app);
    return app;
}

module.exports = buildApp;