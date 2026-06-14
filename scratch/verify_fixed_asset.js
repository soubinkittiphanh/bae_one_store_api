const db = require('../src/models');
const service = require('../src/fixedAsset/service');
const logger = require('../src/api/logger');

async function runVerification() {
    logger.info('Syncing database to update Fixed Asset tables...');
    await db.fixedAssetProduct.sync({ force: false, alter: true });
    await db.fixedAssetContract.sync({ force: false, alter: true });
    await db.fixedAssetDepreciation.sync({ force: false, alter: true });
    logger.info('Database sync complete!');

    logger.info('Starting Fixed Asset module multi-currency & dual-unit verification script...');

    // 1. Ensure test Chart of Accounts exist or create them
    const accountsData = [
        { accountNumber: 1801, accountName: 'Office Equipment - Cost', accountLLName: 'ເຄື່ອງໃຊ້ຫ້ອງການ - ຕົ້ນທຶນ', accountType: 'Asset' },
        { accountNumber: 1802, accountName: 'Accumulated Depreciation - Office Equip', accountLLName: 'ຄ່າຫລຸ້ຍຫ້ຽນສະສົມ - ເຄື່ອງໃຊ້ຫ້ອງການ', accountType: 'Asset' },
        { accountNumber: 5801, accountName: 'Depreciation Expense - Office Equip', accountLLName: 'ລາຍຈ່າຍຄ່າຫລຸ້ຍຫ້ຽນ - ເຄື່ອງໃຊ້ຫ້ອງການ', accountType: 'Expense' },
        { accountNumber: 1010, accountName: 'Bank Main LAK', accountLLName: 'ບັນຊີເງິນຝາກທະນາຄານ', accountType: 'Asset' },
        { accountNumber: 5802, accountName: 'Gain/Loss on Asset Disposal', accountLLName: 'ກໍາໄລ/ຂາດທຶນ ຈາກການຊໍາລະບັນຊີຊັບສົມບັດ', accountType: 'Expense' }
    ];

    const accounts = {};

    for (const acc of accountsData) {
        let account = await db.chartAccount.findOne({ where: { accountNumber: acc.accountNumber } });
        if (!account) {
            account = await db.chartAccount.create(acc);
            logger.info(`Created Chart of Account: ${acc.accountNumber} - ${acc.accountName}`);
        } else {
            logger.info(`Found Chart of Account: ${account.accountNumber} - ${account.accountName}`);
        }
        accounts[acc.accountNumber] = account;
    }

    // 2. Ensure USD currency exists
    let usdCurrency = await db.currency.findOne({ where: { code: 'USD' } });
    if (!usdCurrency) {
        usdCurrency = await db.currency.create({
            code: 'USD',
            name: 'US Dollar',
            rate: 21000.000000,
            isActive: true,
            isLocalCCY: false,
            exchangeDirection: 'foreign_to_local',
            symbol: '$'
        });
        logger.info(`Created USD Currency: ID = ${usdCurrency.id}`);
    } else {
        logger.info(`Found USD Currency: ID = ${usdCurrency.id}, Rate = ${usdCurrency.rate}`);
    }

    // 3. Cleanup any previous test data to allow clean rerun
    const testProductCode = 'FAP-TEST-MULTI-CCY';
    const testContractNumber = 'FAC-TEST-USD-0001';

    logger.info('Cleaning up previous test data if any...');
    const oldContract = await db.fixedAssetContract.findOne({ where: { contractNumber: testContractNumber } });
    if (oldContract) {
        await db.fixedAssetDepreciation.destroy({ where: { fixedAssetContractId: oldContract.id } });
        await oldContract.destroy();
        logger.info(`Deleted old test contract ${testContractNumber}`);
    }

    const oldProduct = await db.fixedAssetProduct.findOne({ where: { productCode: testProductCode } });
    if (oldProduct) {
        await oldProduct.destroy();
        logger.info(`Deleted old test product ${testProductCode}`);
    }

    // Clean old GL transactions linked to the test contract reference
    await db.gl.destroy({ where: { postingReference: testContractNumber } });
    logger.info('Cleaned old test General Ledger entries');

    // 4. Create Fixed Asset Product specifying usefulLifeYears (1.5 Years = 18 Months)
    logger.info('Creating Test Fixed Asset Product using dual-unit (usefulLifeYears = 1.5)...');
    const product = await db.fixedAssetProduct.create({
        productCode: testProductCode,
        productName: 'Test Laptops Category - USD',
        description: 'Multi-currency category template with straight-line depreciation',
        usefulLifeYears: 1.5, // 1.5 Years
        depreciationMethod: 'STRAIGHT_LINE',
        assetCostAccountId: accounts[1801].id,
        accumulatedDepreciationAccountId: accounts[1802].id,
        depreciationExpenseAccountId: accounts[5801].id
    });
    logger.info(`Created Fixed Asset Product: ${product.productCode}, Years: ${product.usefulLifeYears}, Months: ${product.usefulLifeMonths}`);

    // Verify dual-unit sync hook
    if (parseInt(product.usefulLifeMonths) !== 18) {
        throw new Error(`Dual-unit Sync Failed: Expected usefulLifeMonths to be 18, got ${product.usefulLifeMonths}`);
    }
    logger.info('Verification Passed: Sync hook successfully calculated 1.5 Years into exactly 18 Months.');

    // 5. Capitalize Fixed Asset Contract in USD (Cost: $1,200.00 USD, Exchange Rate: 21,000.00 LAK/USD)
    logger.info('Capitalizing Fixed Asset Contract in USD...');
    const contract = await db.fixedAssetContract.create({
        contractNumber: testContractNumber,
        fixedAssetProductId: product.id,
        assetName: 'Verification Macbook Pro USD',
        serialNumber: 'SN-APPLE-USD-M3',
        acquisitionDate: '2026-01-01',
        capitalizationDate: '2026-01-01',
        bookingDate: '2026-01-01',
        acquisitionCost: 1200.00, // $1,200.00 USD
        salvageValue: 0.00,
        currencyId: usdCurrency.id,
        rate: 21000.000000,
        status: 'ACTIVE'
    });
    logger.info(`Created Fixed Asset Contract: ${contract.contractNumber}, Currency ID: ${contract.currencyId}, Rate: ${contract.rate}`);

    // 6. Generate depreciation schedule
    logger.info('Generating depreciation schedule lines...');
    const schedule = await service.generateSchedule(contract);
    
    // Verify schedule length (18 months)
    if (schedule.length !== 18) {
        throw new Error(`Schedule length expected to be 18 periods, got ${schedule.length}`);
    }
    logger.info('Verification Passed: Schedule contains exactly 18 monthly periods.');

    // Verify straight-line monthly depreciation cost: $1,200 / 18 = $66.67 (final period absorbs rounding)
    let sumDepr = 0.00;
    for (let i = 0; i < schedule.length; i++) {
        const line = schedule[i];
        const deprAmt = parseFloat(line.depreciationAmount);
        sumDepr = parseFloat((sumDepr + deprAmt).toFixed(2));
        
        if (i < 17) {
            if (deprAmt !== 66.67) {
                throw new Error(`Expected period ${i+1} depreciation to be 66.67, got ${deprAmt}`);
            }
        } else {
            // Last period absorbs division difference: 1200.00 - (66.67 * 17) = 1200.00 - 1133.39 = 66.61
            if (deprAmt !== 66.61) {
                throw new Error(`Expected final period 18 depreciation to absorb rounding and be 66.61, got ${deprAmt}`);
            }
        }
    }
    if (sumDepr !== 1200.00) {
        throw new Error(`Expected total schedule depreciation sum to be 1200.00, got ${sumDepr}`);
    }
    logger.info('Verification Passed: Every period depreciation is calculated correctly with proper final month rounding absorption.');

    // 7. Post first month depreciation (January 2026)
    logger.info('Posting depreciation for period ending 2026-01-31...');
    const batchLog = await service.postDepreciationPeriod('2026-01-31');
    logger.info(`Depreciation posted successfully in batch ${batchLog.batchNumber}`);

    // Verify first period is posted in DB
    const postedLine = await db.fixedAssetDepreciation.findOne({
        where: { fixedAssetContractId: contract.id, periodDate: '2026-01-31' }
    });
    if (!postedLine.isPosted || postedLine.glBatchId !== batchLog.batchNumber) {
        throw new Error('Verification Failed: January 2026 schedule period is not marked as posted.');
    }
    logger.info('Verification Passed: January 2026 schedule line marked as posted.');

    // Verify GL entries created for Jan
    const glEntries = await db.gl.findAll({
        where: { postingReference: testContractNumber, bookingDate: '2026-01-31' }
    });
    if (glEntries.length !== 1) {
        throw new Error(`Expected 1 GL entry for Jan depreciation, got ${glEntries.length}`);
    }

    const glEntry = glEntries[0];
    const expectedCcyId = usdCurrency.id;
    const expectedRate = 21000.000000;
    const expectedDebit = 66.67;
    const expectedLocalDebit = parseFloat((66.67 * 21000.00).toFixed(2)); // 1,400,070.00 LAK

    if (parseInt(glEntry.currencyId) !== expectedCcyId) {
        throw new Error(`Expected GL currencyId to be ${expectedCcyId}, got ${glEntry.currencyId}`);
    }
    if (parseFloat(glEntry.rate) !== expectedRate) {
        throw new Error(`Expected GL exchange rate to be ${expectedRate}, got ${glEntry.rate}`);
    }
    if (parseFloat(glEntry.debit) !== expectedDebit) {
        throw new Error(`Expected GL debit to be ${expectedDebit}, got ${glEntry.debit}`);
    }
    if (parseFloat(glEntry.localDebit) !== expectedLocalDebit) {
        throw new Error(`Expected GL localDebit to be ${expectedLocalDebit}, got ${glEntry.localDebit}`);
    }
    logger.info(`Verification Passed: GL Journal Entry successfully created in USD and converted to local currency:
      * Currency ID: ${glEntry.currencyId} (USD)
      * Exchange Rate: ${glEntry.rate}
      * Transaction Debit: $${glEntry.debit}
      * Local Debit: ₭${glEntry.localDebit.toLocaleString()} LAK`);

    // 8. Dispose Asset (Sale on Feb 15, 2026 for $900.00 USD)
    logger.info('Disposing of the USD asset contract (Sale on 2026-02-15 for $900.00 USD)...');
    const disposedContract = await service.disposeAssetContract(contract.id, {
        disposalDate: '2026-02-15',
        salePrice: 900.00, // $900.00 USD
        cashAccountId: accounts[1010].id,
        gainLossAccountId: accounts[5802].id
    });

    if (disposedContract.status !== 'DISPOSED') {
        throw new Error(`Expected contract status to be DISPOSED, got ${disposedContract.status}`);
    }
    logger.info('Verification Passed: Asset contract status successfully updated to DISPOSED.');

    // Verify future schedule lines are voided/deleted
    const remainingLines = await db.fixedAssetDepreciation.findAll({
        where: { fixedAssetContractId: contract.id }
    });
    if (remainingLines.length !== 1) {
        throw new Error(`Expected only 1 posted line to remain, got ${remainingLines.length}`);
    }
    logger.info('Verification Passed: All future unposted depreciation lines deleted successfully.');

    // Verify disposal GL entries in General Ledger
    const disposalGL = await db.gl.findAll({
        where: { postingReference: testContractNumber, bookingDate: '2026-02-15' }
    });
    
    logger.info(`Found ${disposalGL.length} General Ledger entries posted for USD asset disposal.`);

    // Expected GL Entries:
    // Net Book Value: 1200 - 66.67 = 1133.33 USD
    // Sale Price: 900 USD
    // Gain/Loss: 900 - 1133.33 = -233.33 USD (Loss of $233.33 USD)

    // 1. Clear Acc. Depr. ($66.67): DR Accumulated Depreciation (1802) / CR Asset Cost (1801)
    const clearAccDeprEntry = disposalGL.find(e => e.drAccountId === accounts[1802].id && e.crAccountId === accounts[1801].id);
    if (!clearAccDeprEntry || parseFloat(clearAccDeprEntry.debit) !== 66.67) {
        throw new Error('Verification Failed: Missing or incorrect GL entry to clear USD Accumulated Depreciation.');
    }
    if (parseFloat(clearAccDeprEntry.localDebit) !== parseFloat((66.67 * 21000).toFixed(2))) {
        throw new Error(`Expected local debit for Acc. Depr. clear to be ${(66.67 * 21000).toFixed(2)}, got ${clearAccDeprEntry.localDebit}`);
    }
    logger.info('Verification Passed: Correct multi-currency GL entry to clear Accumulated Depreciation (DR 1802 / CR 1801 for $66.67 USD / ₭1,400,070 LAK).');

    // 2. Record Cash proceeds ($900.00): DR Bank (1010) / CR Asset Cost (1801)
    const cashReceiptEntry = disposalGL.find(e => e.drAccountId === accounts[1010].id && e.crAccountId === accounts[1801].id);
    if (!cashReceiptEntry || parseFloat(cashReceiptEntry.debit) !== 900.00) {
        throw new Error('Verification Failed: Missing or incorrect GL entry to record USD sale cash proceeds.');
    }
    if (parseFloat(cashReceiptEntry.localDebit) !== parseFloat((900 * 21000).toFixed(2))) {
        throw new Error(`Expected local debit for proceeds to be ${(900 * 21000).toFixed(2)}, got ${cashReceiptEntry.localDebit}`);
    }
    logger.info('Verification Passed: Correct multi-currency GL entry to record cash proceeds (DR 1010 / CR 1801 for $900.00 USD / ₭18,900,000 LAK).');

    // 3. Record Loss ($233.33): DR Loss (5802) / CR Asset Cost (1801)
    const lossEntry = disposalGL.find(e => e.drAccountId === accounts[5802].id && e.crAccountId === accounts[1801].id);
    if (!lossEntry || parseFloat(lossEntry.debit) !== 233.33) {
        throw new Error('Verification Failed: Missing or incorrect GL entry to record USD Loss on Disposal.');
    }
    if (parseFloat(lossEntry.localDebit) !== parseFloat((233.33 * 21000).toFixed(2))) {
        throw new Error(`Expected local debit for loss to be ${(233.33 * 21000).toFixed(2)}, got ${lossEntry.localDebit}`);
    }
    logger.info('Verification Passed: Correct multi-currency GL entry to record Loss on Disposal (DR 5802 / CR 1801 for $233.33 USD / ₭4,899,930 LAK).');

    logger.info('*** SUCCESS: FIXED ASSET MODULE PHASE 2 MULTI-CURRENCY & DUAL-UNIT VERIFICATION FULLY PASSED! ***');
}

runVerification()
    .then(() => {
        logger.info('Verification process complete.');
        process.exit(0);
    })
    .catch(err => {
        logger.error('VERIFICATION ERROR:', err);
        process.exit(1);
    });
