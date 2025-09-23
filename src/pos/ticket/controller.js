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
const Product = require('../../models').product;
// Add these for sale integration
const SaleHeader = require('../../models').saleHeader;
const SaleLine = require('../../models').saleLine;

// Service function to convert ticket to sale
const postTicketToSale = async (ticketId, transaction = null) => {
    try {
        // Get the ticket with all ticket lines
        const ticket = await Ticket.findByPk(ticketId, {
            include: [
                {
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        {
                            model: Product,
                            as: 'product'
                        }
                    ]
                },
                {
                    model: Client,
                    as: 'client'
                }
            ],
            transaction
        });

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        if (ticket.status !== 'paid' || ticket.paymentStatus !== 'paid') {
            throw new Error('Ticket must be paid to post to sales');
        }

        // Check if this ticket has already been posted to sales
        const existingSale = await SaleHeader.findOne({
            where: { ticketId: ticketId },
            transaction
        });

        if (existingSale) {
            throw new Error('Ticket has already been posted to sales');
        }

        // Create sale header
        const saleHeaderData = {
            ticketId: ticket.id,
            paymentId: ticket.paymentId,
            bookingDate: new Date().toISOString().split('T')[0], // Today's date
            referenceNo: `TKT-${ticket.id}-${Date.now()}`, // Generate reference number
            remark: ticket.notes || `Sale from Ticket #${ticket.id}`,
            discount: 0, // You can calculate this if needed
            total: parseFloat(ticket.total),
            exchangeRate: 1, // Default exchange rate
            isActive: true
        };

        const saleHeader = await SaleHeader.create(saleHeaderData, { transaction });

        // Create sale lines from ticket lines
        const saleLines = [];
        logger.info(`ticket ${JSON.stringify(ticket)}`)
        logger.info(`Sale line from ticketLine ${ticket.ticketLines}`)
        for (const ticketLine of ticket.ticketLines) {
            const saleLineData = {
                saleHeaderId: saleHeader.id,
                productId: ticketLine.productId,
                quantity: parseFloat(ticketLine.quantity),
                unitRate: parseFloat(ticketLine.unitPrice),
                price: parseFloat(ticketLine.unitPrice),
                discount: 0, // You can calculate this if needed
                total: parseFloat(ticketLine.totalPrice),
                isActive: true
            };

            const saleLine = await SaleLine.create(saleLineData, { transaction });
            saleLines.push(saleLine);
        }

        return {
            saleHeader,
            saleLines,
            originalTicket: ticket
        };

    } catch (error) {
        throw new Error(`Failed to post ticket to sale: ${error.message}`);
    }
};

const ticketController = {

    // Fixed getAllTickets method
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
                limit = 20, // Changed to match frontend default
                include, // Handle include as sent from frontend
                sort = 'createdAt:desc' // Handle sort parameter
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

            // Build include array based on frontend request
            const includeArray = [];

            // Parse include parameter (can be string or array)
            let includeParams = [];
            if (include) {
                if (typeof include === 'string') {
                    includeParams = include.split(',');
                } else if (Array.isArray(include)) {
                    includeParams = include;
                }
            }

            // Always include basic associations or based on include parameter
            if (includeParams.length === 0 || includeParams.includes('client')) {
                includeArray.push({
                    model: Client,
                    as: 'client',
                    // attributes: ['id', 'name', 'email', 'phone'],
                    required: false
                });
            }

            if (includeParams.length === 0 || includeParams.includes('table')) {
                includeArray.push({
                    model: Table,
                    as: 'table',
                    attributes: ['id', 'name', 'number', 'capacity'],
                    required: false
                });
            }

            if (includeParams.length === 0 || includeParams.includes('payment')) {
                includeArray.push({
                    model: Payment,
                    as: 'payment',
                    // attributes: ['id', 'method', 'amount', 'status', 'transactionId'],
                    required: false
                });
            }

            if (includeParams.includes('ticketLines')) {
                includeArray.push({
                    model: TicketLine,
                    as: 'ticketLines',
                    // attributes: ['id', 'quantity', 'unitPrice', 'total', 'notes', 'productId'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            // attributes: ['id', 'name', 'price'],
                            required: false
                        }
                    ],
                    required: false
                });
            }

            // Handle sort parameter
            let orderArray = [['createdAt', 'DESC']]; // default
            if (sort) {
                const [sortField, sortDirection] = sort.split(':');
                if (sortField && sortDirection) {
                    orderArray = [[sortField, sortDirection.toUpperCase()]];
                }
            }

            const tickets = await Ticket.findAndCountAll({
                where: whereCondition,
                include: includeArray,
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: orderArray,
                distinct: true // Important when using includes to get correct count
            });

            // Format response to match frontend expectations
            res.status(200).json({
                success: true,
                tickets: tickets.rows, // Frontend expects 'tickets' property
                totalPages: Math.ceil(tickets.count / limit),
                currentPage: parseInt(page),
                totalItems: tickets.count,
                limit: parseInt(limit),
                // Alternative format that also works
                data: tickets.rows,
                pagination: {
                    total: tickets.count,
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(tickets.count / limit),
                    limit: parseInt(limit)
                }
            });

        } catch (error) {
            console.error('Error fetching tickets:', error); // Add logging
            res.status(500).json({
                success: false,
                message: 'Error fetching tickets',
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
                            { model: Product, as: 'product', attributes: ['id', 'pro_name', 'pro_price'] }
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
            logger.error(`cannot fetch ticket with error ${error}`)
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
                    totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2)
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
                    totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2)
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

    // Update payment status - UPDATED WITH SALE INTEGRATION
    updatePaymentStatus: async (req, res) => {
        // Use database transaction for data consistency
        const t = await sequelize.transaction();
        
        try {
            const { id } = req.params;
            const { paymentStatus, paymentId } = req.body;

            if (!paymentStatus) {
                await t.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Payment status is required'
                });
            }

            const validPaymentStatuses = ['pending', 'paid', 'refunded'];
            if (!validPaymentStatuses.includes(paymentStatus)) {
                await t.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment status'
                });
            }

            const ticket = await Ticket.findByPk(id, { transaction: t });
            if (!ticket) {
                await t.rollback();
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

            // Update the ticket
            await ticket.update(updateData, { transaction: t });

            let saleData = null;

            // If status is paid, post to sale tables
            if (paymentStatus === 'paid') {
                try {
                    saleData = await postTicketToSale(id, t);
                    console.log(`Ticket ${id} successfully posted to sales`);
                } catch (saleError) {
                    // If it's already posted, that's okay, just log it
                    logger.error(`POST TO Sale incompleted. with error ${saleError}`)
                    if (saleError.message.includes('already been posted')) {
                        console.log(`Ticket ${id} has already been posted to sales`);
                    } else {
                        // For other errors, rollback the transaction
                        await t.rollback();
                        return res.status(500).json({
                            success: false,
                            message: 'Error posting to sales',
                            error: saleError.message
                        });
                    }
                }
            }

            // Commit the transaction
            await t.commit();

            res.status(200).json({
                success: true,
                message: paymentStatus === 'paid' 
                    ? 'Payment status updated and posted to sales successfully' 
                    : 'Payment status updated successfully',
                data: {
                    ticket,
                    sale: saleData
                }
            });

        } catch (error) {
            await t.rollback();
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
    },

    // NEW METHODS FOR SALE INTEGRATION

    // Utility function to manually post a ticket to sales (if needed)
    manualPostTicketToSale: async (req, res) => {
        const t = await sequelize.transaction();
        
        try {
            const { ticketId } = req.params;
            
            const saleData = await postTicketToSale(ticketId, t);
            
            await t.commit();
            
            res.status(200).json({
                success: true,
                message: 'Ticket posted to sales successfully',
                data: saleData
            });
            
        } catch (error) {
            await t.rollback();
            res.status(500).json({
                success: false,
                message: 'Error posting ticket to sales',
                error: error.message
            });
        }
    },

    // Function to get sale data by ticket ID
    getSaleByTicketId: async (req, res) => {
        try {
            const { ticketId } = req.params;
            
            const saleHeader = await SaleHeader.findOne({
                where: { ticketId },
                include: [
                    {
                        model: SaleLine,
                        as: 'saleLines',
                        include: [
                            {
                                model: Product,
                                as: 'product'
                            }
                        ]
                    }
                ]
            });
            
            if (!saleHeader) {
                return res.status(404).json({
                    success: false,
                    message: 'Sale not found for this ticket'
                });
            }
            
            res.status(200).json({
                success: true,
                data: saleHeader
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error retrieving sale data',
                error: error.message
            });
        }
    }
};

module.exports = ticketController;