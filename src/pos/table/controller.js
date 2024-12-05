
const Table = require('../../models').table;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');
const tableController = {
    // Create a new table
    async createTable(req, res) {
        try {
            const { mnemonic, name, isActive, status } = req.body;
            const newTable = await Table.create({ mnemonic, name, isActive, status });
            return res.status(201).json({ message: 'Table created successfully', table: newTable });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    },

    // Get all tables
    async getAllTables(req, res) {
        try {
            const tables = await Table.findAll();
            return res.status(200).json(tables);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Get a table by ID
    async getTableById(req, res) {
        try {
            const { id } = req.params;
            const table = await Table.findByPk(id);

            if (!table) {
                return res.status(404).json({ message: 'Table not found' });
            }

            return res.status(200).json(table);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Update a table by ID
    async updateTable(req, res) {
        try {
            const { id } = req.params;
            const { mnemonic, name, isActive, status } = req.body;

            const table = await Table.findByPk(id);
            if (!table) {
                return res.status(404).json({ message: 'Table not found' });
            }

            await table.update({ mnemonic, name, isActive, status });
            return res.status(200).json({ message: 'Table updated successfully', table });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    },

    // Delete a table by ID
    async deleteTable(req, res) {
        try {
            const { id } = req.params;

            const table = await Table.findByPk(id);
            if (!table) {
                return res.status(404).json({ message: 'Table not found' });
            }

            await table.destroy();
            return res.status(200).json({ message: 'Table deleted successfully' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
};

module.exports = tableController;

