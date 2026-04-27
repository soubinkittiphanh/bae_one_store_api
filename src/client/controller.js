
const Client = require('../models').client;
const loyaltyService = require('../loyalty/service');
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');

// Create and Save a new Client
exports.create = async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }


  // Create a Client
  const clientData = {
    name: req.body.name,
    company: req.body.company,
    address: req.body.address,
    telephone: req.body.telephone,
    credit: req.body.credit,
    lateChargePercent: req.body.lateChargePercent,
    grade: req.body.grade,
    class: req.body.class,
    DOB: req.body.DOB,
    email: req.body.email,
    isActive: req.body.isActive !== undefined ? req.body.isActive : true
  };

  try {
    // Save Client in the database
    const data = await Client.create(clientData, {
      context: { 
        userId: req.user?.id || 1, 
        reason: req.body.reason || 'Client created via API' 
      }
    });
    res.status(201).send(data);
  } catch (err) {
    logger.error(`Error creating client: ${err}`);
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Client."
    });
  }
};

// Retrieve all Clients from the database.
exports.findAll = (req, res) => {

  Client.findAll()
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving clients."
      });
    });
};

// Find a single Client with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  Client.findByPk(id)
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message: "Error retrieving Client with id=" + id
      });
    });
};

// Update a Client by the id in the request
exports.update = async (req, res) => {
  const id = req.params.id;

  try {
    const client = await Client.findByPk(id);
    if (!client) {
      return res.status(404).send({
        message: `Cannot update Client with id=${id}. Client not found!`
      });
    }

    await client.update(req.body, {
      context: { 
        userId: req.user?.id || 1, 
        reason: req.body.reason || 'Client updated via API' 
      }
    });

    res.send({
      message: "Client was updated successfully."
    });
  } catch (err) {
    logger.error(`Error updating client: ${err}`);
    res.status(500).send({
      message: "Error updating Client with id=" + id
    });
  }
};

// Delete a Client with the specified id in the request
exports.delete = async (req, res) => {
  const id = req.params.id;

  try {
    const client = await Client.findByPk(id);
    if (!client) {
      return res.status(404).send({
        message: `Cannot delete Client with id=${id}. Client not found!`
      });
    }

    await client.destroy({
      context: { 
        userId: req.user?.id || 1, 
        reason: req.body.reason || 'Client deleted via API' 
      }
    });

    res.send({
      message: "Client was deleted successfully!"
    });
  } catch (err) {
    logger.error(`Error deleting client: ${err}`);
    res.status(500).send({
      message: "Could not delete Client with id=" + id
    });
  }
};
// Find all active Clients
exports.findAllActive = async (req, res) => {
    try {
        const data = await Client.findAll({
            where: {
                isActive: true  // Simple boolean comparison is fine
            }
        });
        res.send(data);
    } catch (error) {
        logger.error(`Cannot select client with error ${error}`); // Fixed syntax
        res.status(500).send({
            message: error.message || "Some error occurred while retrieving clients."  // Changed err to error
        });
    }
};

exports.findAllWithCreditPayment = async (req, res) => {
  // { include: ['lines', 'user'], }
  const clients = await Client.findAll({ include: ['header'] })
  return res.send(clients)
}

exports.findAudit = async (req, res) => {
  const clientId = req.params.id;
  try {
    const AuditModel = require('../models').clientAudit;
    const User = require('../models').user;

    const auditTrail = await AuditModel.findAll({
      where: { clientId: clientId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', ['cus_name', 'name']]
        }
      ],
      order: [['auditDate', 'DESC']]
    });

    res.send(auditTrail);
  } catch (error) {
    logger.error(`Error retrieving client audit trail: ${error}`);
    res.status(500).send({
      message: "Error retrieving client audit trail for id=" + clientId
    });
  }
};

exports.findLoyaltyTransactions = async (req, res) => {
  const clientId = req.params.id;
  try {
    const transactions = await loyaltyService.getTransactionsByClient(clientId);
    res.send(transactions);
  } catch (error) {
    logger.error(`Error retrieving loyalty transactions: ${error}`);
    res.status(500).send({
      message: "Error retrieving loyalty transactions for client id=" + clientId
    });
  }
};
