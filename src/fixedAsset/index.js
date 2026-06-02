const controller = require('./controller');
const router = require('./router');
const service = require('./service');
const productModel = require('./productModel');
const contractModel = require('./contractModel');
const depreciationModel = require('./depreciationModel');

module.exports = {
    controller,
    router,
    service,
    productModel,
    contractModel,
    depreciationModel
};
