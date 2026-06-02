const db = require('../models');
const { Op } = require('sequelize');
const logger = require('../api/logger');

// Utility to get end of calendar month
function getEndOfMonth(year, month) {
    const date = new Date(year, month + 1, 0);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

class FixedAssetService {
    /**
     * Generates a monthly Straight-Line depreciation schedule for a Fixed Asset Contract.
     * Rounding differences are absorbed in the final period.
     * 
     * @param {Object} contract - Fixed Asset Contract instance (must include fixedAssetProduct if not pre-loaded)
     * @param {Object} [transaction] - Optional Sequelize transaction
     * @returns {Promise<Array>} List of generated depreciation schedule entries
     */
    static async generateSchedule(contract, transaction = null) {
        let product = contract.fixedAssetProduct;
        if (!product) {
            product = await db.fixedAssetProduct.findByPk(contract.fixedAssetProductId, { transaction });
        }
        if (!product) {
            throw new Error(`Fixed Asset Product not found for ID ${contract.fixedAssetProductId}`);
        }

        const usefulLife = product.usefulLifeMonths;
        const cost = parseFloat(contract.acquisitionCost);
        const salvage = parseFloat(contract.salvageValue || 0.00);
        const depreciableAmount = parseFloat((cost - salvage).toFixed(2));
        
        if (depreciableAmount <= 0) {
            logger.info(`Fixed Asset Contract ${contract.contractNumber} has no depreciable value. Skipping schedule generation.`);
            return [];
        }

        const deprMethod = product.depreciationMethod || 'STRAIGHT_LINE';
        const schedule = [];
        let cumulativeDepr = 0.00;
        
        const capDate = new Date(contract.capitalizationDate);
        let currentYear = capDate.getFullYear();
        let currentMonth = capDate.getMonth(); // 0-11

        if (deprMethod === 'DOUBLE_DECLINING') {
            const usefulLifeYears = parseFloat(product.usefulLifeYears) || (usefulLife / 12);
            const annualRate = (1 / usefulLifeYears) * 2;
            const monthlyRate = annualRate / 12;
            
            let currentBookValue = cost;

            for (let i = 1; i <= usefulLife; i++) {
                let amount = parseFloat((currentBookValue * monthlyRate).toFixed(2));
                
                // Ensure net book value doesn't drop below salvage value
                if (currentBookValue - amount < salvage) {
                    amount = parseFloat((currentBookValue - salvage).toFixed(2));
                }
                if (i === usefulLife) {
                    amount = parseFloat((currentBookValue - salvage).toFixed(2));
                }
                
                amount = Math.max(0, amount);
                cumulativeDepr = parseFloat((cumulativeDepr + amount).toFixed(2));
                currentBookValue = parseFloat((currentBookValue - amount).toFixed(2));
                
                const periodDate = getEndOfMonth(currentYear, currentMonth);
                
                schedule.push({
                    fixedAssetContractId: contract.id,
                    periodDate,
                    depreciationAmount: amount,
                    cumulativeDepreciation: cumulativeDepr,
                    isPosted: false
                });

                // Increment to next month
                currentMonth++;
                if (currentMonth > 11) {
                    currentMonth = 0;
                    currentYear++;
                }
            }
        } else {
            // Straight Line method (default)
            const monthlyDepreciation = parseFloat((depreciableAmount / usefulLife).toFixed(2));
            for (let i = 1; i <= usefulLife; i++) {
                let amount = monthlyDepreciation;
                // Adjust rounding error in the final month to ensure exact match
                if (i === usefulLife) {
                    amount = parseFloat((depreciableAmount - cumulativeDepr).toFixed(2));
                }
                
                amount = Math.max(0, amount);
                cumulativeDepr = parseFloat((cumulativeDepr + amount).toFixed(2));
                
                const periodDate = getEndOfMonth(currentYear, currentMonth);
                
                schedule.push({
                    fixedAssetContractId: contract.id,
                    periodDate,
                    depreciationAmount: amount,
                    cumulativeDepreciation: cumulativeDepr,
                    isPosted: false
                });

                // Increment to next month
                currentMonth++;
                if (currentMonth > 11) {
                    currentMonth = 0;
                    currentYear++;
                }
            }
        }

        // Bulk create schedule lines
        const createdSchedule = await db.fixedAssetDepreciation.bulkCreate(schedule, { 
            transaction,
            returning: true 
        });

        logger.info(`Generated ${createdSchedule.length} depreciation periods for Asset Contract ${contract.contractNumber}`);
        return createdSchedule;
    }

    /**
     * Process monthly depreciation for a specific period date.
     * Selects all unposted depreciation lines up to and including the date,
     * posts double-entries to the GL, and flags lines as posted.
     * 
     * @param {string} periodDate - End date of period (YYYY-MM-DD)
     * @param {number} userId - Executing user ID
     * @returns {Promise<Object>} The resulting posting batch log
     */
    static async postDepreciationPeriod(periodDate, userId = 1) {
        logger.info(`Executing monthly depreciation posting for period ending ${periodDate} by User ${userId}`);
        
        const t = await db.sequelize.transaction();
        
        try {
            // Find all unposted schedules due for depreciation
            const unpostedLines = await db.fixedAssetDepreciation.findAll({
                where: {
                    isPosted: false,
                    periodDate: { [Op.lte]: periodDate }
                },
                include: [{
                    model: db.fixedAssetContract,
                    as: 'fixedAssetContract',
                    include: [{ model: db.fixedAssetProduct, as: 'fixedAssetProduct' }]
                }],
                transaction: t
            });

            if (unpostedLines.length === 0) {
                throw new Error(`No unposted depreciation lines found on or before period date: ${periodDate}`);
            }

            // Create batch posting log
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const timestamp = Date.now().toString().slice(-6);
            const batchNumber = `BATCH-FA-${dateStr}-${timestamp}`;

            const batchLog = await db.glPostingBatch.create({
                batchNumber,
                startDate: periodDate,
                endDate: periodDate,
                module: 'FA',
                totalEntriesPosted: 0,
                totalAmountPosted: 0.00,
                runByUserId: userId
            }, { transaction: t });

            let totalEntries = 0;
            let totalAmount = 0.00;

            for (const line of unpostedLines) {
                const contract = line.fixedAssetContract;
                const product = contract?.fixedAssetProduct;

                if (!contract || !product) {
                    logger.warn(`Depreciation line ID ${line.id} is missing contract or product details. Skipping.`);
                    continue;
                }

                const amount = parseFloat(line.depreciationAmount);
                if (amount <= 0) continue;

                const cCcyId = contract.currencyId || 1;
                const cRate = parseFloat(contract.rate || 1.000000);
                const localAmount = parseFloat((amount * cRate).toFixed(2));

                // Create GL double-entry: DR Depreciation Expense / CR Accumulated Depreciation
                await db.gl.create({
                    bookingDate: line.periodDate,
                    postingReference: contract.contractNumber,
                    debit: amount,
                    credit: amount,
                    description: `Monthly Depreciation - ${contract.assetName} (Period: ${line.periodDate})`,
                    localDebit: localAmount,
                    localCredit: localAmount,
                    rate: cRate,
                    source: 'FA',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId: product.depreciationExpenseAccountId,
                    crAccountId: product.accumulatedDepreciationAccountId,
                    currencyId: cCcyId
                }, { transaction: t });

                // Update schedule line
                await line.update({
                    isPosted: true,
                    glBatchId: batchNumber
                }, { transaction: t });

                totalEntries++;
                totalAmount = parseFloat((totalAmount + amount).toFixed(2));

                // Check if there are any remaining unposted lines for this contract
                const remainingUnpostedCount = await db.fixedAssetDepreciation.count({
                    where: {
                        fixedAssetContractId: contract.id,
                        isPosted: false
                    },
                    transaction: t
                });

                if (remainingUnpostedCount === 0) {
                    await contract.update({ status: 'FULLY_DEPRECIATED' }, { transaction: t });
                    logger.info(`Asset Contract ${contract.contractNumber} is now FULLY_DEPRECIATED.`);
                }
            }

            // Update posting batch total
            await batchLog.update({
                totalEntriesPosted: totalEntries,
                totalAmountPosted: totalAmount
            }, { transaction: t });

            await t.commit();
            logger.info(`Fixed Asset depreciation batch ${batchNumber} posted successfully. Entries: ${totalEntries}, Total: ${totalAmount}`);
            
            return batchLog.toJSON();

        } catch (error) {
            await t.rollback();
            logger.error(`Failed to post depreciation: ${error.message}`);
            throw error;
        }
    }

    /**
     * Preview monthly depreciation for a specific period date.
     * Selects all unposted depreciation lines up to and including the date.
     * 
     * @param {string} periodDate - End date of period (YYYY-MM-DD)
     * @returns {Promise<Array>} List of unposted depreciation lines
     */
    static async getDepreciationPreview(periodDate) {
        try {
            const unpostedLines = await db.fixedAssetDepreciation.findAll({
                where: {
                    isPosted: false,
                    periodDate: { [Op.lte]: periodDate }
                },
                include: [{
                    model: db.fixedAssetContract,
                    as: 'fixedAssetContract',
                    include: [{ model: db.fixedAssetProduct, as: 'fixedAssetProduct' }]
                }],
                order: [
                    ['periodDate', 'ASC']
                ]
            });

            return unpostedLines;
        } catch (error) {
            logger.error(`Failed to get depreciation preview: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handles asset retirement or sale (disposal).
     * Reverses the Asset Cost and Accumulated Depreciation from the balance sheet,
     * processes the cash sale proceeds, computes the gain or loss, and posts entries to GL.
     * 
     * @param {number} contractId - ID of contract being disposed
     * @param {Object} disposalDetails - { disposalDate, salePrice, cashAccountId, gainLossAccountId }
     * @param {number} userId - Executing user ID
     * @returns {Promise<Object>} The updated contract details
     */
    static async disposeAssetContract(contractId, disposalDetails, userId = 1) {
        const { disposalDate, salePrice, cashAccountId, gainLossAccountId } = disposalDetails;
        
        if (!disposalDate || salePrice === undefined || !cashAccountId || !gainLossAccountId) {
            throw new Error('Disposal requires disposalDate, salePrice, cashAccountId, and gainLossAccountId');
        }

        const t = await db.sequelize.transaction();

        try {
            const contract = await db.fixedAssetContract.findByPk(contractId, {
                include: [{ model: db.fixedAssetProduct, as: 'fixedAssetProduct' }],
                transaction: t
            });

            if (!contract) {
                throw new Error(`Asset Contract with ID ${contractId} not found.`);
            }

            if (contract.status === 'DISPOSED' || contract.status === 'WRITTEN_OFF') {
                throw new Error(`Asset Contract is already in ${contract.status} status.`);
            }

            const product = contract.fixedAssetProduct;
            const originalCost = parseFloat(contract.acquisitionCost);

            // Calculate accumulated depreciation posted to date
            const postedDepr = await db.fixedAssetDepreciation.sum('depreciationAmount', {
                where: {
                    fixedAssetContractId: contract.id,
                    isPosted: true
                },
                transaction: t
            }) || 0.00;

            const netBookValue = parseFloat((originalCost - postedDepr).toFixed(2));
            const proceeds = parseFloat(salePrice);
            const gainLoss = parseFloat((proceeds - netBookValue).toFixed(2));

            // Generate disposal batch number
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const timestamp = Date.now().toString().slice(-6);
            const batchNumber = `BATCH-FA-DISP-${dateStr}-${timestamp}`;

            // Create Posting Batch
            await db.glPostingBatch.create({
                batchNumber,
                startDate: disposalDate,
                endDate: disposalDate,
                module: 'FA',
                totalEntriesPosted: 3,
                totalAmountPosted: originalCost,
                runByUserId: userId
            }, { transaction: t });

            const cCcyId = contract.currencyId || 1;
            const cRate = parseFloat(contract.rate || 1.000000);

            // Journal Entry 1: Clear Accumulated Depreciation up to the posted amount
            // DR: Accumulated Depreciation Account
            // CR: Asset Cost Account
            if (postedDepr > 0) {
                const localPostedDepr = parseFloat((postedDepr * cRate).toFixed(2));
                await db.gl.create({
                    bookingDate: disposalDate,
                    postingReference: contract.contractNumber,
                    debit: postedDepr,
                    credit: postedDepr,
                    description: `Disposal - Clear Accumulated Depreciation for ${contract.assetName}`,
                    localDebit: localPostedDepr,
                    localCredit: localPostedDepr,
                    rate: cRate,
                    source: 'FA',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId: product.accumulatedDepreciationAccountId,
                    crAccountId: product.assetCostAccountId,
                    currencyId: cCcyId
                }, { transaction: t });
            }

            // Journal Entry 2: Record cash/receivable proceeds received up to Net Book Value
            // DR: Cash/Bank Account (cashAccountId)
            // CR: Asset Cost Account
            const costReductionAmount = parseFloat(Math.min(proceeds, netBookValue).toFixed(2));
            if (costReductionAmount > 0) {
                const localCostRed = parseFloat((costReductionAmount * cRate).toFixed(2));
                await db.gl.create({
                    bookingDate: disposalDate,
                    postingReference: contract.contractNumber,
                    debit: costReductionAmount,
                    credit: costReductionAmount,
                    description: `Disposal - Proceeds from sale of ${contract.assetName}`,
                    localDebit: localCostRed,
                    localCredit: localCostRed,
                    rate: cRate,
                    source: 'FA',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId: cashAccountId,
                    crAccountId: product.assetCostAccountId,
                    currencyId: cCcyId
                }, { transaction: t });
            }

            // Journal Entry 3: Record Gain or Loss
            if (gainLoss > 0) {
                // Gain: Cash received > Net Book Value
                // DR: Cash/Bank Account (cashAccountId) (the excess proceeds)
                // CR: Gain/Loss Account (gainLossAccountId)
                const localGainLoss = parseFloat((gainLoss * cRate).toFixed(2));
                await db.gl.create({
                    bookingDate: disposalDate,
                    postingReference: contract.contractNumber,
                    debit: gainLoss,
                    credit: gainLoss,
                    description: `Disposal - Gain on Sale of ${contract.assetName}`,
                    localDebit: localGainLoss,
                    localCredit: localGainLoss,
                    rate: cRate,
                    source: 'FA',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId: cashAccountId,
                    crAccountId: gainLossAccountId,
                    currencyId: cCcyId
                }, { transaction: t });
            } else if (gainLoss < 0) {
                // Loss: Cash received < Net Book Value (or written off completely)
                // DR: Gain/Loss Account (gainLossAccountId) (the loss amount)
                // CR: Asset Cost Account (remaining cost not recovered by cash)
                const absLoss = Math.abs(gainLoss);
                const localAbsLoss = parseFloat((absLoss * cRate).toFixed(2));
                await db.gl.create({
                    bookingDate: disposalDate,
                    postingReference: contract.contractNumber,
                    debit: absLoss,
                    credit: absLoss,
                    description: `Disposal - Loss on Sale/Write-off of ${contract.assetName}`,
                    localDebit: localAbsLoss,
                    localCredit: localAbsLoss,
                    rate: cRate,
                    source: 'FA',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId: gainLossAccountId,
                    crAccountId: product.assetCostAccountId,
                    currencyId: cCcyId
                }, { transaction: t });
            }

            // Void/Cancel any future unposted scheduled periods
            await db.fixedAssetDepreciation.destroy({
                where: {
                    fixedAssetContractId: contract.id,
                    isPosted: false
                },
                transaction: t
            });

            // Update contract status
            await contract.update({ status: 'DISPOSED' }, { transaction: t });

            await t.commit();
            logger.info(`Asset Contract ${contract.contractNumber} disposed successfully. Sale proceeds: ${proceeds}, Gain/Loss: ${gainLoss}`);
            
            return contract.toJSON();

        } catch (error) {
            await t.rollback();
            logger.error(`Disposal of Asset Contract failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = FixedAssetService;
