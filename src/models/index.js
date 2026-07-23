const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../api/logger');
const env = require('../config/env').db;

// Database connection configurations
const createSequelizeInstance = (database, options = {}) => {
  const defaultOptions = {
    host: env.host,
    dialect: 'mariadb',
    port: env.port,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    },
    timezone: '+07:00',
    dialectOptions: {
      useUTC: false, // ✅ Do not convert date to UTC
    },
    ...options
  };

  return new Sequelize(database, env.user, env.password, defaultOptions);
};

// Main database connection
const sequelize = createSequelizeInstance(env.database, {
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  define: {
    indexes: [] // Empty array instead of false
  }
});

// Tutorial database connection
const tutorialDB = createSequelizeInstance('tutorial_db', {
  pool: { max: 5, min: 2, acquire: 30000, idle: 10000 }
});

// Database authentication
const authenticateDatabase = async (instance, name) => {
  try {
    await instance.authenticate();
    logger.info(`${name} Connection established`);
  } catch (err) {
    logger.error(`${name} Connection error: ${err}`);
  }
};

// Initialize database connections
authenticateDatabase(sequelize, 'client_db');
authenticateDatabase(tutorialDB, 'tutorial_db');

// Model definitions
const initializeModels = () => {
  const db = {};

  // Core Sequelize instances
  db.sequelize = sequelize;
  db.Sequelize = Sequelize;
  db.centralSequelize = tutorialDB;

  // Import all models
  const models = {
    // Core models
    spf: require("../spf/model")(sequelize, DataTypes),
    client: require("../client/model")(sequelize, DataTypes),
    clientAudit: require("../client/auditModel")(sequelize, DataTypes),
    group: require("../group/model")(sequelize, DataTypes),
    GroupMenuHeader: require("../groupMenuHeaders/model")(sequelize, DataTypes),
    role: require("../userRole/model")(sequelize, DataTypes),
    user: require("../user/model")(sequelize, DataTypes),
    Agency: require("../job-fair/agency/model")(sequelize, DataTypes),
    Applicant: require("../job-fair/applicant/model")(sequelize, DataTypes),
    MOU: require("../job-fair/MOU/model")(sequelize, DataTypes),
    jobAdvertise: require("../job-fair/jobDescription/model")(sequelize, DataTypes),
    JobBatch: require("../job-fair/job-batch/model")(sequelize, DataTypes),
    benefit: require("../benefit/model")(sequelize, DataTypes),
    company: require("../company/model")(sequelize, DataTypes),
    location: require("../location/model")(sequelize, DataTypes),
    currency: require("../currency/model")(sequelize, DataTypes),
    currencyAudit: require("../currency/auditModel")(sequelize, DataTypes),
    unit: require("../unit/model")(sequelize, DataTypes),
    printerModel: require("../printer/model")(sequelize, DataTypes),
    stockTransactionModel: require("../stockTransaction/model")(sequelize, DataTypes),
    // unit: require("../unit/model")(sequelize, DataTypes),
    mainCategory: require("../mainCategory/model")(sequelize, DataTypes),
    category: require("../category/model")(sequelize, DataTypes),
    student: require("../student/model")(sequelize, DataTypes),
    nfcCard: require("../nfcCard/model")(sequelize, DataTypes),
    transactionEntry: require("../transactionEntry/model")(sequelize, DataTypes),
    // Product related models
    tax: require("../tax/model")(sequelize, DataTypes),
    product: require("../product/model")(sequelize, DataTypes),
    productAudit: require("../product/auditModel")(sequelize, DataTypes),
    productTemp: require("../productTemp/model")(sequelize, DataTypes),
    productSize: require("../product_size/model")(sequelize, DataTypes),
    image: require("../image/model")(sequelize, DataTypes),
    priceList: require("../priceList/model")(sequelize, DataTypes),
    webProductGroup: require("../web_product_group/model")(sequelize, DataTypes),

    // Customer and order models
    customer: require("../dynamicCustomer/model")(sequelize, DataTypes),
    order: require("../order/model")(sequelize, DataTypes),
    orderHIS: require("../order_history/model")(sequelize, DataTypes),
    orderTable: require("../orderTable/model")(sequelize, DataTypes),
    // POS models
    recipe: require("../recipe/model")(sequelize, DataTypes),
    table: require("../pos/table/model")(sequelize, DataTypes),
    ticket: require("../pos/ticket/model")(sequelize, DataTypes),
    promotion: require("../pos/promotion/model")(sequelize, DataTypes),
    ticketLine: require("../pos/ticketLine/model")(sequelize, DataTypes),
    MemberOffer: require("../member_offer/model")(sequelize, DataTypes),
    loyaltyTransaction: require("../loyalty/model")(sequelize, DataTypes),
    // Wash job models
    washjob: require("../carcare/washJob/model")(sequelize, DataTypes),
    washjobHis: require("../carcare/washJob-history/model")(sequelize, DataTypes),
    washjobline: require("../carcare/washJobLine/model")(sequelize, DataTypes),
    // Sales models
    QRRequest: require("../QRRequest/model")(sequelize, DataTypes),
    saleHeader: require("../sales/model")(sequelize, DataTypes),
    salePayment: require("../salePayment/model")(sequelize, DataTypes),
    saleLine: require("../sales/line/model")(sequelize, DataTypes),

    // Quotation models
    quotationHeader: require("../quotation/model")(sequelize, DataTypes),
    quotationLine: require("../quotation/line/model")(sequelize, DataTypes),

    // Purchase order models
    poHeader: require("../purchasing/model")(sequelize, DataTypes),
    poLine: require("../purchasing/line/model")(sequelize, DataTypes),
    poHeaderHIS: require("../po_history/model")(sequelize, DataTypes),
    poLineHIS: require("../po_history/line/model")(sequelize, DataTypes),

    // Receiving models
    receivingHeader: require("../receiving/model")(sequelize, DataTypes),
    receivingLine: require("../receiving/line/model")(sequelize, DataTypes),

    // Reservation models
    reservation: require("../reservation/model")(sequelize, DataTypes),
    reservationLine: require("../reservation/line/model")(sequelize, DataTypes),



    // Transfer models
    transferHeader: require("../transfer/model")(sequelize, DataTypes),
    transferLine: require("../transfer/line/model")(sequelize, DataTypes),

    // Menu models
    menuHeader: require("../menu/model")(sequelize, DataTypes),
    menuLine: require("../menu/line/model")(sequelize, DataTypes),
    MenuHeaderLines: require("../menuHeaderLine/model")(sequelize, DataTypes),
    webMenuHeader: require("../web_menu_header/model")(sequelize, DataTypes),



    // Financial models

    QRResponse: require("../QRResponse/model")(sequelize, DataTypes),
    PaymentCallback: require("../PaymentCallback/model")(sequelize, DataTypes),
    Color: require("../color/model")(sequelize, DataTypes),
    Size: require("../size/model")(sequelize, DataTypes),
    card: require("../card/model")(sequelize, DataTypes),
    Transaction: require("../transaction/model")(sequelize, DataTypes),
    glPostingBatch: require("../GL/postingBatchModel")(sequelize, DataTypes),
    gl: require("../GL/model")(sequelize, DataTypes),
    chartAccount: require("../account/model")(sequelize, DataTypes),
    fixedAssetProduct: require("../fixedAsset/productModel")(sequelize, DataTypes),
    fixedAssetContract: require("../fixedAsset/contractModel")(sequelize, DataTypes),
    fixedAssetDepreciation: require("../fixedAsset/depreciationModel")(sequelize, DataTypes),
    apPaymentHeader: require("../payment/header/model")(sequelize, DataTypes), //TODO:
    arReceiveHeader: require("../income/model")(sequelize, DataTypes), //TODO:
    payment: require("../paymentMethod/model")(sequelize, DataTypes),
    bank: require("../bank/model")(sequelize, DataTypes),
    bankAccount: require("../bankAccount/model")(sequelize, DataTypes),
    ministry: require("../ministry/model")(sequelize, DataTypes),
    moneySettlement: require("../PWT/moneySettlement/model")(sequelize, DataTypes),
    moneyAdvanceAudit: require("../PWT/moneyAdvanceAudit/model")(sequelize, DataTypes),
    moneyAdvance: require("../PWT/moneyAdvance/model")(sequelize, DataTypes),
    AccountStatement: require("../PWT/accountStatement/model")(sequelize, DataTypes),
    Project: require("../PWT/project/model")(sequelize, DataTypes),
    ProjectBudget: require("../PWT/projectBudget/model")(sequelize, DataTypes),
    ProjectContract: require("../PWT/projectContract/model")(sequelize, DataTypes),
    ProjectInvoice: require("../PWT/projectInvoice/model")(sequelize, DataTypes),
    WithdrawalApplication: require("../PWT/withdrawalApplication/model")(sequelize, DataTypes),
    revenue_target: require("../revenueTarget/model")(sequelize, DataTypes),
    apInvoice: require("../AP/invoice/model")(sequelize, DataTypes),
    apInvoiceAudit: require("../AP/invoiceAudit/model")(sequelize, DataTypes),
    invoiceLineItem: require("../AP/invoiceLine/model")(sequelize, DataTypes),
    apInvoiceSettlement: require("../AP/invoiceSettlement/model")(sequelize, DataTypes),
    apSettlementAudit: require("../AP/invoiceSettlementAudit/model")(sequelize, DataTypes),
    apInvoiceSettlementLine: require("../AP/invoiceSettlementLine/model")(sequelize, DataTypes),
    arInvoiceHeader: require("../AR/invoice/header/model")(sequelize, DataTypes),
    arInvoiceHeaderAudit: require("../AR/invoice/headerAudit/model")(sequelize, DataTypes),
    arInvoiceLine: require("../AR/invoice/line/model")(sequelize, DataTypes),
    arReceiveHeaderV2: require("../AR/receive/header/model")(sequelize, DataTypes), //TODO:
    arReceiveHeaderAudit: require("../AR/receive/headerAudit/model")(sequelize, DataTypes), //TODO:
    arReceiveLine: require("../AR/receive/line/model")(sequelize, DataTypes),


    // Other models
    vendor: require("../vendor/model")(sequelize, DataTypes),
    shipping: require("../shipping/model")(sequelize, DataTypes),
    shipping_order: require("../shippingOrder/model")(sequelize, DataTypes),
    shipping_checkout_batch: require("../shippingCheckoutBatch/model")(sequelize, DataTypes),
    service: require("../service/model")(sequelize, DataTypes),
    authority: require("../authority/model")(sequelize, DataTypes),
    terminal: require("../terminal/model")(sequelize, DataTypes),
    terminalAudit: require("../terminal/auditModel")(sequelize, DataTypes),
    // card: require("../card/model")(sequelize, DataTypes),
    campaign: require("../controllers/admin/campaign/model")(sequelize, DataTypes),
    campaignEntry: require("../controllers/admin/campaign/entry/model")(sequelize, DataTypes),
    rider: require("../rider/model")(sequelize, DataTypes),
    outlet: require("../outlet/model")(sequelize, DataTypes),
    geography: require("../geography/model")(sequelize, DataTypes),
    country: require("../country/model")(sequelize, DataTypes),
    village: require("../district/model")(sequelize, DataTypes),
    district: require("../district-village/model")(sequelize, DataTypes),
    accountDailyBalance: require("../accountDailyBalance/model")(sequelize, DataTypes),
    businessDate: require("../businessDate/model")(sequelize, DataTypes),

    // Microfinance models
    cifCustomer: require("../microfinance/cif/model")(sequelize, DataTypes),
    microfinanceGroup: require("../microfinance/groups/model")(sequelize, DataTypes),
    mfCollateral: require("../microfinance/collateral/model")(sequelize, DataTypes),
    mfLoanProduct: require("../microfinance/products/model")(sequelize, DataTypes),
    mfLoanAccount: require("../microfinance/accounts/model")(sequelize, DataTypes),
    mfRepaymentSchedule: require("../microfinance/accounts/scheduleModel")(sequelize, DataTypes),
    mfJournalEntry: require("../microfinance/journal/model")(sequelize, DataTypes),

    // Tutorial model (uses different DB)
    tuturial: require("../tutorial/model")(tutorialDB, DataTypes),
  };

  // Add all models to db object
  Object.assign(db, models);

  return db;
};

// Association definitions organized by domain
const defineAssociations = (db) => {
  // User and Group associations
  defineUserAssociations(db);

  // Product associations
  defineProductAssociations(db);

  // Order associations
  defineOrderAssociations(db);

  // Sales associations
  defineSalesAssociations(db);

  // Purchase order associations
  definePurchaseOrderAssociations(db);

  // Quotation associations
  defineQuotationAssociations(db);

  // Reservation associations
  defineReservationAssociations(db);

  // Wash job associations
  defineWashJobAssociations(db);

  // Transfer associations
  defineTransferAssociations(db);

  // Financial associations
  defineFinancialAssociations(db);

  // Menu associations
  defineMenuAssociations(db);

  // Campaign associations
  defineCampaignAssociations(db);

  // Location and company associations
  defineLocationAssociations(db);


  // Many-to-many associations
  defineManyToManyAssociations(db);
};

// User and Group associations
const defineUserAssociations = (db) => {
  db.user.belongsTo(db.group, {
    foreignKey: 'groupId',
    as: 'userGroup'
  });
};

// Product associations
const defineProductAssociations = (db) => {
  // // Product core associations
  // db.product.belongsTo(db.category, { foreignKey: 'pro_category', as: 'category' });
  // db.product.belongsTo(db.company, { foreignKey: 'companyId', as: 'company' });
  // db.product.belongsTo(db.unit, { foreignKey: 'stockUnitId', as: 'stockUnit' });
  // db.product.belongsTo(db.unit, { foreignKey: 'receiveUnitId', as: 'receiveUnit' });
  // db.product.belongsTo(db.currency, { foreignKey: 'costCurrencyId', as: 'costCurrency' });
  // db.product.belongsTo(db.currency, { foreignKey: 'saleCurrencyId', as: 'saleCurrency' });
  // db.product.belongsTo(db.tax, { foreignKey: 'taxId', as: 'tax' });

  // // Product has many associations
  // db.product.hasMany(db.image, { as: 'images' });
  // db.product.hasMany(db.priceList, { as: 'priceLists' });
  // db.product.hasMany(db.productSize, { as: 'sizeLists' });
  // db.product.hasMany(db.card, { as: 'cards' });
  // db.product.hasMany(db.ticketLine, { foreignKey: 'productId', as: 'ticketLines' });

  // Related model associations
  db.category.hasMany(db.product, { as: 'products' });
  db.image.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.productSize.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.priceList.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.priceList.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });

};

// Order associations
const defineOrderAssociations = (db) => {
  // Order core associations
  db.order.belongsTo(db.location, { foreignKey: 'locationId', as: 'location' });
  db.order.belongsTo(db.location, { foreignKey: 'endLocationId', as: 'endLocation' });
  db.order.belongsTo(db.client, { foreignKey: 'senderId', as: 'sender' });
  db.order.belongsTo(db.client, { foreignKey: 'clientId', as: 'client' });
  db.order.belongsTo(db.user, { foreignKey: 'userId', as: 'user' });
  db.order.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.order.belongsTo(db.currency, { foreignKey: 'shippingFeeCurrencyId', as: 'shippingFeeCurrency' });
  db.order.belongsTo(db.vendor, { foreignKey: 'vendorId', as: 'vendor' });
  db.order.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });
  db.order.belongsTo(db.rider, { foreignKey: 'riderId', as: 'rider' });
  db.order.belongsTo(db.shipping, { foreignKey: 'shippingId', as: 'shipping' });
  db.order.hasMany(db.orderHIS, { as: 'histories' });

  // Order history associations
  db.orderHIS.belongsTo(db.location, { foreignKey: 'locationId', as: 'location' });
  db.orderHIS.belongsTo(db.location, { foreignKey: 'endLocationId', as: 'endLocation' });
  db.orderHIS.belongsTo(db.client, { foreignKey: 'senderId', as: 'sender' });
  db.orderHIS.belongsTo(db.client, { foreignKey: 'clientId', as: 'client' });
  db.orderHIS.belongsTo(db.user, { foreignKey: 'userId', as: 'user' });
  db.orderHIS.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.orderHIS.belongsTo(db.currency, { foreignKey: 'shippingFeeCurrencyId', as: 'shippingFeeCurrency' });
  db.orderHIS.belongsTo(db.vendor, { foreignKey: 'vendorId', as: 'vendor' });
  db.orderHIS.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });
  db.orderHIS.belongsTo(db.order, { foreignKey: 'originalId', as: 'original' });
  db.orderHIS.belongsTo(db.rider, { foreignKey: 'riderId', as: 'rider' });
  db.orderHIS.belongsTo(db.shipping, { foreignKey: 'shippingId', as: 'shipping' });

  // Customer and rider associations
  db.customer.belongsTo(db.saleHeader, { foreignKey: 'saleHeaderId', as: 'saleHeader' });
  db.customer.belongsTo(db.rider, { foreignKey: 'riderId', as: 'rider' });
  db.customer.belongsTo(db.geography, { foreignKey: 'geoId', as: 'geography' });
  db.customer.belongsTo(db.shipping, { foreignKey: 'shippingId', as: 'shipping' });
  db.rider.hasMany(db.order, { as: 'shippingOrders' });
  db.rider.hasMany(db.customer, { as: 'orders' });

  // Shipping order associations
  db.shipping_order.belongsTo(db.client, { foreignKey: 'customer_id', as: 'customer' });
  db.client.hasMany(db.shipping_order, { foreignKey: 'customer_id', as: 'shippingOrders' });
  db.shipping_order.belongsTo(db.currency, { foreignKey: 'currency_id', as: 'currency' });

  // Shipping checkout batch associations
  db.shipping_checkout_batch.belongsTo(db.client, { foreignKey: 'customer_id', as: 'customer' });
  db.client.hasMany(db.shipping_checkout_batch, { foreignKey: 'customer_id', as: 'checkoutBatches' });
  db.shipping_checkout_batch.hasMany(db.shipping_order, { foreignKey: 'checkout_batch_id', as: 'orders' });
  db.shipping_order.belongsTo(db.shipping_checkout_batch, { foreignKey: 'checkout_batch_id', as: 'checkoutBatch' });
  db.shipping_checkout_batch.hasMany(db.salePayment, { foreignKey: 'shippingCheckoutBatchId', as: 'payments' });
};

// Sales associations
const defineSalesAssociations = (db) => {


  // Sale line associations
  // db.saleLine.belongsTo(db.saleHeader, { foreignKey: 'headerId', as: 'header' });
  // db.saleLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  // db.saleLine.belongsTo(db.unit, { foreignKey: 'unitId', as: 'unit' });
  // db.saleLine.belongsTo(db.priceList, { foreignKey: 'priceListId', as: 'priceList' });
  // db.saleLine.hasMany(db.card, { as: 'cards' });

  // Related associations
  db.orderTable.hasMany(db.saleHeader, { as: 'saleHeader' });

};

// Purchase order associations
const definePurchaseOrderAssociations = (db) => {
  // PO header associations
  db.poHeader.belongsTo(db.vendor, { foreignKey: 'vendorId', as: 'vendor' });
  db.poHeader.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.poHeader.hasMany(db.poLine, { as: 'lines' });
  db.poHeader.hasMany(db.poHeaderHIS, { as: 'history' });

  // PO line associations
  db.poLine.belongsTo(db.poHeader, { foreignKey: 'headerId', as: 'header' });
  db.poLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.poLine.belongsTo(db.unit, { foreignKey: 'unitId', as: 'unit' });
  db.poLine.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });

  // PO history associations
  db.poHeaderHIS.belongsTo(db.poHeader, { foreignKey: 'ORGheaderId', as: 'ORGheader' });
  db.poHeaderHIS.belongsTo(db.vendor, { foreignKey: 'vendorId', as: 'vendor' });
  db.poHeaderHIS.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });

  // Receiving associations
  db.receivingHeader.belongsTo(db.location, { foreignKey: 'locationId', as: 'location' });
  db.receivingHeader.belongsTo(db.poHeader, { foreignKey: 'poHeaderId', as: 'poHeader' });
  db.receivingHeader.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.receivingHeader.belongsTo(db.vendor, { foreignKey: 'vendorId', as: 'vendor' });
  db.receivingHeader.hasMany(db.receivingLine, { as: 'lines' });

  db.receivingLine.belongsTo(db.receivingHeader, { foreignKey: 'headerId', as: 'header' });
  db.receivingLine.belongsTo(db.poLine, { foreignKey: 'poLineId', as: 'poLine' });
  db.receivingLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.receivingLine.belongsTo(db.unit, { foreignKey: 'unitId', as: 'unit' });
  db.receivingLine.hasMany(db.card, { as: 'cards' });
};

// Quotation associations
const defineQuotationAssociations = (db) => {
  db.quotationHeader.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });
  db.quotationHeader.belongsTo(db.client, { foreignKey: 'clientId', as: 'client' });
  db.quotationHeader.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.quotationHeader.belongsTo(db.user, { foreignKey: 'userId', as: 'user' });
  db.quotationHeader.hasMany(db.quotationLine, { as: 'lines' });

  db.quotationLine.belongsTo(db.quotationHeader, { foreignKey: 'headerId', as: 'header' });
  db.quotationLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.quotationLine.belongsTo(db.unit, { foreignKey: 'unitId', as: 'unit' });
};

// Reservation associations
const defineReservationAssociations = (db) => {
  db.reservation.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });
  db.reservation.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.reservation.hasMany(db.reservationLine, { as: 'lines' });

  db.reservationLine.belongsTo(db.reservation, { foreignKey: 'reservationHeaderId', as: 'reservationHeader' });
  db.reservationLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.reservationLine.belongsTo(db.unit, { foreignKey: 'unitId', as: 'unit' });
};

// Wash job associations
const defineWashJobAssociations = (db) => {
  db.washjob.belongsTo(db.saleHeader, { foreignKey: 'saleHeaderId', as: 'saleHeader' });
  db.washjob.hasMany(db.washjobline, { as: 'lines' });

  db.washjobline.belongsTo(db.washjob, { foreignKey: 'washJobId', as: 'washjob' });
  db.washjobline.belongsTo(db.priceList, { foreignKey: 'priceListId', as: 'priceList' });
  db.washjobline.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
};

// Transfer associations
const defineTransferAssociations = (db) => {
  db.transferHeader.belongsTo(db.location, { foreignKey: 'srcLocationId', as: 'srcLocation' });
  db.transferHeader.belongsTo(db.location, { foreignKey: 'desLocationId', as: 'desLocation' });
  db.transferHeader.belongsTo(db.user, { foreignKey: 'userId', as: 'user' });
  db.transferHeader.hasMany(db.transferLine, { as: 'lines' });

  db.transferLine.belongsTo(db.transferHeader, { foreignKey: 'headerId', as: 'header' });
  db.transferLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.transferLine.belongsTo(db.unit, { foreignKey: 'unitId', as: 'unit' });
  db.transferLine.hasMany(db.card, { as: 'cards' });

};

// Financial associations
const defineFinancialAssociations = (db) => {
  // AP Payment associations
  db.apPaymentHeader.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.apPaymentHeader.belongsTo(db.receivingHeader, { foreignKey: 'receivingId', as: 'recevingHeader' });
  db.apPaymentHeader.belongsTo(db.chartAccount, { foreignKey: 'drAccountId', as: 'drAccount' });
  db.apPaymentHeader.belongsTo(db.chartAccount, { foreignKey: 'crAccountId', as: 'crAccount' });
  db.apPaymentHeader.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });

  // AR Receive associations
  db.arReceiveHeader.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.arReceiveHeader.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });
  db.arReceiveHeader.belongsTo(db.chartAccount, { foreignKey: 'drAccountId', as: 'drAccount' });
  db.arReceiveHeader.belongsTo(db.chartAccount, { foreignKey: 'crAccountId', as: 'crAccount' });

  // GL associations
  db.chartAccount.hasMany(db.gl, { as: 'gls', foreignKey: 'drAccountId' });
  db.chartAccount.hasMany(db.gl, { as: 'glsCredit', foreignKey: 'crAccountId' });
  db.gl.belongsTo(db.chartAccount, { foreignKey: 'drAccountId', as: 'drAccount' });
  db.gl.belongsTo(db.chartAccount, { foreignKey: 'crAccountId', as: 'crAccount' });
  db.gl.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.gl.belongsTo(db.Project, { foreignKey: 'projectId', as: 'project' });
  db.gl.belongsTo(db.ProjectContract, { foreignKey: 'contractId', as: 'contract' });
  db.gl.belongsTo(db.ministry, { foreignKey: 'ministryId', as: 'ministry' });
  db.gl.belongsTo(db.ProjectBudget, { foreignKey: 'categoryId', as: 'category' });

  // Batch associations
  db.glPostingBatch.hasMany(db.gl, { foreignKey: 'glBatchId', sourceKey: 'batchNumber', as: 'glEntries' });
  db.gl.belongsTo(db.glPostingBatch, { foreignKey: 'glBatchId', targetKey: 'batchNumber', as: 'postingBatch' });

  // Fixed Asset associations
  db.fixedAssetProduct.belongsTo(db.chartAccount, { foreignKey: 'assetCostAccountId', as: 'assetCostAccount' });
  db.fixedAssetProduct.belongsTo(db.chartAccount, { foreignKey: 'accumulatedDepreciationAccountId', as: 'accumulatedDepreciationAccount' });
  db.fixedAssetProduct.belongsTo(db.chartAccount, { foreignKey: 'depreciationExpenseAccountId', as: 'depreciationExpenseAccount' });

  db.fixedAssetContract.belongsTo(db.fixedAssetProduct, { foreignKey: 'fixedAssetProductId', as: 'fixedAssetProduct' });
  db.fixedAssetContract.belongsTo(db.location, { foreignKey: 'locationId', as: 'location' });
  db.fixedAssetContract.belongsTo(db.vendor, { foreignKey: 'vendorId', as: 'vendor' });
  db.fixedAssetContract.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });

  db.fixedAssetContract.hasMany(db.fixedAssetDepreciation, { foreignKey: 'fixedAssetContractId', as: 'depreciationSchedule' });
  db.fixedAssetDepreciation.belongsTo(db.fixedAssetContract, { foreignKey: 'fixedAssetContractId', as: 'fixedAssetContract' });


};

// Menu associations
const defineMenuAssociations = (db) => {
  // Note: Many-to-many relationship handled in defineManyToManyAssociations
};

// Campaign associations
const defineCampaignAssociations = (db) => {
  db.campaign.hasMany(db.campaignEntry, { as: 'entries' });
  db.campaignEntry.belongsTo(db.campaign, { foreignKey: 'campaign_id', as: 'campaign' });
};

// Location and company associations
const defineLocationAssociations = (db) => {
  db.location.belongsTo(db.company, { foreignKey: 'companyId', as: 'company' });
  db.terminal.belongsTo(db.location, { foreignKey: 'locationId', as: 'location' });
  db.terminal.belongsTo(db.bankAccount, { foreignKey: 'bankAccountId', as: 'bankAccount' });
};



// Many-to-many associations
const defineManyToManyAssociations = (db) => {
  // Web product group associations
  db.webProductGroup.belongsToMany(db.product, { through: 'WebGroupProduct' });
  db.product.belongsToMany(db.webProductGroup, { through: 'WebGroupProduct' });
  db.webProductGroup.hasMany(db.product, { as: 'lines' });

  // Menu associations
  // db.menuHeader.belongsToMany(db.menuLine, { through: 'MenuHeaderLines' });
  // db.menuLine.belongsToMany(db.menuHeader, { through: 'MenuHeaderLines' });
  db.menuHeader.belongsToMany(db.menuLine, {
    through: db.MenuHeaderLines,
    foreignKey: 'menuHeaderId',
    otherKey: 'menuLineId'
  });

  db.menuLine.belongsToMany(db.menuHeader, {
    through: db.MenuHeaderLines,
    foreignKey: 'menuLineId',
    otherKey: 'menuHeaderId'
  });

  // User terminal associations
  db.user.belongsToMany(db.terminal, { through: 'UserTerminals' });
  db.terminal.belongsToMany(db.user, { through: 'UserTerminals' });

  // Authority group associations
  db.authority.belongsToMany(db.group, { through: 'GroupAuthorities' });
  db.group.belongsToMany(db.authority, { through: 'GroupAuthorities' });

  // Group menu header associations
  // db.menuHeader.belongsToMany(db.group, { through: 'GroupMenuHeader' });
  // db.group.belongsToMany(db.menuHeader, { through: 'GroupMenuHeader' });
  db.menuHeader.belongsToMany(db.group, {
    through: 'GroupMenuHeader',
    foreignKey: 'menuHeaderId',
    otherKey: 'userGroupId'
  });

  db.group.belongsToMany(db.menuHeader, {
    through: 'GroupMenuHeader',
    foreignKey: 'userGroupId',
    otherKey: 'menuHeaderId'
  });
};

// Initialize and setup associations
const setupAssociations = (db) => {
  Object.keys(db).forEach(modelName => {
    logger.info(`Model name ${modelName}`);
    if (db[modelName].associate) {
      db[modelName].associate(db);
    }
  });

  defineAssociations(db);
};

// Database synchronization
const synchronizeDatabase = async (db) => {
  try {
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    // Phase 1: Create new tables that do not exist yet
    await db.sequelize.sync({ force: false });
    // Phase 2: Alter existing tables to add fields and constraints
    await db.sequelize.sync({ force: false, alter: { drop: false } });
    await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    logger.info("Database client is synchronized");

    const userService = require('../user/service');
    const brandNewDB = await userService.ensureDefaultUserExists();
    logger.info("Default user check complete.");
  } catch (error) {
    try { await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (e) {}
    logger.error("Error synchronizing database:", error);
  }

  try {
    await db.centralSequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    // Phase 1: Create new tables that do not exist yet
    await db.centralSequelize.sync({ force: false });
    // Phase 2: Alter existing tables to add fields and constraints
    await db.centralSequelize.sync({ force: false, alter: { drop: false } });
    await db.centralSequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    logger.info("Database central is synchronized");
  } catch (error) {
    try { await db.centralSequelize.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (e) {}
    logger.error("Error synchronizing central database:", error);
  }
};

// Initialize everything
const db = initializeModels();
setupAssociations(db);

if (process.env.NO_SYNC !== 'true') {
  synchronizeDatabase(db);
}

module.exports = db;