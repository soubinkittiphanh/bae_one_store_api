
const logger = require('../api/logger');
const { Op } = require('sequelize');
const  WebHeaderMenu  = require('../models').webMenuHeader; // Adjust the path as necessary

const WebHeaderMenuController = {
    // Create a new menu item
    async create(req, res) {
        try {
            const { name, g_name, order_level, remark, isActive } = req.body;
            const newMenuItem = await WebHeaderMenu.create({ 
                name, 
                g_name, 
                order_level, 
                remark, 
                isActive 
            });
            res.status(201).send(newMenuItem);
        } catch (error) {
            res.status(400).send(error);
        }
    },

    // Retrieve all menu items
    async findAll(req, res) {
        try {
            const menuItems = await WebHeaderMenu.findAll();
            res.status(200).send(menuItems);
        } catch (error) {
            res.status(500).send(error);
        }
    },

    // Retrieve a single menu item by id
    async findOne(req, res) {
        try {
            const { id } = req.params;
            const menuItem = await WebHeaderMenu.findByPk(id);
            if (menuItem) {
                res.status(200).send(menuItem);
            } else {
                res.status(404).send({ message: 'Menu Item not found.' });
            }
        } catch (error) {
            res.status(500).send(error);
        }
    },

    // Update a menu item by id
    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, g_name, order_level, remark, isActive } = req.body;
            const [updated] = await WebHeaderMenu.update({ 
                name, 
                g_name, 
                order_level, 
                remark, 
                isActive 
            }, {
                where: { id }
            });
            if (updated) {
                const updatedMenuItem = await WebHeaderMenu.findByPk(id);
                res.status(200).send(updatedMenuItem);
            } else {
                res.status(404).send({ message: 'Menu Item not found.' });
            }
        } catch (error) {
            res.status(500).send(error);
        }
    },

    // Delete a menu item by id
    async delete(req, res) {
        try {
            const { id } = req.params;
            const deleted = await WebHeaderMenu.destroy({
                where: { id }
            });
            if (deleted) {
                res.status(204).send({ message: 'Menu Item deleted.' });
            } else {
                res.status(404).send({ message: 'Menu Item not found.' });
            }
        } catch (error) {
            res.status(500).send(error);
        }
    }
};

module.exports = WebHeaderMenuController;
