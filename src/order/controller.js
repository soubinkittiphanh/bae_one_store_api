const logger = require('../api/logger');
const { client, order } = require('../models');
const Order = require('../models').order;
const Client = require('../models').client;
const { sequelize } = require('../models');
const { Op, where, literal } = require('sequelize');

exports.create = async (req, res) => {
  // Validate request
  if (!req.body.name || !req.body.note) {
    res.status(400).send({
      message: "Name and note cannot be empty!"
    });
    return;
  }
  try {
    const result = await sequelize.transaction(async (t) => {
      // Create a Client
      const customer = req.body.client;
      let client = null
      let dbOrder = null
      // Create a Order
      let order = {
        clientId: customer.id,
        currencyId:req.body.currencyId,
        priceRate:req.body.priceRate,
        shippingFeeCurrencyId:req.body.shippingFeeCurrencyId,
        shippingRate:req.body.shippingRate,
        status: req.body.status,
        bookingDate: req.body.bookingDate,
        name: req.body.name,
        note: req.body.note,
        trackingNumber: req.body.trackingNumber,
        link: req.body.link,
        shippingFee: req.body.shippingFee,
        price: req.body.price ? req.body.price : 0,
        isActive: req.body.isActive ? req.body.isActive : true,
      };
      if (!customer.id) {
        try {
          client = await Client.create(customer, { transaction: t })
          order.clientId = client['id']
        } catch (error) {
          logger.error(`Cannot create client with error ${error}`)
        }
      }
      try {
        dbOrder = await Order.create(order, { transaction: t })
      } catch (error) {
        logger.error(`Cannot create order with error ${error}`)
      }
      return { dbOrder, client }
    })
    return res.status(201).send(result)
  } catch (error) {
    logger.error(`Cannot create order with error ${error}`)
    res.status(500).send(`Cannot create order with error ${error}`)
  }
};

exports.findAll = (req, res) => {

  Order.findAll({ include: ['client','location','user'] })
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
    include: ['client','location','user'], where: {
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

  Order.findByPk(id, { include: ['client','location','user'] })
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
  const customer = req.body.client;
  let client = customer
  if (!customer.id) {
    try {
      client = await Client.create(customer)
      order.clientId = client['id']
    } catch (error) {
      logger.error(`Cannot create client with error ${error}`)
    }
  }
  Order.update({ ...req.body, clientId: client['id'] }, {
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
  const {status} = req.body;

  Order.update({ status}, {
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