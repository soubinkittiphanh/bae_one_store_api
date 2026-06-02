const db = require('../models');
const service = require('./service');
const logger = require('../api/logger');

// ==========================================
// 1. FIXED ASSET PRODUCT (Blueprint)
// ==========================================
exports.createProduct = async (req, res) => {
    try {
        const { productCode, productName, description, usefulLifeMonths, usefulLifeYears, depreciationMethod, assetCostAccountId, accumulatedDepreciationAccountId, depreciationExpenseAccountId } = req.body;

        if (!productCode || !productName || (!usefulLifeMonths && !usefulLifeYears) || !assetCostAccountId || !accumulatedDepreciationAccountId || !depreciationExpenseAccountId) {
            return res.status(400).json({ error: 'Missing required fields for creating fixed asset product (either usefulLifeMonths or usefulLifeYears must be provided).' });
        }

        const newProduct = await db.fixedAssetProduct.create({
            productCode,
            productName,
            description,
            usefulLifeMonths,
            usefulLifeYears,
            depreciationMethod: depreciationMethod || 'STRAIGHT_LINE',
            assetCostAccountId,
            accumulatedDepreciationAccountId,
            depreciationExpenseAccountId
        });

        res.status(201).json({ message: 'Fixed Asset Product created successfully', data: newProduct });
    } catch (error) {
        logger.error('Error creating Fixed Asset Product:', error);
        res.status(500).json({ error: error.message || 'An error occurred while creating Fixed Asset Product' });
    }
};

exports.listProducts = async (req, res) => {
    try {
        const products = await db.fixedAssetProduct.findAll({
            where: { isActive: true },
            include: [
                { model: db.chartAccount, as: 'assetCostAccount', attributes: ['id', 'accountName', 'accountNumber'] },
                { model: db.chartAccount, as: 'accumulatedDepreciationAccount', attributes: ['id', 'accountName', 'accountNumber'] },
                { model: db.chartAccount, as: 'depreciationExpenseAccount', attributes: ['id', 'accountName', 'accountNumber'] }
            ]
        });
        res.status(200).json(products);
    } catch (error) {
        logger.error('Error listing Fixed Asset Products:', error);
        res.status(500).json({ error: error.message || 'An error occurred while listing Fixed Asset Products' });
    }
};

// ==========================================
// 2. FIXED ASSET CONTRACT (Instance)
// ==========================================

exports.createContract = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const { 
            contractNumber, 
            fixedAssetProductId, 
            assetName, 
            serialNumber, 
            acquisitionDate, 
            capitalizationDate, 
            bookingDate, 
            acquisitionCost, 
            salvageValue, 
            locationId, 
            vendorId,
            currencyId,
            rate,
            capitalizationCrAccountId // Optional: If provided, books GL capitalization entry immediately
        } = req.body;

        if (!contractNumber || !fixedAssetProductId || !assetName || !acquisitionDate || !capitalizationDate || !bookingDate || !acquisitionCost) {
            return res.status(400).json({ error: 'Missing required fields for capitalizing fixed asset contract.' });
        }

        // Verify product exists
        const product = await db.fixedAssetProduct.findByPk(fixedAssetProductId, { transaction: t });
        if (!product) {
            return res.status(404).json({ error: `Fixed Asset Product with ID ${fixedAssetProductId} not found.` });
        }

        const cCcyId = currencyId || 1;
        const cRate = parseFloat(rate || 1.000000);

        // Create the contract
        const newContract = await db.fixedAssetContract.create({
            contractNumber,
            fixedAssetProductId,
            assetName,
            serialNumber,
            acquisitionDate,
            capitalizationDate,
            bookingDate,
            acquisitionCost,
            salvageValue: salvageValue || 0.00,
            locationId,
            vendorId,
            currencyId: cCcyId,
            rate: cRate,
            status: 'ACTIVE'
        }, { transaction: t });

        // Generate the depreciation schedule
        await service.generateSchedule(newContract, t);

        // Optional: Post the Capitalization Journal Entry to GL
        // DR Asset Cost Account / CR capitalizationCrAccountId (e.g., Accounts Payable or Cash)
        if (capitalizationCrAccountId) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const timestamp = Date.now().toString().slice(-6);
            const batchNumber = `BATCH-FA-CAP-${dateStr}-${timestamp}`;

            // Create Posting Batch
            await db.glPostingBatch.create({
                batchNumber,
                startDate: bookingDate,
                endDate: bookingDate,
                module: 'FA',
                totalEntriesPosted: 1,
                totalAmountPosted: parseFloat(acquisitionCost),
                runByUserId: req.user?.id || 1
            }, { transaction: t });

            const cost = parseFloat(acquisitionCost);

            // Post double-entry to GL
            await db.gl.create({
                bookingDate,
                postingReference: contractNumber,
                debit: cost,
                credit: cost,
                description: `Capitalization - ${assetName}`,
                localDebit: parseFloat((cost * cRate).toFixed(2)),
                localCredit: parseFloat((cost * cRate).toFixed(2)),
                rate: cRate,
                source: 'FA',
                status: 'POSTED',
                glBatchId: batchNumber,
                drAccountId: product.assetCostAccountId,
                crAccountId: capitalizationCrAccountId,
                currencyId: cCcyId
            }, { transaction: t });
        }

        await t.commit();
        res.status(201).json({ message: 'Fixed Asset Contract capitalized successfully', data: newContract });
    } catch (error) {
        await t.rollback();
        logger.error('Error capitalizing Fixed Asset Contract:', error);
        res.status(500).json({ error: error.message || 'An error occurred while capitalizing Fixed Asset Contract' });
    }
};

exports.listContracts = async (req, res) => {
    try {
        const { status, fixedAssetProductId } = req.query;
        const whereClause = {};
        
        if (status) whereClause.status = status;
        if (fixedAssetProductId) whereClause.fixedAssetProductId = fixedAssetProductId;

        const contracts = await db.fixedAssetContract.findAll({
            where: whereClause,
            include: [
                { model: db.fixedAssetProduct, as: 'fixedAssetProduct' },
                { model: db.location, as: 'location', attributes: ['id', 'name'] },
                { model: db.vendor, as: 'vendor', attributes: ['id', 'name'] }
            ]
        });
        res.status(200).json(contracts);
    } catch (error) {
        logger.error('Error listing Fixed Asset Contracts:', error);
        res.status(500).json({ error: error.message || 'An error occurred while listing Fixed Asset Contracts' });
    }
};

exports.getContractDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const contract = await db.fixedAssetContract.findByPk(id, {
            include: [
                { model: db.fixedAssetProduct, as: 'fixedAssetProduct' },
                { model: db.location, as: 'location', attributes: ['id', 'name'] },
                { model: db.vendor, as: 'vendor', attributes: ['id', 'name'] },
                { model: db.fixedAssetDepreciation, as: 'depreciationSchedule' }
            ],
            order: [
                [{ model: db.fixedAssetDepreciation, as: 'depreciationSchedule' }, 'periodDate', 'ASC']
            ]
        });

        if (!contract) {
            return res.status(404).json({ error: `Fixed Asset Contract with ID ${id} not found.` });
        }

        res.status(200).json(contract);
    } catch (error) {
        logger.error('Error getting Fixed Asset Contract details:', error);
        res.status(500).json({ error: error.message || 'An error occurred while getting Fixed Asset Contract details' });
    }
};

exports.disposeContract = async (req, res) => {
    try {
        const { id } = req.params;
        const { disposalDate, salePrice, cashAccountId, gainLossAccountId } = req.body;
        const userId = req.user?.id || 1;

        if (!disposalDate || salePrice === undefined || !cashAccountId || !gainLossAccountId) {
            return res.status(400).json({ error: 'disposalDate, salePrice, cashAccountId, and gainLossAccountId are required in request body.' });
        }

        const updatedContract = await service.disposeAssetContract(id, {
            disposalDate,
            salePrice,
            cashAccountId,
            gainLossAccountId
        }, userId);

        res.status(200).json({ message: 'Fixed Asset Contract disposed successfully', data: updatedContract });
    } catch (error) {
        logger.error('Error disposing Fixed Asset Contract:', error);
        res.status(500).json({ error: error.message || 'An error occurred while disposing Fixed Asset Contract' });
    }
};

// ==========================================
// 3. DEPRECIATION OPERATIONS
// ==========================================

exports.getDepreciationPreview = async (req, res) => {
    try {
        const { periodDate } = req.query;

        if (!periodDate) {
            return res.status(400).json({ error: 'periodDate is required in the query string (YYYY-MM-DD).' });
        }

        // If periodDate is YYYY-MM, we might need to find the end of the month
        // But the service can handle it if it's already YYYY-MM-DD
        // We can append -31 to cover the end of the month just in case
        let fullDate = periodDate;
        if (periodDate.length === 7) {
            const [year, month] = periodDate.split('-');
            const date = new Date(year, month, 0); // last day of the month
            fullDate = `${year}-${month}-${String(date.getDate()).padStart(2, '0')}`;
        }

        const previewData = await service.getDepreciationPreview(fullDate);
        res.status(200).json(previewData);
    } catch (error) {
        logger.error('Error executing monthly depreciation preview:', error);
        res.status(500).json({ error: error.message || 'An error occurred during depreciation preview' });
    }
};

exports.runDepreciation = async (req, res) => {
    try {
        const { periodDate } = req.body;
        const userId = req.user?.id || 1;

        if (!periodDate) {
            return res.status(400).json({ error: 'periodDate is required in the request body (YYYY-MM-DD).' });
        }

        const batchLog = await service.postDepreciationPeriod(periodDate, userId);
        res.status(200).json({ message: 'Depreciation batch posted successfully', data: batchLog });
    } catch (error) {
        logger.error('Error executing monthly depreciation:', error);
        res.status(500).json({ error: error.message || 'An error occurred during depreciation batch posting' });
    }
};
