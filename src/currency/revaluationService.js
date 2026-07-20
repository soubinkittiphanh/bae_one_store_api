const db = require('../models');
const { Op } = require('sequelize');
const logger = require('../api/logger');

class CurrencyRevaluationService {
    /**
     * Finds or creates default Unrealized Gain/Loss accounts.
     */
    static async getOrCreateRevalAccount(type) {
        const isGain = type === 'GAIN';
        const num = isGain ? 4008 : 5108;
        const name = isGain ? "Unrealized Exchange Gain" : "Unrealized Exchange Loss";
        const accType = isGain ? "Revenue" : "Expense";

        let account = await db.chartAccount.findOne({ where: { accountNumber: num } });
        if (!account) {
            account = await db.chartAccount.create({
                accountNumber: num,
                accountName: name,
                accountLLName: isGain ? "ກຳໄລຈາກອັດຕາແລກປ່ຽນທີ່ຍັງບໍ່ທັນຮັບຮູ້" : "ຂາດທຶນຈາກອັດຕາແລກປ່ຽນທີ່ຍັງບໍ່ທັນຮັບຮູ້",
                accountType: accType,
                isActive: true
            });
            logger.info(`Created default revaluation account: ${name}`);
        }
        return account;
    }

    /**
     * Executes the currency revaluation for a given date and closing exchange rate.
     */
    static async revalue(bankAccountId, closingRate, userId = 1) {
        logger.info(`Running currency revaluation for bank account ${bankAccountId} at rate ${closingRate}`);

        const t = await db.sequelize.transaction();

        try {
            const bankAcc = await db.bankAccount.findByPk(bankAccountId, { transaction: t });
            if (!bankAcc) {
                throw new Error('Bank account not found');
            }
            if (bankAcc.currency === 'LAK') {
                throw new Error('Cannot revalue a LAK account');
            }

            // Find associated chart account
            const bankChartAcc = await db.chartAccount.findOne({
                where: {
                    [Op.or]: [
                        { accountNumber: bankAcc.accountNumber },
                        { accountName: { [Op.like]: `%${bankAcc.accountName}%` } }
                    ]
                },
                transaction: t
            });

            if (!bankChartAcc) {
                throw new Error(`No Chart of Account found for bank account: ${bankAcc.accountName}`);
            }

            // 1. Calculate current book value in LAK from the GL
            const drSum = await db.gl.sum('localDebit', {
                where: { drAccountId: bankChartAcc.id, status: 'POSTED' },
                transaction: t
            }) || 0;

            const crSum = await db.gl.sum('localCredit', {
                where: { crAccountId: bankChartAcc.id, status: 'POSTED' },
                transaction: t
            }) || 0;

            const currentBookValueLAK = drSum - crSum;

            // 2. Calculate the new LAK value using the closing exchange rate
            const foreignBalance = parseFloat(bankAcc.balance || 0);
            const revaluedValueLAK = foreignBalance * parseFloat(closingRate);
            
            // 3. Compute variance
            const variance = revaluedValueLAK - currentBookValueLAK;
            logger.info(`Revaluation: Bank: ${bankAcc.accountName}, Balance: ${foreignBalance} ${bankAcc.currency}. Book Value: ${currentBookValueLAK} LAK, Revalued Value: ${revaluedValueLAK} LAK, Variance: ${variance} LAK`);

            if (Math.abs(variance) < 0.01) {
                await t.commit();
                return {
                    message: "No revaluation needed, book value aligns with current rate.",
                    variance: 0
                };
            }

            // Get Unrealized Gain/Loss Accounts
            const gainAccount = await this.getOrCreateRevalAccount('GAIN');
            const lossAccount = await this.getOrCreateRevalAccount('LOSS');

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const batchNumber = `REVAL-${bankAcc.currency}-${dateStr}-${Date.now().toString().slice(-4)}`;

            // Create Posting Batch
            const batchLog = await db.glPostingBatch.create({
                batchNumber,
                startDate: new Date().toISOString().slice(0, 10),
                endDate: new Date().toISOString().slice(0, 10),
                module: 'GL',
                totalEntriesPosted: 1,
                totalAmountPosted: Math.abs(variance),
                runByUserId: userId
            }, { transaction: t });

            const currencyRec = await db.currency.findOne({ where: { code: bankAcc.currency }, transaction: t });

            // Create GL Entry
            if (variance > 0) {
                await db.gl.create({
                    bookingDate: new Date(),
                    postingReference: batchNumber,
                    debit: 0,
                    credit: 0,
                    description: `Unrealized Exchange Gain Revaluation for bank ${bankAcc.accountName} at rate ${closingRate}`,
                    localDebit: variance,
                    localCredit: variance,
                    rate: parseFloat(closingRate),
                    source: 'GL',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId: bankChartAcc.id, 
                    crAccountId: gainAccount.id,  
                    currencyId: currencyRec ? currencyRec.id : null
                }, { transaction: t });
            } else {
                const absVariance = Math.abs(variance);
                await db.gl.create({
                    bookingDate: new Date(),
                    postingReference: batchNumber,
                    debit: 0,
                    credit: 0,
                    description: `Unrealized Exchange Loss Revaluation for bank ${bankAcc.accountName} at rate ${closingRate}`,
                    localDebit: absVariance,
                    localCredit: absVariance,
                    rate: parseFloat(closingRate),
                    source: 'GL',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId: lossAccount.id,  
                    crAccountId: bankChartAcc.id, 
                    currencyId: currencyRec ? currencyRec.id : null
                }, { transaction: t });
            }

            await t.commit();
            return {
                message: `Revaluation completed. Variance of ${variance} LAK posted to GL.`,
                variance,
                batchNumber
            };

        } catch (error) {
            await t.rollback();
            logger.error(`Currency Revaluation failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = CurrencyRevaluationService;
