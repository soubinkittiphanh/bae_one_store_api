
const Ticket = require('../../models').ticket;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');

const ticketController = {
  // Create a new ticket
  async createTicket(req, res) {
      try {
          const { remark, isActive, status, openedAt, closedAt } = req.body;
          const newTicket = await Ticket.create({ remark, isActive, status, openedAt, closedAt });
          return res.status(201).json({ message: 'Ticket created successfully', ticket: newTicket });
      } catch (error) {
          return res.status(400).json({ error: error.message });
      }
  },

  // Get all tickets
  async getAllTickets(req, res) {
      try {
          const tickets = await Ticket.findAll();
          return res.status(200).json(tickets);
      } catch (error) {
          return res.status(500).json({ error: error.message });
      }
  },

  // Get a ticket by ID
  async getTicketById(req, res) {
      try {
          const { id } = req.params;
          const ticket = await Ticket.findByPk(id);

          if (!ticket) {
              return res.status(404).json({ message: 'Ticket not found' });
          }

          return res.status(200).json(ticket);
      } catch (error) {
          return res.status(500).json({ error: error.message });
      }
  },

  // Update a ticket by ID
  async updateTicket(req, res) {
      try {
          const { id } = req.params;
          const { remark, isActive, status, openedAt, closedAt } = req.body;

          const ticket = await Ticket.findByPk(id);
          if (!ticket) {
              return res.status(404).json({ message: 'Ticket not found' });
          }

          await ticket.update({ remark, isActive, status, openedAt, closedAt });
          return res.status(200).json({ message: 'Ticket updated successfully', ticket });
      } catch (error) {
          return res.status(400).json({ error: error.message });
      }
  },

  // Close a ticket (specific use case)
  async closeTicket(req, res) {
      try {
          const { id } = req.params;

          const ticket = await Ticket.findByPk(id);
          if (!ticket) {
              return res.status(404).json({ message: 'Ticket not found' });
          }

          await ticket.update({ status: 'closed', closedAt: new Date() });
          return res.status(200).json({ message: 'Ticket closed successfully', ticket });
      } catch (error) {
          return res.status(400).json({ error: error.message });
      }
  },

  // Delete a ticket by ID
  async deleteTicket(req, res) {
      try {
          const { id } = req.params;

          const ticket = await Ticket.findByPk(id);
          if (!ticket) {
              return res.status(404).json({ message: 'Ticket not found' });
          }

          await ticket.destroy();
          return res.status(200).json({ message: 'Ticket deleted successfully' });
      } catch (error) {
          return res.status(500).json({ error: error.message });
      }
  }
};

module.exports = ticketController;