
const User = require('../models').user;
const Terminal = require('../models').terminal;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');

const createCustomer = async (req, res) => {
  try {
    const { cus_id, cus_pass, cus_name, cus_tel, cus_email, cus_active, village, district, province,terminals,groupId } = req.body;
    const customer = await User.create({ cus_id, cus_pass, cus_name, cus_tel, cus_email, cus_active, village, district, province,groupId });
    await setTerminals(customer['id'],terminals,res)
    // res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getCustomers = async (req, res) => {
  try {
    const customers = await User.findAll({
      include: [{
        model: Terminal,
        through: { attributes: [] }
      }]
    });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCustomerById = async (req, res) => {
  const { id } = req.params;
  try {
    const customer = await User.findByPk(id, {
      include: [{
        model: Terminal,
        through: { attributes: [] }
      }]
    });
    if (!customer) {
      return res.status(501).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error });
  }
};
const setTerminals = async (userId, terminalList,res) => {
  // const terminal = await Terminal.findByPk(terminalId)
  // if (!terminal) {
  //   return res.status(501).json({ message: 'Terminal not found' });
  // }
  try {
    const customer = await User.findByPk(userId, {
      include: [{
        model: Terminal,
        through: { attributes: [] }
      }]
    });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    for (const iterator of terminalList) {
      logger.warn(`TERMINAL ${iterator['id']} ${iterator['name']}`)
    }
    const terminals = await Terminal.findAll({
      where: {
        id: {
          [Op.in]: terminalList.map(el => el.id)
        }
      }
    });
    await customer.setTerminals(terminals);
    res.status(200).json(customer);
  } catch (error) {
    logger.error(`ERROR update terminal list ${error}`)
    res.status(500).json({ message: error });
  }
};

const linkTerminal = async (req, res) => {
  const { id } = req.params;
  const { terminalId } = req.body
  const terminal = await Terminal.findByPk(terminalId)
  if (!terminal) {
    return res.status(501).json({ message: 'Terminal not found' });
  }
  try {
    const customer = await User.findByPk(id, {
      include: [{
        model: Terminal,
        through: { attributes: [] }
      }]
    });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    await customer.addTerminal(terminal)
    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: error });
  }
};
const unlinkTerminal = async (req, res) => {
  const { id } = req.params;
  const { terminalId } = req.body
  const terminal = await Terminal.findByPk(terminalId)
  if (!terminal) {
    return res.status(501).json({ message: 'Terminal not found' });
  }
  try {
    const customer = await User.findByPk(id, {
      include: [{
        model: Terminal,
        through: { attributes: [] }
      }]
    });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    await customer.removeTerminal(terminal)
    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: error });
  }
};

const updateCustomer = async (req, res) => {
  const { id } = req.params;
  try {
    const { cus_id, cus_pass, cus_name, cus_tel, cus_email, cus_active, village, district, province,terminals,groupId } = req.body;
    const customer = await User.findByPk(id);
    logger.warn(`TERMINAL LEN ${terminals.length} `)
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    customer.cus_id = cus_id;
    customer.cus_pass = cus_pass;
    customer.cus_name = cus_name;
    customer.cus_tel = cus_tel;
    customer.cus_email = cus_email;
    customer.cus_active = cus_active;
    customer.village = village;
    customer.district = district;
    customer.province = province;
    customer.groupId = groupId;
    await customer.save();
    await setTerminals(customer['id'],terminals,res)
    // res.json(customer);
  } catch (error) {
    logger.error(`SAVE USER ERROR ${error}`)
    res.status(500).json({ message: error.message });
  }
};

const deleteCustomer = async (req, res) => {
  const { id } = req.params;
  try {
    const customer = await User.findByPk(id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    await User.destroy();
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createCustomer,
  getCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomerById,
  linkTerminal,
  unlinkTerminal
};
