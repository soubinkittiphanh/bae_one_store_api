const logger = require('../api/logger');
const dbAsync = require('../config/dbconAsync');
const Customer = require('../models').customer

const createCustomer = async (customer) => {
    try {
        const newCustomer = await Customer.create(customer);
        res.status(201).json(newCustomer);
    } catch (error) {
        logger.error(`Cannot create dynamic customer due to ${error}`)
        throw new Error(error)
    }

}

module.exports = {
    createCustomer,
}