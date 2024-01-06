const logger = require('../api/logger');
const { client, order } = require('../models');
const Order = require('../models').order;
const Client = require('../models').client;
const { sequelize } = require('../models');
const { Op, where, literal } = require('sequelize');
const orderHisService = require('../order_history/service')
exports.create = async (req, res) => {

  try {
    const result = await sequelize.transaction(async (t) => {
      let order = {
        clientId: req.body.client.id,
        // senderId: req.body.sender.id,
        currencyId: req.body.currencyId,
        locationId: req.body.locationId,
        endLocationId: req.body.endLocationId,
        priceRate: req.body.priceRate,
        shippingFeeCurrencyId: req.body.shippingFeeCurrencyId,
        shippingRate: req.body.shippingRate,
        status: req.body.status,
        bookingDate: req.body.bookingDate,
        name: req.body.name,
        note: req.body.note,
        refNumber: req.body.refNumber,
        trackingNumber: req.body.trackingNumber,
        link: req.body.link,
        shippingFee: req.body.shippingFee,
        price: req.body.price ? req.body.price : 0,
        isActive: req.body.isActive ? req.body.isActive : true,
      };
      if (!req.body.client.id) {
        logger.warn(`Client id is not found ${req.body.client.id}`)
        const dbClient = await Client.create(req.body.client, { transaction: t })
        order.clientId = dbClient['id']
      }
      // ****************** ENABLE BELOW CODE TO STORE SENDER AND SENDER ABOVE ******************
      // if (!req.body.sender.id) {
      //   logger.warn(`Create sender ${JSON.stringify(req.body.sender)}`)
      //   const dbSender = await Client.create(req.body.sender, { transaction: t })
      //   order.senderId = dbSender['id']
      // }
      const dbOrder = await Order.create(order, { transaction: t })
      return { dbOrder }
    })
    return res.status(201).send(result)
  } catch (error) {
    logger.error(`Cannot create order with error ${error}`)
    res.status(500).send(`Cannot create order with error ${error}`)
  }
};

exports.findAll = (req, res) => {
  Order.findAll({ include: ['client', 'location', 'user', 'histories', 'sender','endLocation'] })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving orders."
      });
    });
};
exports.findAllByDate = (req, res) => {
  const date = JSON.parse(req.query.date);
  Order.findAll({
    include: ['client', 'location', 'user', 'histories', 'sender','endLocation'], where: {
      bookingDate: {
        [Op.between]: [date.startDate, date.endDate]
      },
    }
  })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      logger.error(`Cannot find orders by date with error ${err}`)
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving orders."
      });
    });
};

exports.findOne = (req, res) => {
  const id = req.params.id;

  Order.findByPk(id, { include: ['client', 'location', 'user', 'histories', 'sender','endLocation'] })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message: "Error retrieving Order with id=" + id
      });
    });
};

exports.update = async (req, res) => {
  const id = req.params.id;
  // Create a Client
  const client = req.body.client;
  // const sender = req.body.sender;
  let order = req.body
  //******** We dont get senderId and clientId from request [Need to assign manualy]********* */
  // order.senderId = sender.id
  order.clientId = client.id
  //******** We dont get senderId and clientId from request [Need to assign manualy]********* */
  await keeHistoricalData(id);
  if (!client.id) {
    try {
      const dbClient = await Client.create(customer)
      order.clientId = dbClient['id']
    } catch (error) {
      logger.error(`Cannot create client with error ${error}`)
    }
  }

// ****************** ENABLE BELOW CODE TO STORE SENDER AND SENDER ABOVE ******************
  // if (!sender.id) {
  //   try {
  //     const dbSender = await Client.create(sender)
  //     order.senderId = dbSender['id']
  //   } catch (error) {
  //     logger.error(`Cannot create client for sender  with error ${error}`)
  //   }
  // }

  Order.update(order, {
    where: { id: id }
  })
    .then(num => {
      if (num == 1) {
        res.send({
          message: "Order was updated successfully."
        });
      } else {
        res.send({
          message: `Cannot update Order with id=${id}. Maybe Order was not found or req.body is empty!`
        });
      }
    })
    .catch(err => {
      logger.error(`Cannot update order with error ${err}`)
      res.status(500).send({
        message: "Error updating Order with id=" + id
      });
    });
};

exports.updateStatus = async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  await keeHistoricalData(id)
  Order.update({ status }, {
    where: { id: id }
  })
    .then(num => {
      if (num == 1) {
        res.status(200).send({
          message: "Order was updated successfully."
        });
      } else {
        res.status(503).send({
          message: `Cannot update Order with id=${id}. Maybe Order was not found or req.body is empty!`
        });
      }
    })
    .catch(err => {
      logger.error(`Cannot update order with error ${err}`)
      res.status(500).send({
        message: "Error updating Order with id=" + id
      });
    });
};

const keeHistoricalData = async (id) => {
  try {
    // const selectedFields = ['id', 'bookingDate', 'name', 'note', 'trackingNumber', 'link', 'price', 'priceRate', 'shippingFee', 'shippingRate', 'status', 'isActive'];
    // const dbOrder = await Order.findByPk(id, { attributes: selectedFields, });
    const dbOrder = await Order.findByPk(id);
    if (!dbOrder) {
      logger.warning(`Cannot find order for historical data update`)
    }
    await orderHisService.createHIS(dbOrder.toJSON())
  } catch (error) {
    logger.error(`Cannot find order ${id} with error ${error}`)
  }
}
exports.delete = (req, res) => {
  const id = req.params.id;

  Order.destroy({
    where: { id: id }
  })
    .then(num => {
      if (num == 1) {
        res.send({
          message: "Order was deleted successfully!"
        });
      } else {
        res.send({
          message: `Cannot delete Order with id=${id}. Maybe Order was not found!`
        });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: "Could not delete Order with id=" + id
      });
    });
};

exports.deleteAll = (req, res) => {
  Order.destroy({
    where: {},
    truncate: false
  })
    .then(nums => {
      res.send({ message: `${nums} Orders were deleted successfully!` });
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while removing all orders."
      });
    });
};