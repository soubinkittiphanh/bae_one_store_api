// Import all your association files
const apPaymentHeaderAssociations = require('./apPaymentHeader');
const arReceiveHeaderAssociations = require('./arReceiveHeader');
const campaignAssociations = require('./campaignAssociations');
const financialAssociations = require('./financialAssociations');
const locationAssociations = require('./location');
const orderAssociations = require('./orderAssociations');
const productAssociations = require('./productAssociations');
const receivingHeaderAssociations = require('./receivingHeader');
const receivingLineAssociations = require('./receivingLine');
const reservationAssociations = require('./reservation');
const reservationLineAssociations = require('./reservationLine');
const transferAssociations = require('./transferAssociations');
const userAssociations = require('./userAssociations');
const webProductGroupAssociations = require('./webProductGroup');


module.exports = (db) => {
    apPaymentHeaderAssociations(db);
    arReceiveHeaderAssociations(db);
    campaignAssociations(db);
    financialAssociations(db);
    locationAssociations(db);
    orderAssociations(db);
    productAssociations(db);
    receivingHeaderAssociations(db);
    receivingLineAssociations(db);
    reservationAssociations(db);
    reservationLineAssociations(db);
    transferAssociations(db);
    userAssociations(db);
    webProductGroupAssociations(db);
  };