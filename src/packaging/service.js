const logger = require('../api/logger');
const {
    sequelize,
    productPackaging,
    customerPackagingLedger,
    supplierPackagingLedger,
    packagingDamageLog,
    product,
    client,
    vendor,
    card,
    location,
    unit
} = require('../models');
const { Op } = require('sequelize');
const cardService = require('../card/service');

const packagingService = {
    // =========================================================================
    // 1. PRODUCT PACKAGING DEFINITION (BOM)
    // =========================================================================
    /**
     * Get packaging configuration for a finished product (e.g. Beerlao Case)
     */
    getProductPackaging: async (productId) => {
        try {
            return await productPackaging.findAll({
                where: { productId, isActive: true },
                include: [
                    {
                        model: product,
                        as: 'packagingProduct',
                        attributes: ['id', 'pro_name', 'pro_price', 'barCode', 'isPackagingAsset']
                    }
                ]
            });
        } catch (error) {
            logger.error(`Error fetching product packaging for product ${productId}: ${error.message}`);
            throw error;
        }
    },

    /**
     * Get all active packaging asset products (crates, bottles)
     */
    getPackagingAssets: async (companyId = 1) => {
        try {
            return await product.findAll({
                where: { isPackagingAsset: true, isActive: true },
                attributes: ['id', 'pro_name', 'pro_price', 'barCode', 'cost_price']
            });
        } catch (error) {
            logger.error(`Error in getPackagingAssets: ${error.message}`);
            throw error;
        }
    },

    /**
     * Save/update packaging components for a product
     */
    saveProductPackaging: async (productId, packagings = [], companyId, t = null) => {
        const execute = async (transaction) => {
            // Deactivate existing packaging configs
            await productPackaging.update(
                { isActive: false },
                { where: { productId }, transaction }
            );

            if (!packagings || packagings.length === 0) return [];

            const recordsToCreate = packagings.map(item => ({
                productId,
                packagingProductId: item.packagingProductId,
                quantity: item.quantity || 1,
                depositPrice: item.depositPrice || 0,
                companyId: companyId || 1,
                isActive: true
            }));

            const created = await productPackaging.bulkCreate(recordsToCreate, { transaction });

            // Mark parent product as returnable packaging
            await product.update(
                { isReturnablePackaging: true },
                { where: { id: productId }, transaction }
            );

            // Mark each packaging child product as a packaging asset
            const packagingAssetIds = packagings.map(p => p.packagingProductId);
            if (packagingAssetIds.length > 0) {
                await product.update(
                    { isPackagingAsset: true },
                    { where: { id: { [Op.in]: packagingAssetIds } }, transaction }
                );
            }

            return created;
        };

        if (t) {
            return await execute(t);
        } else {
            return await sequelize.transaction(execute);
        }
    },

    // =========================================================================
    // 2. WHOLESALE & CUSTOMER PACKAGING DEBT LEDGER
    // =========================================================================
    /**
     * Record a customer packaging movement (Delivery out, Empties returned in, Deposit paid/refunded)
     */
    recordCustomerPackaging: async ({
        clientId,
        saleHeaderId = null,
        packagingProductId,
        transactionType, // 'DELIVERED_OUT' | 'RETURNED_IN' | 'PAID_DEPOSIT' | 'REFUNDED_DEPOSIT' | 'WRITE_OFF'
        qtyChange,       // (+) Customer owes more, (-) Customer returned
        depositAmount = 0,
        notes = null,
        userId = 1,
        companyId = 1
    }, t = null) => {
        const execute = async (transaction) => {
            // Find current latest balance for this client and this packaging product
            const latestEntry = await customerPackagingLedger.findOne({
                where: { clientId, packagingProductId },
                order: [['id', 'DESC']],
                transaction
            });

            const currentBalance = latestEntry ? latestEntry.balanceAfter : 0;
            const newBalance = currentBalance + qtyChange;

            const entry = await customerPackagingLedger.create({
                clientId,
                saleHeaderId,
                packagingProductId,
                transactionType,
                qtyChange,
                balanceAfter: newBalance,
                depositAmount,
                notes,
                userId,
                companyId
            }, { transaction });

            logger.info(`Recorded customer packaging: Client ${clientId}, Product ${packagingProductId}, Change ${qtyChange}, New Balance ${newBalance}`);
            return entry;
        };

        if (t) {
            return await execute(t);
        } else {
            return await sequelize.transaction(execute);
        }
    },

    /**
     * Get current packaging balance summary for a wholesale client
     */
    getCustomerPackagingBalance: async (clientId) => {
        try {
            if (!clientId || clientId === 'all') {
                return await packagingService.getAllCustomersPackagingSummary();
            }

            // Query latest balance per packaging product for this client
            const query = `
                SELECT 
                    cpl.packagingProductId,
                    p.pro_name AS packagingName,
                    p.barCode,
                    cpl.balanceAfter AS balanceOwed,
                    cpl.updateTimestamp AS lastUpdated
                FROM customer_packaging_ledger cpl
                INNER JOIN (
                    SELECT packagingProductId, MAX(id) AS maxId
                    FROM customer_packaging_ledger
                    WHERE clientId = :clientId
                    GROUP BY packagingProductId
                ) latest ON cpl.id = latest.maxId
                INNER JOIN product p ON cpl.packagingProductId = p.id
                WHERE cpl.balanceAfter != 0
            `;

            const balances = await sequelize.query(query, {
                replacements: { clientId },
                type: sequelize.QueryTypes.SELECT
            });

            return balances;
        } catch (error) {
            logger.error(`Error fetching packaging balance for client ${clientId}: ${error.message}`);
            throw error;
        }
    },

    /**
     * Get all clients packaging balances summary
     */
    getAllCustomersPackagingSummary: async (companyId = 1) => {
        try {
            const query = `
                SELECT 
                    cpl.clientId,
                    cl.name AS clientName,
                    cl.company AS clientCompany,
                    cl.telephone AS clientPhone,
                    cpl.packagingProductId,
                    p.pro_name AS packagingName,
                    p.barCode,
                    cpl.balanceAfter AS balanceOwed,
                    cpl.updateTimestamp AS lastUpdated
                FROM customer_packaging_ledger cpl
                INNER JOIN (
                    SELECT clientId, packagingProductId, MAX(id) AS maxId
                    FROM customer_packaging_ledger
                    GROUP BY clientId, packagingProductId
                ) latest ON cpl.id = latest.maxId
                INNER JOIN client cl ON cpl.clientId = cl.id
                INNER JOIN product p ON cpl.packagingProductId = p.id
                WHERE cpl.balanceAfter != 0
                ORDER BY cl.name ASC, p.pro_name ASC
            `;

            return await sequelize.query(query, {
                type: sequelize.QueryTypes.SELECT
            });
        } catch (error) {
            logger.error(`Error fetching all customers packaging summary: ${error.message}`);
            throw error;
        }
    },

    /**
     * Get customer packaging transaction ledger statement
     */
    getCustomerPackagingLedger: async (clientId = null, startDate = null, endDate = null) => {
        try {
            const whereCondition = {};
            if (clientId && clientId !== 'all') {
                whereCondition.clientId = clientId;
            }
            if (startDate && endDate) {
                whereCondition.createdAt = {
                    [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
                };
            }

            return await customerPackagingLedger.findAll({
                where: whereCondition,
                include: [
                    {
                        model: product,
                        as: 'packagingProduct',
                        attributes: ['id', 'pro_name', 'barCode']
                    },
                    {
                        model: client,
                        as: 'client',
                        attributes: ['id', 'name', 'company', 'telephone']
                    }
                ],
                order: [['id', 'DESC']]
            });
        } catch (error) {
            logger.error(`Error fetching customer packaging ledger for client ${clientId}: ${error.message}`);
            throw error;
        }
    },

    /**
     * Process standalone wholesale empties return (driver collects empties on route)
     */
    processWholesaleEmptiesReturn: async ({
        clientId,
        returnedItems = [], // [{ packagingProductId, quantity, depositRefundAmount }]
        locationId = 1,
        userId = 1,
        companyId = 1,
        notes = 'Wholesale route empties pickup'
    }) => {
        return await sequelize.transaction(async (t) => {
            const results = [];

            for (const item of returnedItems) {
                const qty = parseInt(item.quantity, 10);
                if (qty <= 0) continue;

                // 1. Credit customer packaging debt
                const ledgerEntry = await packagingService.recordCustomerPackaging({
                    clientId,
                    packagingProductId: item.packagingProductId,
                    transactionType: 'RETURNED_IN',
                    qtyChange: -qty, // Reduces debt
                    depositAmount: item.depositRefundAmount || 0,
                    notes,
                    userId,
                    companyId
                }, t);

                // 2. Increase empty crate/bottle inventory via stock cards
                await cardService.cardUtility([
                    {
                        productId: item.packagingProductId,
                        quantity: qty,
                        qty: qty,
                        rate: 1,
                        price: 0
                    }
                ], locationId, 1, t);

                results.push(ledgerEntry);
            }

            return results;
        });
    },

    // =========================================================================
    // 3. UPSTREAM SUPPLIER (BEERLAO FACTORY) LEDGER & TRUCK RETURNS
    // =========================================================================
    /**
     * Record movement with Beerlao Factory (Receiving full stock or returning empties to truck)
     */
    recordSupplierPackaging: async ({
        vendorId,
        receivingHeaderId = null,
        manifestNo = null,
        packagingProductId,
        transactionType, // 'RECEIVED_FULL' | 'RETURNED_EMPTY_TRUCK' | 'FACTORY_ADJUSTMENT'
        qtyChange,       // (+) Received from factory, (-) Handed to truck
        notes = null,
        userId = 1,
        companyId = 1
    }, t = null) => {
        const execute = async (transaction) => {
            const latestEntry = await supplierPackagingLedger.findOne({
                where: { vendorId, packagingProductId },
                order: [['id', 'DESC']],
                transaction
            });

            const currentBalance = latestEntry ? latestEntry.balanceAfter : 0;
            const newBalance = currentBalance + qtyChange;

            const entry = await supplierPackagingLedger.create({
                vendorId,
                receivingHeaderId,
                manifestNo,
                packagingProductId,
                transactionType,
                qtyChange,
                balanceAfter: newBalance,
                notes,
                userId,
                companyId
            }, { transaction });

            logger.info(`Recorded supplier packaging: Vendor ${vendorId}, Product ${packagingProductId}, Change ${qtyChange}, New Balance ${newBalance}`);
            return entry;
        };

        if (t) {
            return await execute(t);
        } else {
            return await sequelize.transaction(execute);
        }
    },

    /**
     * Get running packaging balance with Lao Brewery Co.
     */
    getSupplierPackagingBalance: async (vendorId) => {
        try {
            const query = `
                SELECT 
                    spl.packagingProductId,
                    p.pro_name AS packagingName,
                    p.barCode,
                    spl.balanceAfter AS balanceWithFactory,
                    spl.updateTimestamp AS lastUpdated
                FROM supplier_packaging_ledger spl
                INNER JOIN (
                    SELECT packagingProductId, MAX(id) AS maxId
                    FROM supplier_packaging_ledger
                    WHERE vendorId = :vendorId
                    GROUP BY packagingProductId
                ) latest ON spl.id = latest.maxId
                INNER JOIN product p ON spl.packagingProductId = p.id
            `;

            return await sequelize.query(query, {
                replacements: { vendorId },
                type: sequelize.QueryTypes.SELECT
            });
        } catch (error) {
            logger.error(`Error fetching supplier packaging balance for vendor ${vendorId}: ${error.message}`);
            throw error;
        }
    },

    /**
     * Process Truck Empties Return Manifest to Beerlao Factory Driver
     */
    processTruckEmptiesReturn: async ({
        vendorId,
        manifestNo,
        returnedItems = [], // [{ packagingProductId, quantity }]
        locationId = 1,
        userId = 1,
        companyId = 1,
        notes = null
    }) => {
        return await sequelize.transaction(async (t) => {
            const results = [];

            for (const item of returnedItems) {
                const qty = parseInt(item.quantity, 10);
                if (qty <= 0) continue;

                // 1. Record in supplier packaging ledger (reduces liability with Beerlao)
                const entry = await packagingService.recordSupplierPackaging({
                    vendorId,
                    manifestNo,
                    packagingProductId: item.packagingProductId,
                    transactionType: 'RETURNED_EMPTY_TRUCK',
                    qtyChange: -qty, // Handed back to factory
                    notes,
                    userId,
                    companyId
                }, t);

                // 2. Deduct empty crates/bottles from warehouse stock cards
                // Find available cards to consume
                const cardsToConsume = await card.findAll({
                    where: {
                        productId: item.packagingProductId,
                        locationId,
                        card_isused: 0,
                        isActive: true
                    },
                    limit: qty,
                    transaction: t
                });

                if (cardsToConsume.length > 0) {
                    const cardIds = cardsToConsume.map(c => c.id);
                    await card.update(
                        { card_isused: 1, isActive: false },
                        { where: { id: { [Op.in]: cardIds } }, transaction: t }
                    );
                }

                results.push(entry);
            }

            return results;
        });
    },

    // =========================================================================
    // 4. RETAIL MINIMART POS EMPTIES RETURN & DEPOSIT REFUND
    // =========================================================================
    /**
     * Process walk-in customer empties return and refund cash/deposit
     */
    processPOSReturn: async ({
        clientId = null,
        customerPhone = null,
        customerName = null,
        returnedItems = [], // [{ packagingProductId, quantity, depositPrice }]
        locationId = 1,
        terminalId = null,
        userId = 1,
        companyId = 1,
        notes = 'POS Retail Empties Return'
    }) => {
        return await sequelize.transaction(async (t) => {
            let totalRefundAmount = 0;
            const processedItems = [];

            // Resolve customer ID
            let resolvedClientId = clientId;
            if (!resolvedClientId && customerPhone) {
                let clientRecord = await client.findOne({
                    where: { telephone: customerPhone },
                    transaction: t
                });

                if (!clientRecord && (customerName || customerPhone)) {
                    clientRecord = await client.create({
                        name: customerName || `Walk-in ${customerPhone}`,
                        telephone: customerPhone,
                        companyId
                    }, { transaction: t });
                }

                if (clientRecord) {
                    resolvedClientId = clientRecord.id;
                }
            }

            for (const item of returnedItems) {
                const qty = parseInt(item.quantity, 10);
                const rate = parseFloat(item.depositPrice) || 0;
                const refundLineTotal = qty * rate;
                totalRefundAmount += refundLineTotal;

                // 1. Record in customer packaging ledger
                if (resolvedClientId) {
                    await packagingService.recordCustomerPackaging({
                        clientId: resolvedClientId,
                        packagingProductId: item.packagingProductId,
                        transactionType: 'RETURNED_IN',
                        qtyChange: -qty, // Reduces debt balance (-)
                        depositAmount: refundLineTotal,
                        notes,
                        userId,
                        companyId
                    }, t);
                }

                // 2. Increment empty crate/bottle inventory in store
                await cardService.cardUtility([
                    {
                        productId: item.packagingProductId,
                        quantity: qty,
                        qty: qty,
                        rate: 1,
                        price: 0
                    }
                ], locationId, 1, t);

                processedItems.push({
                    packagingProductId: item.packagingProductId,
                    quantity: qty,
                    depositPrice: rate,
                    lineTotal: refundLineTotal
                });
            }

            return {
                success: true,
                totalRefundAmount,
                items: processedItems,
                timestamp: new Date()
            };
        });
    },

    /**
     * Process packaging delivery upon POS checkout (Wholesale customer debt & Retail deposit tracking)
     */
    processPOSSale: async ({
        saleHeaderId = null,
        clientId = null,
        clientName = null,
        clientPhone = null,
        items = [], // [{ packagingProductId, quantity, depositPrice, totalDeposit }]
        locationId = 1,
        userId = 1,
        companyId = 1,
        transactionType = 'DELIVERED_OUT',
        notes = null
    }) => {
        return await sequelize.transaction(async (t) => {
            const results = [];

            // If clientId is provided or customerPhone provided, resolve client
            let resolvedClientId = clientId;
            if (!resolvedClientId && clientPhone) {
                let clientRecord = await client.findOne({
                    where: { telephone: clientPhone },
                    transaction: t
                });
                if (!clientRecord && clientName) {
                    clientRecord = await client.create({
                        name: clientName,
                        telephone: clientPhone,
                        companyId
                    }, { transaction: t });
                }
                if (clientRecord) {
                    resolvedClientId = clientRecord.id;
                }
            }

            for (const item of items) {
                const qty = parseInt(item.quantity, 10);
                if (qty <= 0) continue;
                const depositRate = parseFloat(item.depositPrice) || 0;
                const totalDeposit = parseFloat(item.totalDeposit) || (qty * depositRate);

                if (resolvedClientId) {
                    const entry = await packagingService.recordCustomerPackaging({
                        clientId: resolvedClientId,
                        saleHeaderId,
                        packagingProductId: item.packagingProductId,
                        transactionType: transactionType || 'DELIVERED_OUT',
                        qtyChange: qty, // Customer owes packaging (+)
                        depositAmount: totalDeposit,
                        notes: notes || `POS Sale #${saleHeaderId}`,
                        userId,
                        companyId
                    }, t);
                    results.push(entry);
                }
            }

            return {
                success: true,
                recordedItemsCount: results.length,
                data: results
            };
        });
    },

    // =========================================================================
    // 5. PACKAGING DAMAGE & LOSS LOGGING (Breakages / Crushed Crates)
    // =========================================================================
    /**
     * Log broken bottles or damaged crates and adjust warehouse stock
     */
    recordDamageLog: async ({
        packagingProductId,
        quantity,
        reason, // 'DELIVERY_BREAKAGE' | 'WAREHOUSE_DAMAGE' | 'FACTORY_REJECT'
        notes = null,
        locationId = 1,
        userId = 1,
        companyId = 1
    }) => {
        return await sequelize.transaction(async (t) => {
            const qty = parseInt(quantity, 10);

            // 1. Create damage log record
            const logEntry = await packagingDamageLog.create({
                packagingProductId,
                quantity: qty,
                reason,
                notes,
                userId,
                locationId,
                companyId
            }, { transaction: t });

            // 2. Deduct damaged stock cards from inventory
            const cardsToConsume = await card.findAll({
                where: {
                    productId: packagingProductId,
                    locationId,
                    card_isused: 0,
                    isActive: true
                },
                limit: qty,
                transaction: t
            });

            if (cardsToConsume.length > 0) {
                const cardIds = cardsToConsume.map(c => c.id);
                await card.update(
                    { card_isused: 1, isActive: false },
                    { where: { id: { [Op.in]: cardIds } }, transaction: t }
                );
            }

            return logEntry;
        });
    },

    getDamageLogs: async (startDate = null, endDate = null, companyId = 1) => {
        try {
            const whereCondition = { companyId };
            if (startDate && endDate) {
                whereCondition.createdAt = {
                    [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
                };
            }

            return await packagingDamageLog.findAll({
                where: whereCondition,
                include: [
                    {
                        model: product,
                        as: 'packagingProduct',
                        attributes: ['id', 'pro_name', 'barCode']
                    }
                ],
                order: [['id', 'DESC']]
            });
        } catch (error) {
            logger.error(`Error fetching damage logs: ${error.message}`);
            throw error;
        }
    },

    // =========================================================================
    // 6. MASTER PACKAGING RECONCILIATION MATRIX
    // =========================================================================
    /**
     * Calculates the complete 360-degree packaging balance for the Agency:
     * Full Cases on Hand + Empties on Hand + Wholesale Debt + Retail Deposits - Factory Quota
     */
    getMasterPackagingMatrix: async (companyId = 1, locationId = 1) => {
        try {
            // 1. Get all packaging asset products (crates, bottles)
            const packagingAssets = await product.findAll({
                where: { isPackagingAsset: true, isActive: true },
                attributes: ['id', 'pro_name', 'barCode']
            });

            const matrix = [];

            for (const asset of packagingAssets) {
                const assetId = asset.id;

                // A. Physical empty stock in warehouse
                const emptyStockCards = await card.count({
                    where: {
                        productId: assetId,
                        locationId,
                        card_isused: 0,
                        isActive: true
                    }
                });

                // B. Packaging embedded in full cases on shelf
                // Find all finished cases containing this packaging asset
                const packagings = await productPackaging.findAll({
                    where: { packagingProductId: assetId, isActive: true }
                });

                let embeddedInFullStock = 0;
                for (const pkg of packagings) {
                    const fullCaseCards = await card.count({
                        where: {
                            productId: pkg.productId,
                            locationId,
                            card_isused: 0,
                            isActive: true
                        }
                    });
                    embeddedInFullStock += fullCaseCards * pkg.quantity;
                }

                // C. Outstanding packaging debt with wholesale customers
                const clientDebtQuery = `
                    SELECT COALESCE(SUM(balanceAfter), 0) AS totalDebt
                    FROM (
                        SELECT cpl.balanceAfter
                        FROM customer_packaging_ledger cpl
                        INNER JOIN (
                            SELECT clientId, MAX(id) AS maxId
                            FROM customer_packaging_ledger
                            WHERE packagingProductId = :assetId
                            GROUP BY clientId
                        ) latest ON cpl.id = latest.maxId
                        WHERE cpl.balanceAfter > 0
                    ) t
                `;
                const [clientDebtResult] = await sequelize.query(clientDebtQuery, {
                    replacements: { assetId },
                    type: sequelize.QueryTypes.SELECT
                });
                const wholesaleDebt = clientDebtResult ? parseInt(clientDebtResult.totalDebt, 10) : 0;

                // D. Total Breakages & Damage
                const totalDamage = await packagingDamageLog.sum('quantity', {
                    where: { packagingProductId: assetId }
                }) || 0;

                // E. Factory Packaging Balance (Liability with Beerlao Company)
                const factoryBalanceQuery = `
                    SELECT COALESCE(balanceAfter, 0) AS factoryBalance
                    FROM supplier_packaging_ledger
                    WHERE packagingProductId = :assetId
                    ORDER BY id DESC
                    LIMIT 1
                `;
                const [factoryResult] = await sequelize.query(factoryBalanceQuery, {
                    replacements: { assetId },
                    type: sequelize.QueryTypes.SELECT
                });
                const factoryLiability = factoryResult ? parseInt(factoryResult.factoryBalance, 10) : 0;

                // Calculate Net Discrepancy
                const totalCalculatedAssets = emptyStockCards + embeddedInFullStock + wholesaleDebt + totalDamage;
                const netVariance = totalCalculatedAssets - factoryLiability;

                matrix.push({
                    productId: assetId,
                    name: asset.pro_name,
                    barCode: asset.barCode,
                    emptyStockWarehouse: emptyStockCards,
                    embeddedInFullCases: embeddedInFullStock,
                    wholesaleCustomerDebt: wholesaleDebt,
                    totalBreakages: totalDamage,
                    totalAssetsOwned: totalCalculatedAssets,
                    factoryLiabilityWithBeerlao: factoryLiability,
                    variance: netVariance
                });
            }

            return matrix;
        } catch (error) {
            logger.error(`Error calculating master packaging matrix: ${error.message}`);
            throw error;
        }
    },

    // =========================================================================
    // 7. OWNER'S PACKAGING & PACKING PRODUCT SALES EXECUTIVE REPORT
    // =========================================================================
    /**
     * Executive sales & buy-back report for Agency Owner:
     * - How much selling for packing products (Finished beer cases, FOC promos, revenue, implicit containers)
     * - How much selling/buying for packaging products directly (Crates/bottles sold vs bought back/refunded)
     * - Customer-specific filtering (all clients, walk-in retail POS, or specific wholesale restaurant)
     */
    getOwnerPackagingSalesReport: async ({
        startDate,
        endDate,
        companyId = 1,
        locationId = 'all',
        clientId = 'all'
    }) => {
        try {
            const startDateTime = startDate ? `${startDate} 00:00:00` : '1970-01-01 00:00:00';
            const endDateTime = endDate ? `${endDate} 23:59:59` : '2099-12-31 23:59:59';

            const baseReplacements = {
                startDateTime,
                endDateTime,
                companyId: parseInt(companyId, 10) || 1
            };

            // Common WHERE clauses for sales
            let saleLocationClause = '';
            if (locationId && locationId !== 'all') {
                saleLocationClause = 'AND sh.locationId = :locationId';
                baseReplacements.locationId = parseInt(locationId, 10);
            }

            let saleClientClause = '';
            let ledgerClientClause = '';
            if (clientId === 'retail') {
                saleClientClause = 'AND sh.clientId IS NULL';
                ledgerClientClause = 'AND 1 = 0'; // Retail cash returns handled via saleLine
            } else if (clientId && clientId !== 'all') {
                const parsedClientId = parseInt(clientId, 10);
                saleClientClause = 'AND sh.clientId = :clientId';
                ledgerClientClause = 'AND cpl.clientId = :clientId';
                baseReplacements.clientId = parsedClientId;
            }

            // 1. QUERY PACKING PRODUCTS SALES (Full beer cases with returnable packaging)
            const packingQuery = `
                SELECT 
                    p.id AS productId,
                    p.pro_name AS productName,
                    p.barCode,
                    COALESCE(p.pro_image_path, '') AS imagePath,
                    COALESCE(curr.code, 'LAK') AS currencyCode,
                    COALESCE(curr.symbol, '₭') AS currencySymbol,
                    COALESCE(SUM(sl.quantity), 0) AS paidQty,
                    COALESCE(SUM(sl.focQty), 0) AS focQty,
                    COALESCE(SUM(sl.quantity + sl.focQty), 0) AS totalCases,
                    COALESCE(SUM(sl.total), 0) AS totalSales
                FROM saleLine sl
                INNER JOIN saleHeader sh ON sl.headerId = sh.id
                INNER JOIN product p ON sl.productId = p.id
                LEFT JOIN currency curr ON sh.currencyId = curr.id
                LEFT JOIN location loc ON sh.locationId = loc.id
                WHERE sh.createdAt BETWEEN :startDateTime AND :endDateTime
                  AND (loc.companyId = :companyId OR loc.companyId IS NULL)
                  AND sh.isActive = 1
                  AND sl.isActive = 1
                  AND p.isReturnablePackaging = 1
                  AND (p.isPackagingAsset = 0 OR p.isPackagingAsset IS NULL)
                  AND sl.packagingAction NOT IN ('SOLD', 'RETURNED')
                  AND sl.isReturn = 0
                  ${saleLocationClause}
                  ${saleClientClause}
                GROUP BY p.id, p.pro_name, p.barCode, p.pro_image_path, curr.code, curr.symbol
                ORDER BY totalSales DESC
            `;

            const packingRows = await sequelize.query(packingQuery, {
                replacements: baseReplacements,
                type: sequelize.QueryTypes.SELECT
            });

            // Calculate implicit packaging dispatched via BOM (product_packagings)
            const productIds = packingRows.map(r => r.productId);
            let packagingBOMs = [];
            if (productIds.length > 0) {
                packagingBOMs = await productPackaging.findAll({
                    where: {
                        productId: { [Op.in]: productIds },
                        isActive: true
                    },
                    include: [
                        {
                            model: product,
                            as: 'packagingProduct',
                            attributes: ['id', 'pro_name', 'barCode', 'isPackagingAsset']
                        }
                    ]
                });
            }

            // Map BOM ratios to packing rows
            let totalDispatchedCrates = 0;
            let totalDispatchedBottles = 0;

            const packingProducts = packingRows.map(row => {
                const boms = packagingBOMs.filter(b => b.productId === row.productId);
                let cratesPerCase = 0;
                let bottlesPerCase = 0;

                for (const bom of boms) {
                    const name = (bom.packagingProduct?.pro_name || '').toLowerCase();
                    if (name.includes('ລັງ') || name.includes('crate')) {
                        cratesPerCase += bom.quantity;
                    } else if (name.includes('ແກ້ວ') || name.includes('ຂວດ') || name.includes('bottle')) {
                        bottlesPerCase += bom.quantity;
                    }
                }

                // If not explicitly configured, fallback to standard: 1 Crate, 24 Bottles
                if (cratesPerCase === 0 && bottlesPerCase === 0) {
                    cratesPerCase = 1;
                    bottlesPerCase = 24;
                }

                const totalCases = parseFloat(row.totalCases) || 0;
                const dispatchedCrates = Math.round(totalCases * cratesPerCase);
                const dispatchedBottles = Math.round(totalCases * bottlesPerCase);

                totalDispatchedCrates += dispatchedCrates;
                totalDispatchedBottles += dispatchedBottles;

                return {
                    productId: row.productId,
                    productName: row.productName,
                    barCode: row.barCode,
                    imagePath: row.imagePath,
                    currencyCode: row.currencyCode,
                    currencySymbol: row.currencySymbol,
                    paidQty: parseFloat(row.paidQty) || 0,
                    focQty: parseFloat(row.focQty) || 0,
                    totalCases: totalCases,
                    totalSales: parseFloat(row.totalSales) || 0,
                    cratesPerCase,
                    bottlesPerCase,
                    dispatchedCrates,
                    dispatchedBottles
                };
            });

            // 2. QUERY PACKAGING ASSETS ACTIVITY (Crates/Bottles sold vs bought back/refunded)
            const packagingAssetsQuery = `
                SELECT 
                    p.id AS productId,
                    p.pro_name AS productName,
                    p.barCode,
                    COALESCE(curr.code, 'LAK') AS currencyCode,
                    COALESCE(curr.symbol, '₭') AS currencySymbol,
                    -- SOLD / DEPOSITED
                    COALESCE(SUM(CASE 
                        WHEN sl.packagingAction = 'SOLD' OR (p.isPackagingAsset = 1 AND sl.isReturn = 0 AND sl.packagingAction != 'RETURNED')
                        THEN sl.quantity ELSE 0 END), 0) AS soldQty,
                    COALESCE(SUM(CASE 
                        WHEN sl.packagingAction = 'SOLD' OR (p.isPackagingAsset = 1 AND sl.isReturn = 0 AND sl.packagingAction != 'RETURNED')
                        THEN sl.total ELSE 0 END), 0) AS soldAmount,
                    -- BOUGHT / REFUNDED
                    COALESCE(SUM(CASE 
                        WHEN sl.packagingAction = 'RETURNED' OR sl.isReturn = 1
                        THEN sl.quantity ELSE 0 END), 0) AS boughtQty,
                    COALESCE(SUM(CASE 
                        WHEN sl.packagingAction = 'RETURNED' OR sl.isReturn = 1
                        THEN ABS(sl.total) ELSE 0 END), 0) AS boughtAmount
                FROM saleLine sl
                INNER JOIN saleHeader sh ON sl.headerId = sh.id
                INNER JOIN product p ON sl.productId = p.id
                LEFT JOIN currency curr ON sh.currencyId = curr.id
                LEFT JOIN location loc ON sh.locationId = loc.id
                WHERE sh.createdAt BETWEEN :startDateTime AND :endDateTime
                  AND (loc.companyId = :companyId OR loc.companyId IS NULL)
                  AND sh.isActive = 1
                  AND sl.isActive = 1
                  AND (p.isPackagingAsset = 1 OR sl.packagingAction IN ('SOLD', 'RETURNED') OR sl.isReturn = 1)
                  ${saleLocationClause}
                  ${saleClientClause}
                GROUP BY p.id, p.pro_name, p.barCode, curr.code, curr.symbol
                ORDER BY p.pro_name ASC
            `;

            const packagingAssetRows = await sequelize.query(packagingAssetsQuery, {
                replacements: baseReplacements,
                type: sequelize.QueryTypes.SELECT
            });

            let totalPackagingSoldAmount = 0;
            let totalPackagingBoughtAmount = 0;
            let totalPackagingSoldQty = 0;
            let totalPackagingBoughtQty = 0;

            const packagingProducts = packagingAssetRows.map(row => {
                const soldQty = parseFloat(row.soldQty) || 0;
                const soldAmount = parseFloat(row.soldAmount) || 0;
                const boughtQty = parseFloat(row.boughtQty) || 0;
                const boughtAmount = parseFloat(row.boughtAmount) || 0;
                const netQty = soldQty - boughtQty;
                const netAmount = soldAmount - boughtAmount;

                totalPackagingSoldQty += soldQty;
                totalPackagingSoldAmount += soldAmount;
                totalPackagingBoughtQty += boughtQty;
                totalPackagingBoughtAmount += boughtAmount;

                return {
                    productId: row.productId,
                    productName: row.productName,
                    barCode: row.barCode,
                    currencyCode: row.currencyCode,
                    currencySymbol: row.currencySymbol,
                    soldQty,
                    soldAmount,
                    boughtQty,
                    boughtAmount,
                    netQty,
                    netAmount
                };
            });

            // 3. WHOLESALE ROUTE PACKAGING LEDGER (Customer debt & empties return events)
            let customerMovements = [];
            let wholesaleReturnedCrates = 0;
            let wholesaleReturnedBottles = 0;

            if (clientId !== 'retail') {
                const ledgerQuery = `
                    SELECT 
                        cpl.id,
                        cpl.createdAt,
                        cpl.clientId,
                        cl.name AS clientName,
                        cl.company AS clientCompany,
                        cl.telephone AS clientTelephone,
                        cpl.saleHeaderId,
                        cpl.packagingProductId,
                        p.pro_name AS packagingName,
                        p.barCode,
                        cpl.transactionType,
                        cpl.qtyChange,
                        cpl.balanceAfter,
                        cpl.depositAmount,
                        cpl.notes
                    FROM customer_packaging_ledger cpl
                    INNER JOIN product p ON cpl.packagingProductId = p.id
                    INNER JOIN client cl ON cpl.clientId = cl.id
                    WHERE cpl.createdAt BETWEEN :startDateTime AND :endDateTime
                      AND cpl.companyId = :companyId
                      ${ledgerClientClause}
                    ORDER BY cpl.id DESC
                    LIMIT 200
                `;

                customerMovements = await sequelize.query(ledgerQuery, {
                    replacements: baseReplacements,
                    type: sequelize.QueryTypes.SELECT
                });

                for (const mov of customerMovements) {
                    if (mov.transactionType === 'RETURNED_IN' && mov.qtyChange < 0) {
                        const name = (mov.packagingName || '').toLowerCase();
                        const qty = Math.abs(mov.qtyChange);
                        if (name.includes('ລັງ') || name.includes('crate')) {
                            wholesaleReturnedCrates += qty;
                        } else if (name.includes('ແກ້ວ') || name.includes('bottle')) {
                            wholesaleReturnedBottles += qty;
                        }
                    }
                }
            }

            // 4. CUSTOMER PROFILE SUMMARY (When specific client selected)
            let customerProfile = null;
            if (clientId && clientId !== 'all' && clientId !== 'retail') {
                const parsedClientId = parseInt(clientId, 10);
                const clientRecord = await client.findByPk(parsedClientId, {
                    attributes: ['id', 'name', 'company', 'telephone', 'address']
                });

                if (clientRecord) {
                    const balances = await packagingService.getCustomerPackagingBalance(parsedClientId);
                    let currentCratesOwed = 0;
                    let currentBottlesOwed = 0;

                    for (const b of balances) {
                        const name = (b.packagingName || '').toLowerCase();
                        const bal = parseInt(b.balanceOwed, 10) || 0;
                        if (name.includes('ລັງ') || name.includes('crate')) {
                            currentCratesOwed += bal;
                        } else if (name.includes('ແກ້ວ') || name.includes('bottle')) {
                            currentBottlesOwed += bal;
                        }
                    }

                    customerProfile = {
                        id: clientRecord.id,
                        name: clientRecord.name,
                        company: clientRecord.company,
                        telephone: clientRecord.telephone,
                        address: clientRecord.address,
                        currentCratesOwed,
                        currentBottlesOwed,
                        balances
                    };
                }
            }

            // 5. EXECUTIVE SUMMARY AGGREGATIONS
            // Group sales revenue by currency
            const revenueByCurrencyMap = {};
            for (const item of packingProducts) {
                const ccy = item.currencyCode || 'LAK';
                if (!revenueByCurrencyMap[ccy]) {
                    revenueByCurrencyMap[ccy] = {
                        currencyCode: ccy,
                        currencySymbol: item.currencySymbol || '₭',
                        totalAmount: 0
                    };
                }
                revenueByCurrencyMap[ccy].totalAmount += item.totalSales;
            }
            const revenueByCurrency = Object.values(revenueByCurrencyMap);

            const totalPaidCases = packingProducts.reduce((sum, p) => sum + p.paidQty, 0);
            const totalFocCases = packingProducts.reduce((sum, p) => sum + p.focQty, 0);
            const totalCasesSold = totalPaidCases + totalFocCases;

            const netPackagingCash = totalPackagingSoldAmount - totalPackagingBoughtAmount;

            // Total empties recovered in the period = (Retail POS buy-backs + Wholesale route returns)
            const totalEmptiesRecoveredUnits = totalPackagingBoughtQty + wholesaleReturnedCrates + wholesaleReturnedBottles;
            const totalDispatchedPackagingUnits = totalDispatchedCrates + totalDispatchedBottles;

            const recoveryRatePercent = totalDispatchedPackagingUnits > 0
                ? Math.min(100, Math.round((totalEmptiesRecoveredUnits / totalDispatchedPackagingUnits) * 1000) / 10)
                : (totalEmptiesRecoveredUnits > 0 ? 100 : 0);

            return {
                filter: {
                    startDate,
                    endDate,
                    locationId,
                    clientId
                },
                customerProfile,
                kpi: {
                    revenueByCurrency,
                    totalPaidCases,
                    totalFocCases,
                    totalCasesSold,
                    totalDispatchedCrates,
                    totalDispatchedBottles,
                    totalPackagingSoldAmount,
                    totalPackagingSoldQty,
                    totalPackagingBoughtAmount,
                    totalPackagingBoughtQty,
                    netPackagingCash,
                    wholesaleReturnedCrates,
                    wholesaleReturnedBottles,
                    totalEmptiesRecoveredUnits,
                    recoveryRatePercent
                },
                packingProducts,
                packagingProducts,
                customerMovements
            };
        } catch (error) {
            logger.error(`Error in getOwnerPackagingSalesReport: ${error.message}`);
            throw error;
        }
    }
};

module.exports = packagingService;
