const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');

// Model imports
const Ticket = require('../../models').ticket;
const TicketLine = require('../../models').ticketLine;
const Table = require('../../models').table;
const sequelize = require('../../models').sequelize;
const Payment = require('../../models').payment;
const Client = require('../../models').client;
const Product = require('../../models').product;
const Promotion = require('../../models').promotion; // Added promotion model

// Sale integration models
const SaleHeader = require('../../models').saleHeader;
const SaleLine = require('../../models').saleLine;
const Card = require('../../models').card;

const common = require('../../common');
const productService = require('../../product/service');

// Helper function to post ticket to sale tables
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
                        },
                        {
                            model: Promotion,
                            as: 'promotion'
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
            product: ticketLine.product, // Keep product reference
            promotion: ticketLine.promotion,
            is_promotion_item: ticketLine.is_promotion_item,
            discount_amount: parseFloat(ticketLine.discount_amount || 0)
        }));

        logger.info(`Processing ${lines.length} items for ticket ${ticketId}`);

        // Stock validation logic (same as before)
        const stockValidationErrors = [];
        let productsRequiringValidation = 0;
        let productsNotRequiringValidation = 0;

        logger.info('=== STARTING STOCK VALIDATION ===');

        for (const line of lines) {
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

        if (stockValidationErrors.length > 0) {
            logger.error(`=== STOCK VALIDATION FAILED ===`);
            logger.error(`${stockValidationErrors.length} product(s) have insufficient stock`);

            const errorDetails = stockValidationErrors.map(err =>
                `Product #${err.productId} (${err.productName}): Need ${err.required}, Available ${err.available}, Short ${err.shortage}`
            ).join('; ');

            throw new Error(`Cannot post ticket to sale - Insufficient stock: ${errorDetails}`);
        }

        logger.info('=== STOCK VALIDATION PASSED ===');
        logger.info('All products have sufficient stock - proceeding with sale creation');

        // Calculate total discount from promotional items
        const totalDiscount = lines.reduce((sum, line) => sum + line.discount_amount, 0);

        // Create sale header
        const saleHeaderData = {
            bookingDate: new Date(),
            referenceNo: `TICKET-${ticket.id}`,
            remark: ticket.notes || 'Posted from Ticket',
            discount: totalDiscount,
            total: parseFloat(ticket.total),
            exchangeRate: 1,
            isActive: true,
            clientId: ticket.clientId || null,
            paymentId: ticket.paymentId || null,
            currencyId: 1,
            userId: 1,
            locationId: locationId,
            ticketId: ticket.id
        };

        const saleHeader = await SaleHeader.create(saleHeaderData, { transaction });
        logger.info(`✓ Sale header created with ID: ${saleHeader.id}`);

        // Create sale lines and reserve cards
        const createdSaleLines = [];

        for (const line of lines) {
            line.headerId = saleHeader.id;
            line.saleHeaderId = saleHeader.id;

            if (line.product.validateStockOnSale) {
                const qty = line.unitRate * line.quantity;
                logger.info(`Reserving ${qty} cards for product ${line.productId} (${line.product.name})`);
                await reserveCardForTicket(line, lockingSessionId, qty, locationId, transaction);
            } else {
                logger.info(`Skipping card reservation for product ${line.productId} (${line.product.name}) - no validation required`);
            }

            const saleLine = await SaleLine.create({
                headerId: saleHeader.id,
                saleHeaderId: saleHeader.id,
                productId: line.productId,
                quantity: line.quantity,
                price: line.price,
                total: line.total,
                unitRate: line.unitRate,
                specialInstructions: line.specialInstructions,
                isActive: true,
                // Add promotion fields if they exist
                promotionId: line.promotion ? line.promotion.id : null,
                discount_amount: line.discount_amount,
                is_promotion_item: line.is_promotion_item
            }, { transaction });

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

        // Update product stock counts
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
                linesWithoutStockValidation: productsNotRequiringValidation,
                totalDiscount: totalDiscount
            }
        };

    } catch (error) {
        logger.error(`=== ERROR ===`);
        logger.error(`Failed to post ticket ${ticketId} to sale: ${error.message}`);
        throw error;
    }
};

// Helper function to reserve cards
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

        const cardIds = saleHeader.lines.flatMap(line =>
            line.cards ? line.cards.map(card => card.id) : []
        );

        const lineIds = saleHeader.lines.map(line => line.id);

        logger.info(`Cards to reverse: ${cardIds.length}`);
        logger.info(`Sale lines to deactivate: ${lineIds.length}`);

        await saleHeader.update({
            isActive: false,
            remark: cancelReason || 'Cancelled from Ticket'
        }, { transaction });

        logger.info(`✓ Sale header ${saleHeader.id} marked as inactive`);

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

    // Get all tickets with promotion support
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
                limit = 20,
                include,
                sort = 'createdAt:desc'
            } = req.query;

            const whereCondition = {};
            if (status) whereCondition.status = status;
            if (paymentStatus) whereCondition.paymentStatus = paymentStatus;
            if (tableId) whereCondition.tableId = tableId;
            if (clientId) whereCondition.clientId = clientId;

            if (startDate || endDate) {
                whereCondition.createdAt = {};
                if (startDate) whereCondition.createdAt[Op.gte] = new Date(startDate);
                if (endDate) whereCondition.createdAt[Op.lte] = new Date(endDate);
            }

            const offset = (page - 1) * limit;
            const includeArray = [];

            let includeParams = [];
            if (include) {
                if (typeof include === 'string') {
                    includeParams = include.split(',');
                } else if (Array.isArray(include)) {
                    includeParams = include;
                }
            }

            if (includeParams.length === 0 || includeParams.includes('client')) {
                includeArray.push({
                    model: Client,
                    as: 'client',
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
                    required: false
                });
            }

            if (includeParams.includes('ticketLines')) {
                includeArray.push({
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            required: false
                        },
                        {
                            model: Promotion,
                            as: 'promotion',
                            required: false
                        }
                    ],
                    required: false
                });
            }

            let orderArray = [['createdAt', 'DESC']];
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
                distinct: true
            });

            res.status(200).json({
                success: true,
                tickets: tickets.rows,
                totalPages: Math.ceil(tickets.count / limit),
                currentPage: parseInt(page),
                totalItems: tickets.count,
                limit: parseInt(limit),
                data: tickets.rows,
                pagination: {
                    total: tickets.count,
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(tickets.count / limit),
                    limit: parseInt(limit)
                }
            });

        } catch (error) {
            console.error('Error fetching tickets:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching tickets',
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    },

    // Update ticket notes
    updateTicketNotes: async (req, res) => {
        try {
            const { id } = req.params;
            const { notes } = req.body;

            if (notes === undefined || notes === null) {
                return res.status(400).json({
                    success: false,
                    message: 'Notes field is required'
                });
            }

            const ticket = await Ticket.findByPk(id);

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            await ticket.update({
                notes: notes.trim()
            });

            logger.info(`Notes updated for ticket ${id}`);

            const updatedTicket = await Ticket.findByPk(id, {
                include: [
                    { model: Client, as: 'client', required: false },
                    { model: Table, as: 'table', required: false },
                    { model: Payment, as: 'payment', required: false },
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Product, as: 'product', required: false },
                            { model: Promotion, as: 'promotion', required: false }
                        ]
                    }
                ]
            });

            res.status(200).json({
                success: true,
                message: 'Notes updated successfully',
                data: updatedTicket
            });

        } catch (error) {
            logger.error(`Error updating ticket notes: ${error.message}`);

            res.status(500).json({
                success: false,
                message: 'Error updating ticket notes',
                error: error.message
            });
        }
    },

    // Get ticket by ID with full details including promotions
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
                            {
                                model: Product,
                                as: 'product',
                                attributes: ['id', 'pro_name', 'pro_price']
                            },
                            {
                                model: Promotion,
                                as: 'promotion',
                                required: false
                            }
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

    // Create new ticket with promotion support
    createTicket: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            console.log('=== CREATE TICKET REQUEST ===');
            console.log('Request body:', JSON.stringify(req.body, null, 2));

            const {
                tableId = null,
                clientId = null,
                paymentId = null,
                status = 'pending',
                paymentStatus = 'pending',
                notes,
                ticketLines = [],
                tax,
                // ADD THESE PROMOTION FIELDS
                promotionDiscount = 0,
                taxType,
                appliedPromotions = [],
                total,
                subtotal,
            } = req.body;

            console.log('Extracted values:', {
                tableId,
                clientId,
                paymentId,
                status,
                paymentStatus,
                notes,
                ticketLinesCount: ticketLines.length,
                promotionDiscount,
                appliedPromotionsCount: appliedPromotions.length
            });

            let table = null;

            if (tableId) {
                console.log(`Looking up table with ID: ${tableId}`);
                table = await Table.findByPk(tableId, { transaction });

                if (!table) {
                    console.error(`Table not found: ${tableId}`);
                    await transaction.rollback();
                    return res.status(404).json({
                        success: false,
                        message: 'Table not found'
                    });
                }

                console.log(`Table found: ${table.number}, status: ${table.status}`);
            } else {
                console.log('Creating ticket without table assignment (Walk-in/Takeaway)');
            }

            // Calculate totals from ticket lines (FIXED to handle promotions)
        

            if (ticketLines.length > 0) {
                console.log('Calculating totals from ticket lines...');

                // ticketLines.forEach(line => {
                //     const lineSubtotal = parseFloat(line.quantity) * parseFloat(line.unitPrice || 0);
                //     subtotal += lineSubtotal;
                // });

                // FIXED: Apply promotion discount and calculate tax on discounted amount
                const promotionDiscountAmount = parseFloat(promotionDiscount || 0);
                const afterPromotions = Math.max(0, subtotal - promotionDiscountAmount);

                // Use 8.5% tax rate to match frontend
                // total = afterPromotions + tax;

                console.log('Calculated totals:', {
                    subtotal: subtotal.toFixed(2),
                    promotionDiscount: promotionDiscountAmount.toFixed(2),
                    afterPromotions: afterPromotions.toFixed(2),
                    tax: tax.toFixed(2),
                    total: total.toFixed(2)
                });
            } else {
                console.warn('No ticket lines provided');
            }

            console.log('Generating ticket number...');
            const ticketNumber = await Ticket.generateTicketNumber();
            console.log(`Generated ticket number: ${ticketNumber}`);

            const ticketData = {
                tableId: tableId || null,
                ticketNumber,
                clientId: clientId || null,
                paymentId: paymentId || null,
                status,
                paymentStatus,
                taxType,
                subtotal: subtotal.toFixed(2),
                promotionDiscount: parseFloat(promotionDiscount || 0).toFixed(2), // ADD THIS
                tax: tax.toFixed(2),
                total: total.toFixed(2),
                notes: notes || (tableId ? null : 'Walk-in customer - No table assigned'),
                // ADD THIS: Store applied promotions as JSON
                appliedPromotions: appliedPromotions.length > 0 ? JSON.stringify(appliedPromotions) : null
            };

            console.log('Creating ticket with data:', JSON.stringify(ticketData, null, 2));

            const newTicket = await Ticket.create(ticketData, {
                transaction,
                validate: true
            });

            console.log(`✅ Ticket created successfully:`, newTicket.toJSON());

            // Create ticket lines with promotion support
            if (ticketLines.length > 0) {
                console.log('Creating ticket lines...');

                const ticketLinesData = ticketLines.map((line, index) => {
                    const lineData = {
                        ticketId: newTicket.id,
                        productId: line.productId,
                        quantity: line.quantity,
                        unitPrice: line.unitPrice,
                        totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2),
                        specialInstructions: line.specialInstructions || null,
                        status: line.status || 'ordered',
                        // Promotion fields - these should come from frontend if items have promotions applied
                        promotionId: line.promotionId || null,
                        is_promotion_item: line.is_promotion_item || false,
                        original_price: line.original_price || null,
                        discount_amount: line.discount_amount || 0,
                        promotion_note: line.promotion_note || null
                    };

                    console.log(`Line ${index + 1}:`, lineData);
                    return lineData;
                });

                await TicketLine.bulkCreate(ticketLinesData, { transaction });
                console.log(`✅ Created ${ticketLinesData.length} ticket lines`);
            }

            // Update table status
            if (tableId && table && status !== 'paid' && status !== 'served' && status !== 'cancel') {
                console.log(`Updating table ${tableId} status...`);

                await table.update({
                    status: 'occupied',
                    currentOrderId: newTicket.id,
                    timeOccupied: new Date()
                }, { transaction });

                console.log(`✅ Table ${tableId} updated`);
            }

            await transaction.commit();
            console.log('✅ Transaction committed');

            // Fetch complete ticket with promotion data
            const includeOptions = [
                { model: Client, as: 'client', required: false },
                { model: Payment, as: 'payment', required: false },
                {
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        { model: Product, as: 'product', required: false },
                        { model: Promotion, as: 'promotion', required: false }
                    ]
                }
            ];

            if (tableId) {
                includeOptions.unshift({ model: Table, as: 'table', required: false });
            }

            const createdTicket = await Ticket.findByPk(newTicket.id, {
                include: includeOptions
            });

            console.log('✅ TICKET CREATION SUCCESSFUL');

            res.status(201).json({
                success: true,
                message: tableId
                    ? `Ticket created successfully for Table ${table.number}`
                    : 'Ticket created successfully (Walk-in/No table)',
                data: createdTicket
            });
        } catch (error) {
            await transaction.rollback();

            console.error('=== TICKET CREATION FAILED ===');
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Full error:', error);

            if (error.name === 'SequelizeValidationError') {
                console.error('Validation errors:');
                error.errors.forEach((err, index) => {
                    console.error(`  ${index + 1}. Field: ${err.path}`);
                    console.error(`     Message: ${err.message}`);
                    console.error(`     Value: ${err.value}`);
                    console.error(`     Type: ${err.type}`);
                    console.error(`     Validator: ${err.validatorKey}`);
                });

                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    errors: error.errors.map(err => ({
                        field: err.path,
                        message: err.message,
                        value: err.value,
                        type: err.type
                    }))
                });
            }

            if (error.name === 'SequelizeForeignKeyConstraintError') {
                console.error('Foreign key error details:', {
                    table: error.table,
                    fields: error.fields,
                    value: error.value,
                    index: error.index
                });

                return res.status(400).json({
                    success: false,
                    message: 'Foreign key constraint error',
                    error: error.message
                });
            }

            if (error.name === 'SequelizeDatabaseError') {
                console.error('Database error SQL:', error.sql);
                console.error('Database error params:', error.parameters);
            }

            res.status(500).json({
                success: false,
                message: 'Error creating ticket',
                error: error.message,
                errorType: error.name
            });
        }
    },

    // Update ticket with promotion support
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

            // If updating ticket lines, recalculate totals with promotion support
            if (updateData.ticketLines) {
                // let subtotal = 0;
                // let totalDiscount = 0;

                // updateData.ticketLines.forEach(line => {
                //     const lineSubtotal = parseFloat(line.quantity) * parseFloat(line.unitPrice || 0);
                //     subtotal += lineSubtotal;

                //     if (line.discount_amount) {
                //         totalDiscount += parseFloat(line.discount_amount);
                //     }
                // });

                // const total = subtotal + updateData.tax;

                // updateData.subtotal = subtotal.toFixed(2);
                // updateData.total = total.toFixed(2);

                // Delete existing ticket lines and create new ones
                await TicketLine.destroy({
                    where: { ticketId: id },
                    transaction
                });

                const ticketLinesData = updateData.ticketLines.map(line => ({
                    ticketId: id,
                    productId: line.productId,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2),
                    specialInstructions: line.specialInstructions || null,
                    status: line.status || 'ordered',
                    // Promotion fields
                    promotionId: line.promotionId || null,
                    is_promotion_item: line.is_promotion_item || false,
                    original_price: line.original_price || null,
                    discount_amount: line.discount_amount || 0,
                    promotion_note: line.promotion_note || null
                }));

                await TicketLine.bulkCreate(ticketLinesData, { transaction });
                delete updateData.ticketLines;

                logger.info(`Updated ticket lines for ticket ${id}`);
            }

            // Handle table assignment changes
            if ('tableId' in updateData) {
                const oldTableId = ticket.tableId;
                const newTableId = updateData.tableId;

                if (oldTableId !== newTableId) {
                    if (oldTableId && ticket.table) {
                        await ticket.table.update({
                            status: 'available',
                            currentOrderId: null,
                            timeOccupied: null
                        }, { transaction });

                        logger.info(`Released old table ${oldTableId}`);
                    }

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

            // Fetch updated ticket with all associations including promotions
            const includeOptions = [
                { model: Client, as: 'client', required: false },
                { model: Payment, as: 'payment', required: false },
                {
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        { model: Product, as: 'product', required: false },
                        { model: Promotion, as: 'promotion', required: false }
                    ]
                }
            ];

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

    // Update ticket status with sale integration
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

            if (status === 'cancel') {
                logger.info(`=== CANCELLING TICKET ${id} ===`);

                await ticket.update({
                    status,
                    paymentStatus: 'cancel',
                    notes: cancelReason
                }, { transaction });

                logger.info(`✓ Ticket ${id} status updated to cancelled`);

                try {
                    reversalResult = await reverseSaleFromTicket(id, cancelReason, transaction);

                    if (reversalResult) {
                        logger.info(`✓ Sale reversed successfully for ticket ${id}`);
                    } else {
                        logger.info(`○ No sale to reverse for ticket ${id}`);
                    }
                } catch (reversalError) {
                    logger.error(`Error reversing sale: ${reversalError.message}`);
                    await transaction.rollback();
                    return res.status(500).json({
                        success: false,
                        message: 'Error reversing sale during cancellation',
                        error: reversalError.message
                    });
                }
            } else {
                await ticket.update({ status }, { transaction });
            }

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

    // Update payment status with sale integration
    updatePaymentStatus: async (req, res) => {
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

            if (paymentStatus === 'paid') {
                updateData.status = 'paid';
            }

            await ticket.update(updateData, { transaction: t });

            let saleData = null;

            if (paymentStatus === 'paid') {
                try {
                    saleData = await postTicketToSale(id, t);
                    console.log(`Ticket ${id} successfully posted to sales`);
                } catch (saleError) {
                    logger.error(`POST TO Sale incompleted. with error ${saleError}`)
                    if (saleError.message.includes('already been posted')) {
                        console.log(`Ticket ${id} has already been posted to sales`);
                    } else {
                        await t.rollback();
                        return res.status(500).json({
                            success: false,
                            message: 'Error posting to sales',
                            error: saleError.message
                        });
                    }
                }
            }

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

    // Apply promotion to ticket
    applyPromotionToTicket: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const { promotionId, applicableLineIds } = req.body;

            const ticket = await Ticket.findByPk(id, {
                include: [{
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [{ model: Product, as: 'product' }]
                }],
                transaction
            });

            if (!ticket) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            const promotion = await Promotion.findByPk(promotionId, { transaction });
            if (!promotion) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Promotion not found'
                });
            }

            // Here you would implement the promotion logic
            // This could integrate with your promotion controller's evaluatePromotion method

            await transaction.commit();

            res.status(200).json({
                success: true,
                message: 'Promotion applied successfully',
                data: ticket
            });

        } catch (error) {
            await transaction.rollback();
            res.status(500).json({
                success: false,
                message: 'Error applying promotion',
                error: error.message
            });
        }
    },

    // Remove promotion from ticket
    removePromotionFromTicket: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const { promotionId } = req.body;

            // Logic to remove promotion and recalculate totals

            await transaction.commit();

            res.status(200).json({
                success: true,
                message: 'Promotion removed successfully'
            });

        } catch (error) {
            await transaction.rollback();
            res.status(500).json({
                success: false,
                message: 'Error removing promotion',
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

            if (ticket.paymentStatus === 'paid' && ticket.status === 'served') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete completed and paid ticket'
                });
            }

            await TicketLine.destroy({
                where: { ticketId: id },
                transaction
            });

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
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Promotion, as: 'promotion', required: false }
                        ]
                    }
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
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Promotion, as: 'promotion', required: false }
                        ]
                    }
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

    // Get tickets by table and status
    async getTicketsByTableAndStatus(req, res) {
        try {
            const { tableId } = req.params;
            const tickets = await Ticket.findAll({
                where: {
                    tableId: tableId,
                    status: 'pending'
                },
                include: [
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Promotion, as: 'promotion', required: false }
                        ]
                    }
                ]
            });
            res.json(tickets);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Get current ticket by table
    async getCurrentTicketByTable(req, res) {
        try {
            const { tableId } = req.params;

            const currentTicket = await Ticket.findOne({
                where: {
                    tableId: tableId,
                    paymentStatus: 'pending'
                },
                include: [{
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        { model: Promotion, as: 'promotion', required: false }
                    ]
                }],
                order: [['createdAt', 'DESC']]
            });

            if (!currentTicket) {
                return res.status(404).json({ message: 'No current ticket found for this table' });
            }

            const itemCount = currentTicket.ticketLines.reduce((sum, line) => sum + line.quantity, 0);

            res.json({
                ...currentTicket.toJSON(),
                itemCount
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Get sale data by ticket ID
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