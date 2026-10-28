const platform = require('./platform');
const account = require('./account');
const router = require('./router');
const tokenHelper = require('./tokenHelper');

module.exports = {
  platform,
  account,
  router,
  controller: platform.controller,
  model: platform.model,
  tokenHelper
};
