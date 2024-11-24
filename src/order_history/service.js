const logger = require('../api/logger');
const { client, order } = require('../models');
const OrderHIS = require('../models').orderHIS;
const Client = require('../models').client;
const { sequelize } = require('../models');
const { Op, where, literal } = require('sequelize');

exports.createHIS = async (order) => {
      try {
        logger.warn(`KEEPING ORDER HISTORY 1 ${JSON.stringify(order)}`)
        const newObject = JSON.stringify(order)
        let hisObject = JSON.parse(newObject)
        hisObject['originalId'] = hisObject['id'] 
        hisObject['orderId'] = hisObject['id'] 
        hisObject['id'] = null 
        logger.warn(`KEEPING ORDER HISTORY 2 ${JSON.stringify(hisObject)}`)
        const dbOrder = await OrderHIS.create(hisObject)
        logger.info(`ORDER HISTORY FILE CREATED... ${JSON.stringify(dbOrder)}`)
      } catch (error) {
        logger.error(`Cannot create order HISTORY with error ${error}`)
      }
};
