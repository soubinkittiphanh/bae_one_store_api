const packagingService = require('./service');
const logger = require('../api/logger');

const packagingController = {
    // 1. Product Packaging (BOM)
    getProductPackaging: async (req, res) => {
        try {
            const { productId } = req.params;
            const data = await packagingService.getProductPackaging(productId);
            return res.status(200).json(data);
        } catch (error) {
            logger.error(`Error in getProductPackaging: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    getPackagingAssets: async (req, res) => {
        try {
            const companyId = req.user?.companyId || 1;
            const data = await packagingService.getPackagingAssets(companyId);
            return res.status(200).json(data);
        } catch (error) {
            logger.error(`Error in getPackagingAssets: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    saveProductPackaging: async (req, res) => {
        try {
            const { productId } = req.params;
            const { packagings, companyId } = req.body;
            const saved = await packagingService.saveProductPackaging(productId, packagings, companyId || req.user?.companyId || 1);
            return res.status(200).json({ success: true, data: saved });
        } catch (error) {
            logger.error(`Error in saveProductPackaging: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 2. Customer Packaging (Wholesale)
    getCustomerPackagingBalance: async (req, res) => {
        try {
            const clientId = req.params.clientId || req.query.clientId || 'all';
            const data = await packagingService.getCustomerPackagingBalance(clientId);
            return res.status(200).json(data);
        } catch (error) {
            logger.error(`Error in getCustomerPackagingBalance: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    getCustomerPackagingLedger: async (req, res) => {
        try {
            const clientId = req.params.clientId || req.query.clientId || null;
            const { startDate, endDate } = req.query;
            const data = await packagingService.getCustomerPackagingLedger(clientId, startDate, endDate);
            return res.status(200).json(data);
        } catch (error) {
            logger.error(`Error in getCustomerPackagingLedger: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    processWholesaleEmptiesReturn: async (req, res) => {
        try {
            const { clientId, returnedItems, locationId, notes } = req.body;
            const userId = req.user?.id || 1;
            const companyId = req.user?.companyId || 1;

            const results = await packagingService.processWholesaleEmptiesReturn({
                clientId,
                returnedItems,
                locationId: locationId || 1,
                userId,
                companyId,
                notes
            });

            return res.status(201).json({ success: true, data: results });
        } catch (error) {
            logger.error(`Error in processWholesaleEmptiesReturn: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 3. Supplier Packaging (Beerlao Factory)
    getSupplierPackagingBalance: async (req, res) => {
        try {
            const { vendorId } = req.params;
            const data = await packagingService.getSupplierPackagingBalance(vendorId);
            return res.status(200).json(data);
        } catch (error) {
            logger.error(`Error in getSupplierPackagingBalance: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    processTruckEmptiesReturn: async (req, res) => {
        try {
            const { vendorId, manifestNo, returnedItems, locationId, notes } = req.body;
            const userId = req.user?.id || 1;
            const companyId = req.user?.companyId || 1;

            const results = await packagingService.processTruckEmptiesReturn({
                vendorId,
                manifestNo,
                returnedItems,
                locationId: locationId || 1,
                userId,
                companyId,
                notes
            });

            return res.status(201).json({ success: true, data: results });
        } catch (error) {
            logger.error(`Error in processTruckEmptiesReturn: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 4. POS Retail Returns
    processPOSReturn: async (req, res) => {
        try {
            const { clientId, customerPhone, customerName, returnedItems, locationId, terminalId, notes } = req.body;
            const userId = req.user?.id || 1;
            const companyId = req.user?.companyId || 1;

            const result = await packagingService.processPOSReturn({
                clientId,
                customerPhone,
                customerName,
                returnedItems,
                locationId: locationId || 1,
                terminalId,
                userId,
                companyId,
                notes
            });

            return res.status(200).json(result);
        } catch (error) {
            logger.error(`Error in processPOSReturn: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 4.1 POS Sales & Delivery Out
    processPOSSale: async (req, res) => {
        try {
            const { saleHeaderId, clientId, clientName, clientPhone, items, locationId, transactionType, notes } = req.body;
            const userId = req.user?.id || 1;
            const companyId = req.user?.companyId || 1;

            const result = await packagingService.processPOSSale({
                saleHeaderId,
                clientId,
                clientName,
                clientPhone,
                items,
                locationId: locationId || 1,
                userId,
                companyId,
                transactionType: transactionType || 'DELIVERED_OUT',
                notes
            });

            return res.status(200).json(result);
        } catch (error) {
            logger.error(`Error in processPOSSale: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 5. Breakage & Damage Logging
    recordDamageLog: async (req, res) => {
        try {
            const { packagingProductId, quantity, reason, notes, locationId } = req.body;
            const userId = req.user?.id || 1;
            const companyId = req.user?.companyId || 1;

            const log = await packagingService.recordDamageLog({
                packagingProductId,
                quantity,
                reason,
                notes,
                locationId: locationId || 1,
                userId,
                companyId
            });

            return res.status(201).json({ success: true, data: log });
        } catch (error) {
            logger.error(`Error in recordDamageLog: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    getDamageLogs: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const companyId = req.user?.companyId || 1;
            const data = await packagingService.getDamageLogs(startDate, endDate, companyId);
            return res.status(200).json(data);
        } catch (error) {
            logger.error(`Error in getDamageLogs: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 6. Master Packaging Matrix
    getMasterPackagingMatrix: async (req, res) => {
        try {
            const { locationId } = req.query;
            const companyId = req.user?.companyId || 1;
            const data = await packagingService.getMasterPackagingMatrix(companyId, locationId || 1);
            return res.status(200).json(data);
        } catch (error) {
            logger.error(`Error in getMasterPackagingMatrix: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    }
};

module.exports = packagingController;
