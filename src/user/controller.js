const User = require('../models').user;
const Terminal = require('../models').terminal;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt'); // You may need to install this: npm install bcrypt

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

// NEW FUNCTION: Change Password
const changePassword = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { userId, currentPassword, newPassword } = req.body;

    logger.info(`Password change request for user ID: ${userId}`);

    // Find user by ID or cus_id
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { id: userId },
          { cus_id: userId }
        ]
      }
    });

    if (!user) {
      logger.warn(`User not found for ID: ${userId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check if current password is correct
    // Note: If your passwords are stored as plain text (which is not recommended),
    // use this simple comparison:
    if (user.cus_pass !== currentPassword) {
      logger.warn(`Invalid current password for user ID: ${userId}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    // If you want to use bcrypt for password hashing (recommended):
    // const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.cus_pass);
    // if (!isCurrentPasswordValid) {
    //   logger.warn(`Invalid current password for user ID: ${userId}`);
    //   return res.status(401).json({ 
    //     success: false, 
    //     message: 'Current password is incorrect' 
    //   });
    // }

    // Validate new password requirements
    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 4 characters long'
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Update password
    // For plain text storage (current approach):
    user.cus_pass = newPassword;

    // For bcrypt hashing (recommended):
    // const saltRounds = 10;
    // user.cus_pass = await bcrypt.hash(newPassword, saltRounds);

    user.updateTimestamp = new Date();
    await user.save();

    logger.info(`Password successfully changed for user ID: ${userId}`);

    res.status(200).json({ 
      success: true, 
      message: 'Password changed successfully' 
    });

  } catch (error) {
    logger.error(`Error changing password: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error while changing password' 
    });
  }
};

// NEW FUNCTION: Reset Password (Admin function)
const resetPassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    logger.info(`Password reset request for user ID: ${userId}`);

    // Find user by ID or cus_id
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { id: userId },
          { cus_id: userId }
        ]
      }
    });

    if (!user) {
      logger.warn(`User not found for reset, ID: ${userId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Validate new password
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 4 characters long'
      });
    }

    // Update password
    // For plain text storage (current approach):
    user.cus_pass = newPassword;

    // For bcrypt hashing (recommended):
    // const saltRounds = 10;
    // user.cus_pass = await bcrypt.hash(newPassword, saltRounds);

    user.updateTimestamp = new Date();
    await user.save();

    logger.info(`Password successfully reset for user ID: ${userId}`);

    res.status(200).json({ 
      success: true, 
      message: 'Password reset successfully',
      newPassword: newPassword // Consider removing this in production for security
    });

  } catch (error) {
    logger.error(`Error resetting password: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error while resetting password' 
    });
  }
};

// Validation middleware for change password
const validateChangePassword = [
  body('userId')
    .notEmpty()
    .withMessage('User ID is required'),
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 4 })
    .withMessage('New password must be at least 4 characters long')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    })
];

// Validation middleware for reset password
const validateResetPassword = [
  body('userId')
    .notEmpty()
    .withMessage('User ID is required'),
  body('newPassword')
    .isLength({ min: 4 })
    .withMessage('New password must be at least 4 characters long')
];

module.exports = {
  createCustomer,
  getCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomerById,
  linkTerminal,
  unlinkTerminal,
  changePassword,
  resetPassword,
  validateChangePassword,
  validateResetPassword
};