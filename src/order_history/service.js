const logger = require('../api/logger');
const { client, order } = require('../models');
const OrderHIS = require('../models').orderHIS;
const Client = require('../models').client;
const { sequelize } = require('../models');
const { Op, where, literal } = require('sequelize');

exports.createHIS = async (order) => {
  // Validate request
      try {
        logger.warn(`KEEPING ORDER HISTORY ${JSON.stringify(order)}`)
        const dbOrder = await OrderHIS.create({...order,originalId:order['id'],id:null})
        logger.info(`ORDER HISTORY FILE CREATED...`)
      } catch (error) {
        logger.error(`Cannot create order HISTORY with error ${error}`)
      }
};
