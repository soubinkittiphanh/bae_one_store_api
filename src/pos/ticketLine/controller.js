
const TicketLine = require('../../models').ticketLine;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');



const ticketLineController = {
    // Create a new ticket line
    async createTicketLine(req, res) {
        try {
            const { remark, qty, amount, total, isActive, status } = req.body;
            const newTicketLine = await TicketLine.create({
                remark,
                qty,
                amount,
                total,
                isActive,
                status,
            });
            return res.status(201).json({ message: 'Ticket Line created successfully', ticketLine: newTicketLine });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    },

    // Get all ticket lines
    async getAllTicketLines(req, res) {
        try {
            const ticketLines = await TicketLine.findAll();
            return res.status(200).json(ticketLines);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Get a ticket line by ID
    async getTicketLineById(req, res) {
        try {
            const { id } = req.params;
            const ticketLine = await TicketLine.findByPk(id);

            if (!ticketLine) {
                return res.status(404).json({ message: 'Ticket Line not found' });
            }

            return res.status(200).json(ticketLine);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Update a ticket line by ID
    async updateTicketLine(req, res) {
        try {
            const { id } = req.params;
            const { remark, qty, amount, total, isActive, status } = req.body;

            const ticketLine = await TicketLine.findByPk(id);
            if (!ticketLine) {
                return res.status(404).json({ message: 'Ticket Line not found' });
            }

            await ticketLine.update({
                remark,
                qty,
                amount,
                total,
                isActive,
                status,
            });
            return res.status(200).json({ message: 'Ticket Line updated successfully', ticketLine });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    },

    // Delete a ticket line by ID
    async deleteTicketLine(req, res) {
        try {
            const { id } = req.params;

            const ticketLine = await TicketLine.findByPk(id);
            if (!ticketLine) {
                return res.status(404).json({ message: 'Ticket Line not found' });
            }

            await ticketLine.destroy();
            return res.status(200).json({ message: 'Ticket Line deleted successfully' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
};

module.exports = ticketLineController;
