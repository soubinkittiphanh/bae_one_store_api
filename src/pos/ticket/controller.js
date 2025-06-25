
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');
// Option 2: Individual assignments (following your sample format)
const Ticket = require('../../models').ticket;
const TicketLine = require('../../models').ticketLine;
const Table = require('../../models').table;
const sequelize = require('../../models').sequelize;
const Payment = require('../../models').payment;
const Client = require('../../models').client;

const ticketController = {
    // Get all tickets with pagination and filtering
    getAllTickets: async (req, res) => {
        try {
            const {
                status,
                paymentStatus,
                tableId,
                clientId,
                startDate,
                endDate,
                page = 1,
                limit = 10,
                includeLines = false
            } = req.query;

            // Build where condition
            const whereCondition = {};

            if (status) whereCondition.status = status;
            if (paymentStatus) whereCondition.paymentStatus = paymentStatus;
            if (tableId) whereCondition.tableId = tableId;
            if (clientId) whereCondition.clientId = clientId;

            // Date range filter
            if (startDate || endDate) {
                whereCondition.createdAt = {};
                if (startDate) whereCondition.createdAt[Op.gte] = new Date(startDate);
                if (endDate) whereCondition.createdAt[Op.lte] = new Date(endDate);
            }

            const offset = (page - 1) * limit;

            // Build include array
            const includeArray = [
                { model: Table, as: 'table', attributes: ['id', 'name', 'number'] },
                { model: Client, as: 'client', attributes: ['id', 'name', 'email', 'phone'] },
                { model: Payment, as: 'payment', attributes: ['id', 'method', 'amount', 'status'] }
            ];

            if (includeLines === 'true') {
                includeArray.push({
                    model: TicketLine,
                    as: 'ticketLines',
                    attributes: ['id', 'quantity', 'unitPrice', 'subtotal', 'productId']
                });
            }

            const tickets = await Ticket.findAndCountAll({
                where: whereCondition,
                include: includeArray,
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['createdAt', 'DESC']]
            });

            res.status(200).json({
                success: true,
                data: tickets.rows,
                pagination: {
                    total: tickets.count,
                    page: parseInt(page),
                    pages: Math.ceil(tickets.count / limit),
                    limit: parseInt(limit)
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching tickets',
                error: error.message
            });
        }
    },

    // Get ticket by ID with full details
    getTicketById: async (req, res) => {
        try {
            const { id } = req.params;

            const ticket = await Ticket.findByPk(id, {
                include: [
                    { model: Table, as: 'table' },
                    { model: Client, as: 'client' },
                    { model: Payment, as: 'payment' },
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            // Add product details if you have Product model
                            // { model: Product, as: 'product', attributes: ['id', 'name', 'price'] }
                        ]
                    }
                ]
            });

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            res.status(200).json({
                success: true,
                data: ticket
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching ticket',
                error: error.message
            });
        }
    },

    // Create new ticket
    createTicket: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const {
                tableId,
                clientId,
                paymentId,
                status = 'pending',
                paymentStatus = 'pending',
                notes,
                ticketLines = []
            } = req.body;

            // Validation
            if (!tableId) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Table ID is required'
                });
            }

            // Check if table exists and is available
            const table = await Table.findByPk(tableId);
            if (!table) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Table not found'
                });
            }

            // Calculate totals from ticket lines
            let subtotal = 0;
            let tax = 0;
            let total = 0;

            if (ticketLines.length > 0) {
                subtotal = ticketLines.reduce((sum, line) => {
                    return sum + (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0));
                }, 0);

                // Calculate tax (assuming 10% tax rate, adjust as needed)
                tax = subtotal * 0.10;
                total = subtotal + tax;
            }

            // Create the ticket
            const newTicket = await Ticket.create({
                tableId,
                clientId,
                paymentId,
                status,
                paymentStatus,
                subtotal: subtotal.toFixed(2),
                tax: tax.toFixed(2),
                total: total.toFixed(2),
                notes
            }, { transaction });

            // Create ticket lines if provided
            if (ticketLines.length > 0) {
                const ticketLinesData = ticketLines.map(line => ({
                    ...line,
                    ticketId: newTicket.id,
                    subtotal: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2)
                }));

                await TicketLine.bulkCreate(ticketLinesData, { transaction });
            }

            // Update table status to occupied if ticket is created
            if (status !== 'paid' && status !== 'served') {
                await table.update({
                    status: 'occupied',
                    currentOrderId: newTicket.id,
                    timeOccupied: new Date()
                }, { transaction });
            }

            await transaction.commit();

            // Fetch the complete ticket with associations
            const createdTicket = await Ticket.findByPk(newTicket.id, {
                include: [
                    { model: Table, as: 'table' },
                    { model: Client, as: 'client' },
                    { model: TicketLine, as: 'ticketLines' }
                ]
            });

            res.status(201).json({
                success: true,
                message: 'Ticket created successfully',
                data: createdTicket
            });
        } catch (error) {
            await transaction.rollback();

            if (error.name === 'SequelizeValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    errors: error.errors.map(err => ({
                        field: err.path,
                        message: err.message
                    }))
                });
            }

            res.status(500).json({
                success: false,
                message: 'Error creating ticket',
                error: error.message
            });
        }
    },

    // Update ticket
    updateTicket: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const updateData = req.body;

            const ticket = await Ticket.findByPk(id, { transaction });

            if (!ticket) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            // If updating ticket lines, recalculate totals
            if (updateData.ticketLines) {
                const subtotal = updateData.ticketLines.reduce((sum, line) => {
                    return sum + (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0));
                }, 0);

                const tax = subtotal * 0.10; // Adjust tax rate as needed
                const total = subtotal + tax;

                updateData.subtotal = subtotal.toFixed(2);
                updateData.tax = tax.toFixed(2);
                updateData.total = total.toFixed(2);

                // Delete existing ticket lines and create new ones
                await TicketLine.destroy({
                    where: { ticketId: id },
                    transaction
                });

                const ticketLinesData = updateData.ticketLines.map(line => ({
                    ...line,
                    ticketId: id,
                    subtotal: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2)
                }));

                await TicketLine.bulkCreate(ticketLinesData, { transaction });
                delete updateData.ticketLines; // Remove from update data
            }

            await ticket.update(updateData, { transaction });

            await transaction.commit();

            // Fetch updated ticket with associations
            const updatedTicket = await Ticket.findByPk(id, {
                include: [
                    { model: Table, as: 'table' },
                    { model: Client, as: 'client' },
                    { model: TicketLine, as: 'ticketLines' }
                ]
            });

            res.status(200).json({
                success: true,
                message: 'Ticket updated successfully',
                data: updatedTicket
            });
        } catch (error) {
            await transaction.rollback();

            res.status(500).json({
                success: false,
                message: 'Error updating ticket',
                error: error.message
            });
        }
    },

    // Update ticket status
    updateTicketStatus: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!status) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Status is required'
                });
            }

            const validStatuses = ['pending', 'preparing', 'ready', 'served', 'paid'];
            if (!validStatuses.includes(status)) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
                });
            }

            const ticket = await Ticket.findByPk(id, {
                include: [{ model: Table, as: 'table' }],
                transaction
            });

            if (!ticket) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            await ticket.update({ status }, { transaction });

            // Update table status based on ticket status
            if (ticket.table) {
                let tableStatus = 'occupied';
                let currentOrderId = ticket.id;

                if (status === 'paid' || status === 'served') {
                    tableStatus = 'cleaning';
                    currentOrderId = null;
                }

                await ticket.table.update({
                    status: tableStatus,
                    currentOrderId: currentOrderId
                }, { transaction });
            }

            await transaction.commit();

            res.status(200).json({
                success: true,
                message: 'Ticket status updated successfully',
                data: ticket
            });
        } catch (error) {
            await transaction.rollback();

            res.status(500).json({
                success: false,
                message: 'Error updating ticket status',
                error: error.message
            });
        }
    },

    // Update payment status
    updatePaymentStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { paymentStatus, paymentId } = req.body;

            if (!paymentStatus) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment status is required'
                });
            }

            const validPaymentStatuses = ['pending', 'paid', 'refunded'];
            if (!validPaymentStatuses.includes(paymentStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment status'
                });
            }

            const ticket = await Ticket.findByPk(id);

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            const updateData = { paymentStatus };
            if (paymentId) updateData.paymentId = paymentId;

            // If payment is completed, update ticket status to paid
            if (paymentStatus === 'paid') {
                updateData.status = 'paid';
            }

            await ticket.update(updateData);

            res.status(200).json({
                success: true,
                message: 'Payment status updated successfully',
                data: ticket
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error updating payment status',
                error: error.message
            });
        }
    },

    // Delete ticket
    deleteTicket: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;

            const ticket = await Ticket.findByPk(id, {
                include: [{ model: Table, as: 'table' }],
                transaction
            });

            if (!ticket) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            // Check if ticket can be deleted (business rule)
            if (ticket.paymentStatus === 'paid' && ticket.status === 'served') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete completed and paid ticket'
                });
            }

            // Delete associated ticket lines first
            await TicketLine.destroy({
                where: { ticketId: id },
                transaction
            });

            // Update table status if needed
            if (ticket.table && ticket.table.currentOrderId === ticket.id) {
                await ticket.table.update({
                    status: 'available',
                    currentOrderId: null,
                    timeOccupied: null
                }, { transaction });
            }

            await ticket.destroy({ transaction });

            await transaction.commit();

            res.status(200).json({
                success: true,
                message: 'Ticket deleted successfully'
            });
        } catch (error) {
            await transaction.rollback();

            res.status(500).json({
                success: false,
                message: 'Error deleting ticket',
                error: error.message
            });
        }
    },

    // Get tickets by table
    getTicketsByTable: async (req, res) => {
        try {
            const { tableId } = req.params;
            const { status } = req.query;

            const whereCondition = { tableId };
            if (status) whereCondition.status = status;

            const tickets = await Ticket.findAll({
                where: whereCondition,
                include: [
                    { model: Client, as: 'client' },
                    { model: TicketLine, as: 'ticketLines' }
                ],
                order: [['createdAt', 'DESC']]
            });

            res.status(200).json({
                success: true,
                data: tickets,
                count: tickets.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching tickets by table',
                error: error.message
            });
        }
    },

    // Get pending tickets (for kitchen)
    getPendingTickets: async (req, res) => {
        try {
            const tickets = await Ticket.findAll({
                where: {
                    status: {
                        [Op.in]: ['pending', 'preparing']
                    }
                },
                include: [
                    { model: Table, as: 'table', attributes: ['id', 'name', 'number'] },
                    { model: TicketLine, as: 'ticketLines' }
                ],
                order: [['createdAt', 'ASC']]
            });

            res.status(200).json({
                success: true,
                data: tickets,
                count: tickets.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching pending tickets',
                error: error.message
            });
        }
    },

    // Get sales report
    getSalesReport: async (req, res) => {
        try {
            const { startDate, endDate, groupBy = 'day' } = req.query;

            let dateCondition = {};
            if (startDate || endDate) {
                dateCondition.createdAt = {};
                if (startDate) dateCondition.createdAt[Op.gte] = new Date(startDate);
                if (endDate) dateCondition.createdAt[Op.lte] = new Date(endDate);
            }

            const tickets = await Ticket.findAll({
                where: {
                    ...dateCondition,
                    paymentStatus: 'paid'
                },
                attributes: [
                    'id',
                    'total',
                    'subtotal',
                    'tax',
                    'createdAt'
                ]
            });

            const totalRevenue = tickets.reduce((sum, ticket) => sum + parseFloat(ticket.total), 0);
            const totalTax = tickets.reduce((sum, ticket) => sum + parseFloat(ticket.tax), 0);
            const totalSubtotal = tickets.reduce((sum, ticket) => sum + parseFloat(ticket.subtotal), 0);

            res.status(200).json({
                success: true,
                data: {
                    totalTickets: tickets.length,
                    totalRevenue: totalRevenue.toFixed(2),
                    totalSubtotal: totalSubtotal.toFixed(2),
                    totalTax: totalTax.toFixed(2),
                    averageTicketValue: tickets.length > 0 ? (totalRevenue / tickets.length).toFixed(2) : '0.00',
                    tickets: tickets
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error generating sales report',
                error: error.message
            });
        }
    },
    async getTicketsByTableAndStatus(req, res) {
        try {
            const { tableId } = req.params;
            const tickets = await Ticket.findAll({
                where: {
                    tableId: tableId,
                    status: 'pending' // or paymentStatus: 'pending'
                },
                include: ['ticketLines'] // Include related ticket lines if needed
            });
            res.json(tickets);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    // Then add this controller method
    async getCurrentTicketByTable(req, res) {
        try {
            const { tableId } = req.params;

            const currentTicket = await Ticket.findOne({
                where: {
                    tableId: tableId,
                    paymentStatus: 'pending' // or status: 'pending'
                },
                include: [{
                    model: TicketLine,
                    as: 'ticketLines'
                }],
                order: [['createdAt', 'DESC']] // Get the most recent
            });

            if (!currentTicket) {
                return res.status(404).json({ message: 'No current ticket found for this table' });
            }

            // Calculate item count
            const itemCount = currentTicket.ticketLines.reduce((sum, line) => sum + line.quantity, 0);

            res.json({
                ...currentTicket.toJSON(),
                itemCount
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = ticketController;