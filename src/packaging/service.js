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
    }
};

module.exports = packagingService;
