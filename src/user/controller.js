
const User = require('../models').user;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');

const createCustomer = async (req, res) => {
  try {
    const { cus_id, cus_pass, cus_name, cus_tel, cus_email, cus_active, login_id, user_id, village, district, province } = req.body;
    const customer = await User.create({ cus_id, cus_pass, cus_name, cus_tel, cus_email, cus_active, login_id, user_id, village, district, province });
    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getCustomers = async (req, res) => {
  try {
    const customers = await User.findAll();
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCustomerById = async (req, res) => {
  const { id } = req.params;
  try {
    const customer = await User.findByPk(id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error });
  }
};

const updateCustomer = async (req, res) => {
  const { id } = req.params;
  try {
    const { cus_id, cus_pass, _name, cus_tel, cus_email, cus, login_id, user_id, village, district, province } = req.body;
    const customer = await User.findByPk(id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    User.cus_id = cus_id;
    User.cus_pass = cus_pass;
    User.cus_name = cus_name;
    User.cus_tel = cus_tel;
    User.cus_email = cus_email;
    User.cus_active = cus_active;
    User.login_id = login_id;
    User.user_id = user_id;
    User.village = village;
    User.district = district;
    User.province = province;
    await User.save();
    res.json(customer);
  } catch (error) {
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
  getCustomer,
  updateCustomer,
  deleteCustomer
};
