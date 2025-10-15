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

const Card = require('../../models').card;
const common = require('../../common');
const productService = require('../../product/service');


// Service function to convert ticket to sale// Helper function to post ticket to sale tables
const postTicketToSale = async (ticketId, transaction) => {
    try {
        // Get the ticket with all related data
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
                    model: Table,
                    as: 'table'
                }
            ],
            transaction
        });

        if (!ticket) {
            throw new Error('Ticket not found');
        }

        // Check if ticket has already been posted to sales
        const existingSale = await SaleHeader.findOne({
            where: { ticketId: ticketId },
            transaction
        });

        if (existingSale) {
            throw new Error('Ticket has already been posted to sales');
        }

        // Generate locking session for card reservation
        const lockingSessionId = common.generateLockingSessionId();
        const locationId = 1; // Get from ticket.table.locationId or config

        // Prepare lines for processing
        const lines = ticket.ticketLines.map(ticketLine => ({
            productId: ticketLine.productId,
            quantity: ticketLine.quantity,
            price: parseFloat(ticketLine.unitPrice),
            total: parseFloat(ticketLine.totalPrice),
            unitRate: 1, // Default unit rate
            specialInstructions: ticketLine.specialInstructions,
            product: ticketLine.product // Keep product reference
        }));

        logger.info(`Processing ${lines.length} items for ticket ${ticketId}`);

        // ============================================================
        // STEP 1: VALIDATE ALL STOCK REQUIREMENTS FIRST (CRITICAL!)
        // If ANY product requiring validation has insufficient stock,
        // the ENTIRE ticket will be rejected
        // ============================================================
        const stockValidationErrors = [];
        let productsRequiringValidation = 0;
        let productsNotRequiringValidation = 0;

        logger.info('=== STARTING STOCK VALIDATION ===');

        for (const line of lines) {
            // Check if product requires stock validation
            if (line.product.validateStockOnSale) {
                productsRequiringValidation++;
                const qty = line.unitRate * line.quantity;

                logger.info(`✓ Product ${line.productId} (${line.product.name}) REQUIRES stock validation - checking inventory...`);

                const availableCards = await Card.findAll({
                    limit: qty,
                    order: [['createdAt', 'DESC']],
                    where: {
                        productId: line.productId,
                        saleLineId: null,
                        card_isused: 0,
                        locationId
                    },
                    transaction
                });

                const availableQty = availableCards ? availableCards.length : 0;

                if (availableQty < qty) {
                    // Stock insufficient - add to error list
                    const error = {
                        productId: line.productId,
                        productName: line.product.name,
                        required: qty,
                        available: availableQty,
                        shortage: qty - availableQty
                    };
                    stockValidationErrors.push(error);
                    logger.error(`✗ INSUFFICIENT STOCK - Product ${line.productId} (${line.product.name}): Required ${qty}, Available ${availableQty}, Short by ${error.shortage}`);
                } else {
                    logger.info(`✓ SUFFICIENT STOCK - Product ${line.productId} (${line.product.name}): Required ${qty}, Available ${availableQty}`);
                }
            } else {
                productsNotRequiringValidation++;
                logger.info(`○ Product ${line.productId} (${line.product.name}) does NOT require stock validation - skipping check`);
            }
        }

        logger.info(`=== VALIDATION SUMMARY ===`);
        logger.info(`Products requiring validation: ${productsRequiringValidation}`);
        logger.info(`Products NOT requiring validation: ${productsNotRequiringValidation}`);
        logger.info(`Total products: ${lines.length}`);

        // If there are ANY stock validation errors, REJECT the entire ticket
        if (stockValidationErrors.length > 0) {
            logger.error(`=== STOCK VALIDATION FAILED ===`);
            logger.error(`${stockValidationErrors.length} product(s) have insufficient stock`);

            // Build detailed error message
            const errorDetails = stockValidationErrors.map(err =>
                `Product #${err.productId} (${err.productName}): Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
            ).join('; ');

            throw new Error(`Cannot post ticket to sale - Insufficient stock: ${errorDetails}`);
        }

        logger.info('=== STOCK VALIDATION PASSED ===');
        logger.info('All products have sufficient stock - proceeding with sale creation');

        // ============================================================
        // STEP 2: CREATE SALE HEADER (Only after validation passes)
        // ============================================================
        const saleHeaderData = {
            bookingDate: new Date(),
            referenceNo: `TICKET-${ticket.id}`,
            remark: ticket.notes || 'Posted from Ticket',
            discount: 0,
            total: parseFloat(ticket.total),
            exchangeRate: 1,
            isActive: true,
            clientId: ticket.clientId || null,
            paymentId: ticket.paymentId || null,
            currencyId: 1, // Set default or get from config
            userId: 1, // Set from req.user.id if available
            locationId: locationId,
            ticketId: ticket.id // Link back to ticket
        };

        const saleHeader = await SaleHeader.create(saleHeaderData, { transaction });
        logger.info(`✓ Sale header created with ID: ${saleHeader.id}`);

        // ============================================================
        // STEP 3: CREATE SALE LINES AND RESERVE CARDS
        // ============================================================
        const createdSaleLines = [];

        for (const line of lines) {
            line.headerId = saleHeader.id;
            line.saleHeaderId = saleHeader.id;

            // Only reserve cards if product requires stock validation
            if (line.product.validateStockOnSale) {
                const qty = line.unitRate * line.quantity;
                logger.info(`Reserving ${qty} cards for product ${line.productId} (${line.product.name})`);
                await reserveCardForTicket(line, lockingSessionId, qty, locationId, transaction);
            } else {
                logger.info(`Skipping card reservation for product ${line.productId} (${line.product.name}) - no validation required`);
            }

            // Create sale line
            const saleLine = await SaleLine.create({
                headerId: saleHeader.id,
                saleHeaderId: saleHeader.id,
                productId: line.productId,
                quantity: line.quantity,
                price: line.price,
                total: line.total,
                unitRate: line.unitRate,
                specialInstructions: line.specialInstructions,
                isActive: true
            }, { transaction });

            // Update cards with the actual saleLineId (only if cards were reserved)
            if (line.product.validateStockOnSale) {
                const updatedCards = await Card.update(
                    { saleLineId: saleLine.id },
                    {
                        where: {
                            locking_session_id: lockingSessionId,
                            productId: line.productId,
                            card_isused: true,
                            saleLineId: null
                        },
                        transaction
                    }
                );
                logger.info(`✓ ${updatedCards[0]} cards linked to sale line ${saleLine.id}`);
            }

            createdSaleLines.push(saleLine);
            logger.info(`✓ Sale line created for product ${line.productId}`);
        }

        // ============================================================
        // STEP 4: UPDATE PRODUCT STOCK COUNTS
        // ============================================================
        const productIdsForStockUpdate = lines
            .filter(line => line.product.validateStockOnSale)
            .map(line => line.productId);

        if (productIdsForStockUpdate.length > 0) {
            await productService.updateProductCountGroup(productIdsForStockUpdate);
            logger.info(`✓ Updated stock count for ${productIdsForStockUpdate.length} products`);
        }

        logger.info(`=== SUCCESS ===`);
        logger.info(`Ticket ${ticketId} successfully posted to sales as Sale Header #${saleHeader.id}`);

        return {
            saleHeader,
            saleLines: createdSaleLines,
            summary: {
                totalLines: lines.length,
                linesWithStockValidation: productsRequiringValidation,
                linesWithoutStockValidation: productsNotRequiringValidation
            }
        };

    } catch (error) {
        logger.error(`=== ERROR ===`);
        logger.error(`Failed to post ticket ${ticketId} to sale: ${error.message}`);
        throw error;
    }
};

// Helper function to reserve cards (only called for products with validateStockOnSale = true)
const reserveCardForTicket = async (line, lockingSessionId, qty, locationId, transaction) => {
    const cards = await Card.findAll({
        limit: qty,
        order: [['createdAt', 'DESC']],
        where: {
            productId: line.productId,
            saleLineId: null,
            card_isused: 0,
            locationId
        },
        transaction
    });

    logger.info(`Product Id: ${line.productId}, Location: ${locationId}`);
    logger.info(`Cards available: ${cards.length}, Required: ${qty}`);

    // This should never fail since we validated earlier, but keep as safety check
    if (!cards || cards.length < qty) {
        throw new Error(`Stock not enough for product #${line.productId} - this should have been caught in validation`);
    }

    const entryOption = {
        locking_session_id: lockingSessionId,
        card_isused: true,
    };

    const cardReserved = await Card.update(entryOption, {
        where: {
            id: {
                [Op.in]: cards.map(el => el.id)
            }
        },
        transaction
    });

    logger.info(`✓ Reserved ${cardReserved[0]} cards for product ${line.productId}`);
};

// Helper function to reverse sale when ticket is cancelled
const reverseSaleFromTicket = async (ticketId, cancelReason, transaction) => {
    try {
        logger.info(`=== STARTING SALE REVERSAL FOR TICKET ${ticketId} ===`);

        // Find the sale header associated with this ticket
        const saleHeader = await SaleHeader.findOne({
            where: { ticketId: ticketId },
            include: [{
                model: SaleLine,
                as: "lines",
                include: [
                    {
                        model: Product,
                        as: "product"
                    },
                    {
                        model: Card,
                        as: "cards"
                    }
                ]
            }],
            transaction
        });

        if (!saleHeader) {
            logger.warn(`No sale found for ticket ${ticketId} - nothing to reverse`);
            return null;
        }

        logger.info(`Found sale header ${saleHeader.id} to reverse`);

        // Collect card IDs to reverse (only for products that had stock validation)
        const cardIds = saleHeader.lines.flatMap(line =>
            line.cards ? line.cards.map(card => card.id) : []
        );

        const lineIds = saleHeader.lines.map(line => line.id);

        logger.info(`Cards to reverse: ${cardIds.length}`);
        logger.info(`Sale lines to deactivate: ${lineIds.length}`);

        // Update sale header to inactive with cancellation remark
        await saleHeader.update({
            isActive: false,
            remark: cancelReason || 'Cancelled from Ticket'
        }, { transaction });

        logger.info(`✓ Sale header ${saleHeader.id} marked as inactive`);

        // Update sale lines to inactive
        if (lineIds.length > 0) {
            await SaleLine.update(
                { isActive: false },
                {
                    where: { id: { [Op.in]: lineIds } },
                    transaction
                }
            );
            logger.info(`✓ ${lineIds.length} sale lines marked as inactive`);
        }

        // Reverse cards ONLY if there are cards (products with stock validation)
        if (cardIds.length > 0) {
            const [numUpdated] = await Card.update(
                {
                    card_isused: 0,
                    saleLineId: null,
                    isActive: true,
                },
                {
                    where: {
                        id: {
                            [Op.in]: cardIds,
                        },
                    },
                    transaction
                }
            );
            logger.info(`✓ ${numUpdated} cards returned to inventory`);
        } else {
            logger.info(`○ No cards to reverse (all products were non-stock validated)`);
        }

        // Update product stock counts ONLY for products that had stock validation
        const productsWithStockValidation = saleHeader.lines.filter(line =>
            line.product && line.product.validateStockOnSale && line.cards && line.cards.length > 0
        );

        if (productsWithStockValidation.length > 0) {
            const productIdsForStockUpdate = productsWithStockValidation.map(line => line.productId);
            await productService.updateProductCountGroup(productIdsForStockUpdate);
            logger.info(`✓ Updated stock count for ${productIdsForStockUpdate.length} products`);
        } else {
            logger.info(`○ No product stock counts to update`);
        }

        logger.info(`=== SALE REVERSAL COMPLETED FOR TICKET ${ticketId} ===`);

        return {
            saleHeaderId: saleHeader.id,
            linesReversed: lineIds.length,
            cardsReversed: cardIds.length,
            productsStockUpdated: productsWithStockValidation.length
        };

    } catch (error) {
        logger.error(`=== ERROR REVERSING SALE ===`);
        logger.error(`Failed to reverse sale for ticket ${ticketId}: ${error.message}`);
        throw error;
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
                tableId = null,
                clientId = null,
                paymentId = null,
                status = 'pending',
                paymentStatus = 'pending',
                notes,
                ticketLines = []
            } = req.body;

            let table = null;

            // Validation - only check table if tableId is provided
            if (tableId) {
                // Check if table exists and is available
                table = await Table.findByPk(tableId, { transaction });

                if (!table) {
                    await transaction.rollback();
                    return res.status(404).json({
                        success: false,
                        message: 'Table not found'
                    });
                }

                // Optional: Check if table is already occupied
                if (table.status === 'occupied' && table.currentOrderId) {
                    logger.warn(`Table ${tableId} is already occupied with order ${table.currentOrderId}`);
                    // You can either reject or allow based on business rules
                    // For now, we'll allow it with a warning
                }
            } else {
                logger.info('Creating ticket without table assignment (Walk-in/Takeaway)');
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

            // Generate ticket number
            const ticketNumber = await Ticket.generateTicketNumber();

            // Create the ticket
            const newTicket = await Ticket.create({
                tableId: tableId || null, // Explicitly set null if no table
                ticketNumber,
                clientId: clientId || null,
                paymentId: paymentId || null,
                status,
                paymentStatus,
                subtotal: subtotal.toFixed(2),
                tax: tax.toFixed(2),
                total: total.toFixed(2),
                notes: notes || (tableId ? null : 'Walk-in customer - No table assigned')
            }, { transaction });

            logger.info(`Ticket ${newTicket.id} created successfully${tableId ? ` for table ${tableId}` : ' without table'}`);

            // Create ticket lines if provided
            if (ticketLines.length > 0) {
                const ticketLinesData = ticketLines.map(line => ({
                    ...line,
                    ticketId: newTicket.id,
                    totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2)
                }));

                await TicketLine.bulkCreate(ticketLinesData, { transaction });
                logger.info(`Created ${ticketLinesData.length} ticket lines for ticket ${newTicket.id}`);
            }

            // Update table status to occupied ONLY if table exists and ticket is created
            if (tableId && table && status !== 'paid' && status !== 'served' && status !== 'cancel') {
                await table.update({
                    status: 'occupied',
                    currentOrderId: newTicket.id,
                    timeOccupied: new Date()
                }, { transaction });

                logger.info(`Table ${tableId} status updated to occupied`);
            }

            await transaction.commit();

            // Fetch the complete ticket with associations
            const includeOptions = [
                { model: Client, as: 'client', required: false },
                { model: Payment, as: 'payment', required: false },
                {
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        { model: Product, as: 'product', required: false }
                    ]
                }
            ];

            // Only include table if tableId exists
            if (tableId) {
                includeOptions.unshift({ model: Table, as: 'table', required: false });
            }

            const createdTicket = await Ticket.findByPk(newTicket.id, {
                include: includeOptions
            });

            res.status(201).json({
                success: true,
                message: tableId
                    ? `Ticket created successfully for Table ${table.number}`
                    : 'Ticket created successfully (Walk-in/No table)',
                data: createdTicket
            });
        } catch (error) {
            await transaction.rollback();

            logger.error(`Error creating ticket: ${error.message}`);

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

        const ticket = await Ticket.findByPk(id, { 
            include: [{ model: Table, as: 'table', required: false }],
            transaction 
        });

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
            
            logger.info(`Updated ticket lines for ticket ${id}`);
        }

        // Handle table assignment changes
        if ('tableId' in updateData) {
            const oldTableId = ticket.tableId;
            const newTableId = updateData.tableId;

            // If changing from one table to another or adding/removing table
            if (oldTableId !== newTableId) {
                // Release old table if exists
                if (oldTableId && ticket.table) {
                    await ticket.table.update({
                        status: 'available',
                        currentOrderId: null,
                        timeOccupied: null
                    }, { transaction });
                    
                    logger.info(`Released old table ${oldTableId}`);
                }

                // Occupy new table if specified
                if (newTableId) {
                    const newTable = await Table.findByPk(newTableId, { transaction });
                    
                    if (!newTable) {
                        await transaction.rollback();
                        return res.status(404).json({
                            success: false,
                            message: 'New table not found'
                        });
                    }

                    await newTable.update({
                        status: 'occupied',
                        currentOrderId: ticket.id,
                        timeOccupied: new Date()
                    }, { transaction });
                    
                    logger.info(`Assigned ticket ${id} to new table ${newTableId}`);
                }
            }
        }

        await ticket.update(updateData, { transaction });

        await transaction.commit();

        // Fetch updated ticket with associations
        const includeOptions = [
            { model: Client, as: 'client', required: false },
            { model: Payment, as: 'payment', required: false },
            { 
                model: TicketLine, 
                as: 'ticketLines',
                include: [
                    { model: Product, as: 'product', required: false }
                ]
            }
        ];

        // Include table if it exists
        if (ticket.tableId || updateData.tableId) {
            includeOptions.unshift({ model: Table, as: 'table', required: false });
        }

        const updatedTicket = await Ticket.findByPk(id, {
            include: includeOptions
        });

        res.status(200).json({
            success: true,
            message: 'Ticket updated successfully',
            data: updatedTicket
        });
    } catch (error) {
        await transaction.rollback();
        
        logger.error(`Error updating ticket: ${error.message}`);

        res.status(500).json({
            success: false,
            message: 'Error updating ticket',
            error: error.message
        });
    }
},

    // Update ticket status
    // Update ticket status
    updateTicketStatus: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const { status, cancelReason } = req.body;

            if (!status) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Status is required'
                });
            }

            const validStatuses = ['pending', 'preparing', 'ready', 'served', 'paid', 'cancel', 'void'];
            if (!validStatuses.includes(status)) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
                });
            }

            // Validate cancel reason if status is cancel
            if (status === 'cancel') {
                if (!cancelReason || cancelReason.trim() === '') {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Cancel reason is required when cancelling a ticket'
                    });
                }
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

            let reversalResult = null;

            // IF STATUS = CANCEL THEN:
            // 1. Update payment status to cancel
            // 2. Reverse sale if it exists
            // 3. Return stock cards
            if (status === 'cancel') {
                logger.info(`=== CANCELLING TICKET ${id} ===`);

                // Update ticket status and payment status
                await ticket.update({
                    status,
                    paymentStatus: 'cancel',
                    notes: cancelReason
                }, { transaction });

                logger.info(`✓ Ticket ${id} status updated to cancelled`);

                // Reverse the sale if it was posted
                try {
                    reversalResult = await reverseSaleFromTicket(id, cancelReason, transaction);

                    if (reversalResult) {
                        logger.info(`✓ Sale reversed successfully for ticket ${id}`);
                    } else {
                        logger.info(`○ No sale to reverse for ticket ${id}`);
                    }
                } catch (reversalError) {
                    logger.error(`Error reversing sale: ${reversalError.message}`);
                    // Rollback everything if sale reversal fails
                    await transaction.rollback();
                    return res.status(500).json({
                        success: false,
                        message: 'Error reversing sale during cancellation',
                        error: reversalError.message
                    });
                }
            } else {
                // Normal status update (not cancellation)
                await ticket.update({ status }, { transaction });
            }

            // Update table status based on ticket status
            if (ticket.table) {
                let tableStatus = 'occupied';
                let currentOrderId = ticket.id;

                if (status === 'paid' || status === 'served') {
                    tableStatus = 'cleaning';
                    currentOrderId = null;
                } else if (status === 'cancel' || status === 'void') {
                    tableStatus = 'available';
                    currentOrderId = null;
                }

                await ticket.table.update({
                    status: tableStatus,
                    currentOrderId: currentOrderId
                }, { transaction });

                logger.info(`✓ Table ${ticket.table.id} status updated to ${tableStatus}`);
            }

            await transaction.commit();

            const responseMessage = status === 'cancel'
                ? 'Ticket cancelled and sale reversed successfully'
                : 'Ticket status updated successfully';

            res.status(200).json({
                success: true,
                message: responseMessage,
                data: {
                    ticket,
                    reversal: reversalResult
                }
            });
        } catch (error) {
            await transaction.rollback();
            logger.error(`Error updating ticket status: ${error.message}`);

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