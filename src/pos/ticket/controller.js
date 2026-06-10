const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op, fn, col, literal } = require('sequelize');

// Model imports
const User = require('../../models').user;
const Ticket = require('../../models').ticket;
const TicketLine = require('../../models').ticketLine;
const Table = require('../../models').table;
const sequelize = require('../../models').sequelize;
const Payment = require('../../models').payment;
const Client = require('../../models').client;
const Category = require('../../models').category;
const Product = require('../../models').product;
const Location = require('../../models').location;
const Promotion = require('../../models').promotion; // Added promotion model
const Currency = require('../../models').currency;

// Sale integration models
const SaleHeader = require('../../models').saleHeader;
const SaleLine = require('../../models').saleLine;
const Card = require('../../models').card;
const SalePayment = require('../../models').salePayment;

const common = require('../../common');
const productService = require('../../product/service');
const spfService = require('../../spf/service');

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
        const locationId = ticket.locationId; // Get from ticket.table.locationId or config

        // Fetch active currencies for card creation
        const currencies = await Currency.findAll({
            where: { isActive: true },
            transaction
        });
        const currencyMap = new Map(currencies.map(c => [c.id, c]));

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

            // NEW: If stock validation is NOT required, create "fresh" cards and mark as used mapping with this saleLine
            if (!line.product.validateStockOnSale) {
                const qty = line.unitRate * line.quantity;
                logger.info(`Creating ${qty} fresh cards for non-stock product ${line.productId} (${line.product.name})`);
                
                const currencyId = line.product.saleCurrencyId || 1;
                const currency = currencyMap.get(currencyId);
                const exchangeRate = currency ? currency.rate : 1;
                const cost = line.product.cost_price || 0;
                const costLCY = cost * exchangeRate;
                
                const cardRows = [];
                for (let i = 0; i < qty; i++) {
                    const cardSequenceNumber = common.generateLockingSessionId(10);
                    cardRows.push({
                        card_type_code: 10010, // Stock type code
                        product_id: line.product.pro_id, // Legacy product code
                        productId: line.productId, // Primary key
                        cost: cost,
                        costLCY: costLCY,
                        exchangeRate: exchangeRate,
                        card_number: cardSequenceNumber,
                        card_isused: 1, // Mark as used immediately
                        locking_session_id: lockingSessionId,
                        card_input_date: new Date(),
                        inputter: ticket.createUserId || 1,
                        update_user: ticket.createUserId || 1,
                        update_time: new Date(),
                        update_time_new: new Date(),
                        isActive: true,
                        currencyId: currencyId,
                        locationId: locationId,
                        saleLineId: saleLine.id
                    });
                }
                
                if (cardRows.length > 0) {
                    await Card.bulkCreate(cardRows, { transaction });
                    logger.info(`✓ Created and linked ${cardRows.length} fresh cards for product ${line.productId}`);
                }
            }
        }

        // Update product stock counts (Include products that had fresh cards created too)
        const productIdsForStockUpdate = lines
            .map(line => line.productId);

        if (productIdsForStockUpdate.length > 0) {
            await productService.updateProductCountGroup(productIdsForStockUpdate, transaction);
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
            await productService.updateProductCountGroup(productIdsForStockUpdate, transaction);
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

// Helper function to release cards linked to a ticket
const releaseCardsForTicket = async (ticketId, transaction) => {
    try {
        logger.info(`=== RELEASING CARDS FOR TICKET ${ticketId} ===`);
        const ticketLines = await TicketLine.findAll({
            where: { ticketId },
            include: [{ model: Product, as: 'product' }],
            transaction
        });

        const ticketLineIds = ticketLines.map(tl => tl.id);
        if (ticketLineIds.length === 0) {
            logger.info(`No ticket lines found for ticket ${ticketId}`);
            return;
        }

        // Find all cards linked to these ticket lines
        const cards = await Card.findAll({
            where: { ticketLineId: { [Op.in]: ticketLineIds } },
            transaction
        });

        if (cards.length === 0) {
            logger.info(`No cards linked to ticket lines for ticket ${ticketId}`);
            return;
        }

        const reservedCardIds = [];
        const freshCardIds = [];

        const productMap = new Map(ticketLines.map(tl => [tl.productId, tl.product]));

        for (const card of cards) {
            const product = productMap.get(card.productId);
            if (product && product.validateStockOnSale) {
                reservedCardIds.push(card.id);
            } else {
                freshCardIds.push(card.id);
            }
        }

        // 1. Reserved stock cards: return to inventory
        if (reservedCardIds.length > 0) {
            const [numUpdated] = await Card.update(
                {
                    card_isused: 0,
                    ticketLineId: null,
                    locking_session_id: null
                },
                {
                    where: { id: { [Op.in]: reservedCardIds } },
                    transaction
                }
            );
            logger.info(`✓ Returned ${numUpdated} reserved cards to inventory`);
        }

        // 2. Fresh cards: delete them to avoid polluting inventory
        if (freshCardIds.length > 0) {
            const numDeleted = await Card.destroy({
                where: { id: { [Op.in]: freshCardIds } },
                transaction
            });
            logger.info(`✓ Deleted ${numDeleted} fresh cards`);
        }

        // 3. Update product stock count groups
        const productIdsForStockUpdate = [...new Set(cards.map(c => c.productId))];
        if (productIdsForStockUpdate.length > 0) {
            await productService.updateProductCountGroup(productIdsForStockUpdate, transaction);
            logger.info(`✓ Updated stock count for ${productIdsForStockUpdate.length} products`);
        }

        logger.info(`=== CARDS RELEASE COMPLETED FOR TICKET ${ticketId} ===`);
    } catch (error) {
        logger.error(`=== ERROR RELEASING CARDS ===`);
        logger.error(`Failed to release cards for ticket ${ticketId}: ${error.message}`);
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
                limit = 200,
                include,
                locationId,
                paymentId,
                ticketNumber,
                sort = 'createdAt:desc'
            } = req.query;

            const whereCondition = {};
            if (status) whereCondition.status = status;
            if (paymentStatus) whereCondition.paymentStatus = paymentStatus;
            if (tableId) whereCondition.tableId = tableId;
            if (clientId) whereCondition.clientId = clientId;
            if (locationId) whereCondition.locationId = locationId;
            if (paymentId) whereCondition.paymentId = paymentId;
            if (ticketNumber) {
                whereCondition.ticketNumber = {
                    [Op.like]: `%${ticketNumber}%`
                };
            }
            if (startDate || endDate) {
                whereCondition.createdAt = {};
                if (startDate) {
                    // Set start time to beginning of day (00:00:00)
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    whereCondition.createdAt[Op.gte] = start;
                }
                if (endDate) {
                    // Set end time to end of day (23:59:59.999)
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    whereCondition.createdAt[Op.lte] = end;
                }
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
            includeArray.push({
                model: User,
                as: 'createUser',
                required: false
            });
            includeArray.push({
                model: User,
                as: 'cancelUser',
                required: false
            });
            includeArray.push({
                model: User,
                as: 'updateUser',
                required: false
            });
            includeArray.push({
                model: Location,
                as: 'location',
                required: false
            });

            includeArray.push({
                model: SalePayment,
                as: 'salePayments',
                required: false,
                include: [{ model: Payment, as: 'paymentMethod', required: false }]
            });

            if (includeParams.includes('ticketLines')) {
                includeArray.push({
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            required: false,
                            include: [
                                {
                                    model: Category,
                                    as: 'category',
                                }
                            ]
                        },
                        {
                            model: Promotion,
                            as: 'promotion',
                            required: false
                        },
                        {
                            model: Card,
                            as: 'cards',
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
                        model: SalePayment,
                        as: 'salePayments',
                        required: false,
                        include: [{ model: Payment, as: 'paymentMethod', required: false }]
                    },
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Product, as: 'product', required: false },
                            { model: Promotion, as: 'promotion', required: false },
                            { model: Card, as: 'cards', required: false }
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

    getTicketById: async (req, res) => {
        try {
            const { id } = req.params;

            const ticket = await Ticket.findByPk(id, {
                include: [
                    { model: Table, as: 'table' },
                    { model: Client, as: 'client' },
                    { model: Payment, as: 'payment' },
                    {
                        model: SalePayment,
                        as: 'salePayments',
                        required: false,
                        include: [{ model: Payment, as: 'paymentMethod', required: false }]
                    },
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
                            },
                            {
                                model: Card,
                                as: 'cards',
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
                createUserId,
                locationId,
            } = req.body;

            console.log('Extracted values:', {
                tableId,
                clientId,
                paymentId,
                createUserId,
                locationId,
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

            // Fetch products to check validateStockOnSale and get details
            const productIds = ticketLines.map(line => line.productId);
            const products = await Product.findAll({
                where: { id: { [Op.in]: productIds } },
                transaction
            });
            const productMap = new Map(products.map(p => [p.id, p]));

            // Fetch STOCK.VAR parameter from SPF
            const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
            const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';
            console.log('=== STARTING STOCK VALIDATION FOR TICKET ===, checkVariant:', checkVariant);

            // Stock validation logic before ticket creation
            const stockValidationErrors = [];
            const lockingSessionId = common.generateLockingSessionId();
            
            for (const line of ticketLines) {
                const product = productMap.get(line.productId);
                if (!product) {
                    await transaction.rollback();
                    return res.status(404).json({
                        success: false,
                        message: `Product with ID ${line.productId} not found`
                    });
                }
                
                if (product.validateStockOnSale) {
                    const qty = parseInt(line.quantity || 1);
                    console.log(`✓ Product ${line.productId} (${product.pro_name}) REQUIRES stock validation - checking inventory...`);
                    
                    const whereCondition = {
                        productId: line.productId,
                        ticketLineId: null,
                        card_isused: 0,
                        locationId
                    };

                    if (checkVariant) {
                        if (line.colorId !== undefined && line.colorId !== null) {
                            whereCondition.colorId = line.colorId;
                        }
                        if (line.sizeId !== undefined && line.sizeId !== null) {
                            whereCondition.sizeId = line.sizeId;
                        }
                    }

                    const availableCards = await Card.findAll({
                        limit: qty,
                        order: [['createdAt', 'DESC']],
                        where: whereCondition,
                        transaction
                    });
                    
                    const availableQty = availableCards ? availableCards.length : 0;
                    if (availableQty < qty) {
                        stockValidationErrors.push({
                            productId: line.productId,
                            productName: product.pro_name,
                            colorId: checkVariant ? line.colorId : null,
                            sizeId: checkVariant ? line.sizeId : null,
                            required: qty,
                            available: availableQty,
                            shortage: qty - availableQty
                        });
                        console.error(`✗ INSUFFICIENT STOCK - Product ${line.productId} (${product.pro_name}): Required ${qty}, Available ${availableQty}, Short by ${qty - availableQty}`);
                    } else {
                        console.log(`✓ SUFFICIENT STOCK - Product ${line.productId} (${product.pro_name}): Required ${qty}, Available ${availableQty}`);
                    }
                } else {
                    console.log(`○ Product ${line.productId} (${product.pro_name}) does NOT require stock validation - skipping check`);
                }
            }
            
            if (stockValidationErrors.length > 0) {
                await transaction.rollback();
                console.error(`=== STOCK VALIDATION FAILED ===`);
                const errorDetails = stockValidationErrors.map(err => {
                    const variantStr = checkVariant ? ` (Color: ${err.colorId}, Size: ${err.sizeId})` : '';
                    return `Product #${err.productId}${variantStr} (${err.productName}): Need ${err.required}, Available ${err.available}, Short ${err.shortage}`;
                }).join('; ');
                
                return res.status(400).json({
                    success: false,
                    message: `Cannot create ticket - Insufficient stock: ${errorDetails}`,
                    errors: stockValidationErrors
                });
            }
            
            console.log('=== STOCK VALIDATION PASSED ===');

            console.log('Generating ticket number...');
            const ticketNumber = await Ticket.generateTicketNumber(locationId);
            console.log(`Generated ticket number: ${ticketNumber}`);

            const ticketData = {
                tableId: tableId || null,
                ticketNumber,
                clientId: clientId || null,
                paymentId: paymentId || null,
                createUserId: createUserId || null,
                locationId: locationId || null,
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

            // Create ticket lines and reserve/create cards
            if (ticketLines.length > 0) {
                console.log('Creating ticket lines and allocating cards...');
                
                const currencies = await Currency.findAll({
                    where: { isActive: true },
                    transaction
                });
                const currencyMap = new Map(currencies.map(c => [c.id, c]));
                
                for (const line of ticketLines) {
                    const product = productMap.get(line.productId);
                    
                    const ticketLine = await TicketLine.create({
                        ticketId: newTicket.id,
                        productId: line.productId,
                        quantity: line.quantity,
                        unitPrice: line.unitPrice,
                        totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2),
                        specialInstructions: line.specialInstructions || null,
                        status: line.status || 'ordered',
                        promotionId: line.promotionId || null,
                        is_promotion_item: line.is_promotion_item || false,
                        original_price: line.original_price || null,
                        discount_amount: line.discount_amount || 0,
                        promotion_note: line.promotion_note || null,
                        colorId: line.colorId || null,
                        sizeId: line.sizeId || null
                    }, { transaction });
                    
                    console.log(`✅ Ticket line created with ID ${ticketLine.id} for product ${line.productId}`);
                    
                    const qty = parseInt(line.quantity || 1);
                    
                    if (product.validateStockOnSale) {
                        console.log(`Reserving ${qty} stock cards for product ${line.productId} (${product.pro_name})`);
                        
                        const whereCondition = {
                            productId: line.productId,
                            ticketLineId: null,
                            card_isused: 0,
                            locationId
                        };

                        if (checkVariant) {
                            if (line.colorId !== undefined && line.colorId !== null) {
                                whereCondition.colorId = line.colorId;
                            }
                            if (line.sizeId !== undefined && line.sizeId !== null) {
                                whereCondition.sizeId = line.sizeId;
                            }
                        }

                        const availableCards = await Card.findAll({
                            limit: qty,
                            order: [['createdAt', 'DESC']],
                            where: whereCondition,
                            transaction
                        });
                        
                        if (!availableCards || availableCards.length < qty) {
                            throw new Error(`Stock not enough for product #${line.productId} - this should have been caught in validation`);
                        }
                        
                        const [numUpdated] = await Card.update(
                            {
                                card_isused: 1,
                                ticketLineId: ticketLine.id,
                                locking_session_id: lockingSessionId
                            },
                            {
                                where: {
                                    id: { [Op.in]: availableCards.map(c => c.id) }
                                },
                                transaction
                            }
                        );
                        console.log(`✓ Reserved and linked ${numUpdated} cards to ticket line ${ticketLine.id}`);
                    } else {
                        console.log(`Creating ${qty} fresh cards for non-stock product ${line.productId} (${product.pro_name})`);
                        
                        const currencyId = product.saleCurrencyId || 1;
                        const currency = currencyMap.get(currencyId);
                        const exchangeRate = currency ? currency.rate : 1;
                        const cost = product.cost_price || 0;
                        const costLCY = cost * exchangeRate;
                        
                        const cardRows = [];
                        for (let i = 0; i < qty; i++) {
                            const cardSequenceNumber = common.generateLockingSessionId(10);
                            cardRows.push({
                                card_type_code: 10010, // Stock type code
                                product_id: product.pro_id, // Legacy product code
                                productId: line.productId, // Primary key
                                cost: cost,
                                costLCY: costLCY,
                                exchangeRate: exchangeRate,
                                card_number: cardSequenceNumber,
                                card_isused: 1, // Mark as used immediately
                                locking_session_id: lockingSessionId,
                                card_input_date: new Date(),
                                inputter: createUserId || 1,
                                update_user: createUserId || 1,
                                update_time: new Date(),
                                update_time_new: new Date(),
                                isActive: true,
                                currencyId: currencyId,
                                locationId: locationId,
                                ticketLineId: ticketLine.id,
                                colorId: line.colorId || null,
                                sizeId: line.sizeId || null
                            });
                        }
                        
                        if (cardRows.length > 0) {
                            await Card.bulkCreate(cardRows, { transaction });
                            console.log(`✓ Created and linked ${cardRows.length} fresh cards for product ${line.productId} to ticket line ${ticketLine.id}`);
                        }
                    }
                }
                
                // Update stock counts
                if (productIds.length > 0) {
                    await productService.updateProductCountGroup(productIds, transaction);
                    console.log(`✓ Updated stock count for ${productIds.length} products`);
                }
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
                    model: SalePayment,
                    as: 'salePayments',
                    required: false,
                    include: [{ model: Payment, as: 'paymentMethod', required: false }]
                },
                {
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        { model: Product, as: 'product', required: false },
                        { model: Promotion, as: 'promotion', required: false },
                        { model: Card, as: 'cards', required: false }
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
                // First release cards associated with old ticket lines
                await releaseCardsForTicket(id, transaction);

                // Delete existing ticket lines
                await TicketLine.destroy({
                    where: { ticketId: id },
                    transaction
                });

                const ticketLines = updateData.ticketLines;
                const productIds = ticketLines.map(line => line.productId);
                const products = await Product.findAll({
                    where: { id: { [Op.in]: productIds } },
                    transaction
                });
                const productMap = new Map(products.map(p => [p.id, p]));

                // Fetch STOCK.VAR parameter from SPF
                const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
                const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';
                console.log('=== STARTING STOCK VALIDATION FOR TICKET UPDATE ===, checkVariant:', checkVariant);

                // Stock validation for the new lines
                const stockValidationErrors = [];
                const lockingSessionId = common.generateLockingSessionId();
                const locationId = ticket.locationId || updateData.locationId;

                for (const line of ticketLines) {
                    const product = productMap.get(line.productId);
                    if (!product) {
                        await transaction.rollback();
                        return res.status(404).json({
                            success: false,
                            message: `Product with ID ${line.productId} not found`
                        });
                    }

                    if (product.validateStockOnSale) {
                        const qty = parseInt(line.quantity || 1);
                        console.log(`✓ Product ${line.productId} (${product.pro_name}) REQUIRES stock validation - checking inventory...`);

                        const whereCondition = {
                            productId: line.productId,
                            ticketLineId: null,
                            card_isused: 0,
                            locationId
                        };

                        if (checkVariant) {
                            if (line.colorId !== undefined && line.colorId !== null) {
                                whereCondition.colorId = line.colorId;
                            }
                            if (line.sizeId !== undefined && line.sizeId !== null) {
                                whereCondition.sizeId = line.sizeId;
                            }
                        }

                        const availableCards = await Card.findAll({
                            limit: qty,
                            order: [['createdAt', 'DESC']],
                            where: whereCondition,
                            transaction
                        });

                        const availableQty = availableCards ? availableCards.length : 0;
                        if (availableQty < qty) {
                            stockValidationErrors.push({
                                productId: line.productId,
                                productName: product.pro_name,
                                colorId: checkVariant ? line.colorId : null,
                                sizeId: checkVariant ? line.sizeId : null,
                                required: qty,
                                available: availableQty,
                                shortage: qty - availableQty
                            });
                            console.error(`✗ INSUFFICIENT STOCK - Product ${line.productId} (${product.pro_name}): Required ${qty}, Available ${availableQty}, Short by ${qty - availableQty}`);
                        } else {
                            console.log(`✓ SUFFICIENT STOCK - Product ${line.productId} (${product.pro_name}): Required ${qty}, Available ${availableQty}`);
                        }
                    } else {
                        console.log(`○ Product ${line.productId} (${product.pro_name}) does NOT require stock validation - skipping check`);
                    }
                }

                if (stockValidationErrors.length > 0) {
                    await transaction.rollback();
                    console.error(`=== STOCK VALIDATION FAILED ON UPDATE ===`);
                    const errorDetails = stockValidationErrors.map(err => {
                        const variantStr = checkVariant ? ` (Color: ${err.colorId}, Size: ${err.sizeId})` : '';
                        return `Product #${err.productId}${variantStr} (${err.productName}): Need ${err.required}, Available ${err.available}, Short ${err.shortage}`;
                    }).join('; ');

                    return res.status(400).json({
                        success: false,
                        message: `Cannot update ticket - Insufficient stock: ${errorDetails}`,
                        errors: stockValidationErrors
                    });
                }

                console.log('=== STOCK VALIDATION PASSED ON UPDATE ===');

                const currencies = await Currency.findAll({
                    where: { isActive: true },
                    transaction
                });
                const currencyMap = new Map(currencies.map(c => [c.id, c]));

                for (const line of ticketLines) {
                    const product = productMap.get(line.productId);

                    const ticketLine = await TicketLine.create({
                        ticketId: id,
                        productId: line.productId,
                        quantity: line.quantity,
                        unitPrice: line.unitPrice,
                        totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice || 0)).toFixed(2),
                        specialInstructions: line.specialInstructions || null,
                        status: line.status || 'ordered',
                        promotionId: line.promotionId || null,
                        is_promotion_item: line.is_promotion_item || false,
                        original_price: line.original_price || null,
                        discount_amount: line.discount_amount || 0,
                        promotion_note: line.promotion_note || null,
                        colorId: line.colorId || null,
                        sizeId: line.sizeId || null
                    }, { transaction });

                    console.log(`✅ Ticket line created with ID ${ticketLine.id} for product ${line.productId}`);

                    const qty = parseInt(line.quantity || 1);

                    if (product.validateStockOnSale) {
                        console.log(`Reserving ${qty} stock cards for product ${line.productId} (${product.pro_name})`);

                        const whereCondition = {
                            productId: line.productId,
                            ticketLineId: null,
                            card_isused: 0,
                            locationId
                        };

                        if (checkVariant) {
                            if (line.colorId !== undefined && line.colorId !== null) {
                                whereCondition.colorId = line.colorId;
                            }
                            if (line.sizeId !== undefined && line.sizeId !== null) {
                                whereCondition.sizeId = line.sizeId;
                            }
                        }

                        const availableCards = await Card.findAll({
                            limit: qty,
                            order: [['createdAt', 'DESC']],
                            where: whereCondition,
                            transaction
                        });

                        if (!availableCards || availableCards.length < qty) {
                            throw new Error(`Stock not enough for product #${line.productId} - this should have been caught in validation`);
                        }

                        const [numUpdated] = await Card.update(
                            {
                                card_isused: 1,
                                ticketLineId: ticketLine.id,
                                locking_session_id: lockingSessionId
                            },
                            {
                                where: {
                                    id: { [Op.in]: availableCards.map(c => c.id) }
                                },
                                transaction
                            }
                        );
                        console.log(`✓ Reserved and linked ${numUpdated} cards to ticket line ${ticketLine.id}`);
                    } else {
                        console.log(`Creating ${qty} fresh cards for non-stock product ${line.productId} (${product.pro_name})`);

                        const currencyId = product.saleCurrencyId || 1;
                        const currency = currencyMap.get(currencyId);
                        const exchangeRate = currency ? currency.rate : 1;
                        const cost = product.cost_price || 0;
                        const costLCY = cost * exchangeRate;

                        const cardRows = [];
                        for (let i = 0; i < qty; i++) {
                            const cardSequenceNumber = common.generateLockingSessionId(10);
                            cardRows.push({
                                card_type_code: 10010, // Stock type code
                                product_id: product.pro_id, // Legacy product code
                                productId: line.productId, // Primary key
                                cost: cost,
                                costLCY: costLCY,
                                exchangeRate: exchangeRate,
                                card_number: cardSequenceNumber,
                                card_isused: 1, // Mark as used immediately
                                locking_session_id: lockingSessionId,
                                card_input_date: new Date(),
                                inputter: ticket.createUserId || 1,
                                update_user: ticket.createUserId || 1,
                                update_time: new Date(),
                                update_time_new: new Date(),
                                isActive: true,
                                currencyId: currencyId,
                                locationId: locationId,
                                ticketLineId: ticketLine.id,
                                colorId: line.colorId || null,
                                sizeId: line.sizeId || null
                            });
                        }

                        if (cardRows.length > 0) {
                            await Card.bulkCreate(cardRows, { transaction });
                            console.log(`✓ Created and linked ${cardRows.length} fresh cards for product ${line.productId} to ticket line ${ticketLine.id}`);
                        }
                    }
                }

                // Update stock counts
                if (productIds.length > 0) {
                    await productService.updateProductCountGroup(productIds, transaction);
                    console.log(`✓ Updated stock count for ${productIds.length} products`);
                }

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

            // If status is updated to paid/served/cancel/void, ensure the active table status is updated
            const finalStatus = updateData.status || (updateData.paymentStatus === 'paid' ? 'paid' : null);
            if (finalStatus === 'paid' || finalStatus === 'served' || finalStatus === 'cancel' || finalStatus === 'void') {
                const activeTableId = 'tableId' in updateData ? updateData.tableId : ticket.tableId;
                if (activeTableId) {
                    const table = await Table.findByPk(activeTableId, { transaction });
                    if (table) {
                        let tableStatus = 'occupied';
                        if (finalStatus === 'paid' || finalStatus === 'served') {
                            tableStatus = 'cleaning';
                        } else if (finalStatus === 'cancel' || finalStatus === 'void') {
                            tableStatus = 'available';
                        }

                        await table.update({
                            status: tableStatus,
                            currentOrderId: null,
                            timeOccupied: null
                        }, { transaction });

                        logger.info(`✓ Table ${table.id} status updated to ${tableStatus} and order cleared via updateTicket (status: ${finalStatus})`);
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
                    model: SalePayment,
                    as: 'salePayments',
                    required: false,
                    include: [{ model: Payment, as: 'paymentMethod', required: false }]
                },
                {
                    model: TicketLine,
                    as: 'ticketLines',
                    include: [
                        { model: Product, as: 'product', required: false },
                        { model: Promotion, as: 'promotion', required: false },
                        { model: Card, as: 'cards', required: false }
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
            const { status, cancelReason, updateUserId } = req.body;

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
            // Track cancel userID
            let cancelUserId = null
            if (status === 'cancel') {
                cancelUserId = updateUserId;
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

            if (status === 'cancel' || status === 'void') {
                logger.info(`=== ${status.toUpperCase()}ING TICKET ${id} ===`);

                await ticket.update({
                    status,
                    paymentStatus: status,
                    notes: cancelReason || `${status.charAt(0).toUpperCase() + status.slice(1)}ed`,
                    cancelUserId,
                }, { transaction });

                logger.info(`✓ Ticket ${id} status updated to ${status}`);

                try {
                    await releaseCardsForTicket(id, transaction);
                    logger.info(`✓ Cards released successfully for ticket ${id}`);
                } catch (reversalError) {
                    logger.error(`Error releasing cards: ${reversalError.message}`);
                    await transaction.rollback();
                    return res.status(500).json({
                        success: false,
                        message: `Error releasing cards during ticket ${status}`,
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

            const responseMessage = (status === 'cancel' || status === 'void')
                ? `Ticket ${status}ed and cards released successfully`
                : 'Ticket status updated successfully';

            res.status(200).json({
                success: true,
                message: responseMessage,
                data: {
                    ticket,
                    reversal: null
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
            const { payments, paymentStatus, paymentId } = req.body;

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

            if (paymentStatus === 'paid') {
                updateData.status = 'paid';

                // Clear any existing payments for this ticket first
                await SalePayment.destroy({
                    where: { ticketId: id },
                    transaction: t
                });

                if (payments && Array.isArray(payments) && payments.length > 0) {
                    // Create all multi-payment rows
                    const paymentRows = payments.map(p => ({
                        ticketId: id,
                        paymentId: p.paymentId,
                        amount: parseFloat(p.amount || 0),
                        referenceNo: p.referenceNo || '',
                        isActive: true
                    }));
                    await SalePayment.bulkCreate(paymentRows, { transaction: t });

                    // Set first payment ID to the main ticket table for backward compatibility
                    updateData.paymentId = payments[0].paymentId;
                } else {
                    // Legacy single payment method fallback
                    const finalPaymentId = paymentId || ticket.paymentId || 1; // Default to Cash (1)
                    await SalePayment.create({
                        ticketId: id,
                        paymentId: finalPaymentId,
                        amount: parseFloat(ticket.total || 0),
                        referenceNo: 'Legacy Single Payment',
                        isActive: true
                    }, { transaction: t });

                    updateData.paymentId = finalPaymentId;
                }
            } else {
                // If status is reverted from paid, clean up the payment transactions
                await SalePayment.destroy({
                    where: { ticketId: id },
                    transaction: t
                });
            }

            // If paymentStatus is paid, ensure the table status is updated to cleaning and released
            if (paymentStatus === 'paid' && ticket.tableId) {
                const table = await Table.findByPk(ticket.tableId, { transaction: t });
                if (table) {
                    await table.update({
                        status: 'cleaning',
                        currentOrderId: null,
                        timeOccupied: null
                    }, { transaction: t });
                    logger.info(`✓ Table ${table.id} status updated to cleaning due to updatePaymentStatus paid`);
                }
            }

            await ticket.update(updateData, { transaction: t });

            await t.commit();

            // Fetch the updated ticket with the complete nested payments list
            const updatedTicket = await Ticket.findByPk(id, {
                include: [
                    { model: Table, as: 'table', required: false },
                    { model: Client, as: 'client', required: false },
                    { model: Payment, as: 'payment', required: false },
                    {
                        model: SalePayment,
                        as: 'salePayments',
                        required: false,
                        include: [{ model: Payment, as: 'paymentMethod', required: false }]
                    },
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Product, as: 'product', required: false },
                            { model: Promotion, as: 'promotion', required: false },
                            { model: Card, as: 'cards', required: false }
                        ]
                    }
                ]
            });

            res.status(200).json({
                success: true,
                message: 'Payment status updated successfully',
                data: {
                    ticket: updatedTicket,
                    sale: null
                }
            });

        } catch (error) {
            try {
                await t.rollback();
            } catch (rollbackError) {
                // Ignore rollback error if already finished
            }
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

            await releaseCardsForTicket(id, transaction);

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
            const { startDate, endDate, locationId } = req.query;

            let dateCondition = {};
            if (startDate || endDate) {
                dateCondition.createdAt = {};
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    dateCondition.createdAt[Op.gte] = start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateCondition.createdAt[Op.lte] = end;
                }
            }

            if (locationId) dateCondition.locationId = locationId;

            const tickets = await Ticket.findAll({
                where: {
                    ...dateCondition,
                    paymentStatus: 'paid'
                },
                attributes: [
                    'id', 'total', 'subtotal', 'tax', 'promotionDiscount', 'createdAt'
                ]
            });

            const totalRevenue = tickets.reduce((sum, t) => sum + parseFloat(t.total || 0), 0);
            const totalTax = tickets.reduce((sum, t) => sum + parseFloat(t.tax || 0), 0);
            const totalSubtotal = tickets.reduce((sum, t) => sum + parseFloat(t.subtotal || 0), 0);
            const totalDiscount = tickets.reduce((sum, t) => sum + parseFloat(t.promotionDiscount || 0), 0);

            res.status(200).json({
                success: true,
                data: {
                    totalTickets: tickets.length,
                    totalRevenue: totalRevenue.toFixed(2),
                    totalSubtotal: totalSubtotal.toFixed(2),
                    totalTax: totalTax.toFixed(2),
                    totalDiscount: totalDiscount.toFixed(2),
                    averageTicketValue: tickets.length > 0 ? (totalRevenue / tickets.length).toFixed(2) : '0.00'
                }
            });
        } catch (error) {
            logger.error(`Error generating sales report: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'Error generating sales report',
                error: error.message
            });
        }
    },

    // 2. Top Selling Products
    getTopProductsReport: async (req, res) => {
        try {
            const { startDate, endDate, locationId, limit = 10 } = req.query;

            let dateCondition = {};
            if (startDate || endDate) {
                dateCondition.createdAt = {};
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    dateCondition.createdAt[Op.gte] = start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateCondition.createdAt[Op.lte] = end;
                }
            }
            if (locationId) dateCondition.locationId = locationId;

            const topProducts = await TicketLine.findAll({
                attributes: [
                    'productId',
                    [fn('SUM', col('quantity')), 'totalQuantity'],
                    [fn('SUM', col('totalPrice')), 'totalRevenue']
                ],
                include: [
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'pro_name', ['pro_id', 'pro_code']]
                    },
                    {
                        model: Ticket,
                        as: 'ticket',
                        where: {
                            ...dateCondition,
                            paymentStatus: 'paid'
                        },
                        attributes: []
                    }
                ],
                group: ['productId', 'product.id'],
                order: [[literal('totalQuantity'), 'DESC']],
                limit: parseInt(limit)
            });

            res.status(200).json({
                success: true,
                data: topProducts
            });
        } catch (error) {
            logger.error(`Error generating top products report: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'Error generating top products report',
                error: error.message
            });
        }
    },

    // 3. Payment Methods Distribution
    getPaymentMethodsReport: async (req, res) => {
        try {
            const { startDate, endDate, locationId } = req.query;

            let dateCondition = {};
            if (startDate || endDate) {
                dateCondition.createdAt = {};
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    dateCondition.createdAt[Op.gte] = start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateCondition.createdAt[Op.lte] = end;
                }
            }
            if (locationId) dateCondition.locationId = locationId;

            const paymentSummary = await SalePayment.findAll({
                include: [
                    {
                        model: Ticket,
                        as: 'ticket',
                        where: {
                            ...dateCondition,
                            paymentStatus: 'paid'
                        },
                        attributes: []
                    },
                    {
                        model: Payment,
                        as: 'paymentMethod',
                        attributes: ['id', ['payment_name', 'name'], ['payment_code', 'code']]
                    }
                ],
                attributes: [
                    'paymentId',
                    [fn('COUNT', col('salePayment.ticketId')), 'ticketCount'],
                    [fn('SUM', col('amount')), 'totalAmount']
                ],
                group: ['paymentId', 'paymentMethod.id'],
                order: [[literal('totalAmount'), 'DESC']]
            });

            // Map paymentMethod to payment for backward compatibility with frontend clients
            const responseData = paymentSummary.map(item => {
                const itemJson = item.toJSON();
                if (itemJson.paymentMethod) {
                    itemJson.payment = itemJson.paymentMethod;
                } else {
                    itemJson.payment = null;
                }
                return itemJson;
            });

            res.status(200).json({
                success: true,
                data: responseData
            });
        } catch (error) {
            logger.error(`Error generating payment methods report: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'Error generating payment methods report',
                error: error.message
            });
        }
    },

    // 3b. Daily Ticket Sale Summary
    getDailySummaryReport: async (req, res) => {
        try {
            let { fromDate, toDate, locationId } = req.query;
            if (!fromDate || !toDate) {
                const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth();
                fromDate = fromDate || beginningOfMonthString;
                toDate = toDate || lastDayOfMonthString;
            }

            let dateCondition = {};
            dateCondition.createdAt = {
                [Op.gte]: new Date(fromDate + ' 00:00:00'),
                [Op.lte]: new Date(toDate + ' 23:59:59')
            };

            if (locationId) {
                dateCondition.locationId = locationId;
            }

            const summary = await SalePayment.findAll({
                include: [
                    {
                        model: Ticket,
                        as: 'ticket',
                        where: {
                            ...dateCondition,
                            paymentStatus: 'paid'
                        },
                        attributes: []
                    },
                    {
                        model: Payment,
                        as: 'paymentMethod',
                        attributes: ['id', ['payment_name', 'name'], ['payment_code', 'code']]
                    }
                ],
                attributes: [
                    [literal('DATE(`ticket`.`createdAt`)'), 'bookingDate'],
                    'paymentId',
                    [fn('SUM', col('amount')), 'totalAmount'],
                    [fn('COUNT', col('salePayment.ticketId')), 'transactionCount']
                ],
                group: [literal('DATE(`ticket`.`createdAt`)'), 'paymentId', literal('`paymentMethod`.`id`')],
                order: [[literal('bookingDate'), 'DESC'], ['paymentId', 'ASC']]
            });

            // Map standard format to match Minimart daily summary report exactly
            const responseData = summary.map(item => {
                const itemJson = item.toJSON();
                const payment = itemJson.paymentMethod || {};
                
                let formattedDate = itemJson.bookingDate;
                if (formattedDate) {
                    if (formattedDate instanceof Date) {
                        const offset = formattedDate.getTimezoneOffset();
                        const localDate = new Date(formattedDate.getTime() - (offset * 60 * 1000));
                        formattedDate = localDate.toISOString().split('T')[0];
                    } else if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
                        formattedDate = formattedDate.split('T')[0];
                    }
                }

                return {
                    bookingDate: formattedDate,
                    currencyCode: 'LAK',
                    currencySymbol: '₭',
                    paymentType: payment.name || 'Unknown',
                    paymentCode: payment.code || 'UNKNOWN',
                    totalAmount: parseFloat(itemJson.totalAmount || 0),
                    transactionCount: parseInt(itemJson.transactionCount || 0)
                };
            });

            res.status(200).json(responseData);
        } catch (error) {
            logger.error(`Error generating daily ticket summary report: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'Error generating daily ticket summary report',
                error: error.message
            });
        }
    },

    // 4. Hourly Sales Analysis
    getHourlySalesReport: async (req, res) => {
        try {
            const { startDate, endDate, locationId } = req.query;

            let dateCondition = {};
            if (startDate || endDate) {
                dateCondition.createdAt = {};
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    dateCondition.createdAt[Op.gte] = start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateCondition.createdAt[Op.lte] = end;
                }
            }
            if (locationId) dateCondition.locationId = locationId;

            const hourlySales = await Ticket.findAll({
                where: {
                    ...dateCondition,
                    paymentStatus: 'paid'
                },
                attributes: [
                    [fn('HOUR', col('createdAt')), 'hour'],
                    [fn('COUNT', col('id')), 'ticketCount'],
                    [fn('SUM', col('total')), 'totalAmount']
                ],
                group: [fn('HOUR', col('createdAt'))],
                order: [[literal('hour'), 'ASC']]
            });

            res.status(200).json({
                success: true,
                data: hourlySales
            });
        } catch (error) {
            logger.error(`Error generating hourly sales report: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'Error generating hourly sales report',
                error: error.message
            });
        }
    },

    // 5. Staff Performance Report
    getStaffPerformanceReport: async (req, res) => {
        try {
            const { startDate, endDate, locationId } = req.query;

            let dateCondition = {};
            if (startDate || endDate) {
                dateCondition.createdAt = {};
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    dateCondition.createdAt[Op.gte] = start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateCondition.createdAt[Op.lte] = end;
                }
            }
            if (locationId) dateCondition.locationId = locationId;

            const staffPerformance = await Ticket.findAll({
                where: {
                    ...dateCondition,
                    paymentStatus: 'paid'
                },
                attributes: [
                    'createUserId',
                    [fn('COUNT', col('ticket.id')), 'ticketCount'],
                    [fn('SUM', col('total')), 'totalAmount']
                ],
                include: [
                    {
                        model: User,
                        as: 'createUser',
                        attributes: ['id', ['cus_name', 'username']]
                    }
                ],
                group: ['createUserId', 'createUser.id'],
                order: [[literal('totalAmount'), 'DESC']]
            });

            res.status(200).json({
                success: true,
                data: staffPerformance
            });
        } catch (error) {
            logger.error(`Error generating staff performance report: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'Error generating staff performance report',
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
                        model: SalePayment,
                        as: 'salePayments',
                        required: false,
                        include: [{ model: Payment, as: 'paymentMethod', required: false }]
                    },
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Product, as: 'product', required: false },
                            { model: Promotion, as: 'promotion', required: false },
                            { model: Card, as: 'cards', required: false }
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
                include: [
                    {
                        model: SalePayment,
                        as: 'salePayments',
                        required: false,
                        include: [{ model: Payment, as: 'paymentMethod', required: false }]
                    },
                    {
                        model: TicketLine,
                        as: 'ticketLines',
                        include: [
                            { model: Product, as: 'product', required: false },
                            { model: Promotion, as: 'promotion', required: false },
                            { model: Card, as: 'cards', required: false }
                        ]
                    }
                ],
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