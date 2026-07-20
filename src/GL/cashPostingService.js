const db = require('../models');
const { Op } = require('sequelize');
const logger = require('../api/logger');

class GLCashPostingService {
    /**
     * Helper to resolve the Cash/Bank GL account.
     */
    static async resolveCashBankAccountId(method, bankAccountId, defaultNum = 1000) {
        if (bankAccountId) {
            const bankAcc = await db.bankAccount.findByPk(bankAccountId);
            if (bankAcc) {
                const chartAcc = await db.chartAccount.findOne({
                    where: {
                        [Op.or]: [
                            { accountNumber: bankAcc.accountNumber },
                            { accountName: { [Op.like]: `%${bankAcc.accountName}%` } }
                        ]
                    }
                });
                if (chartAcc) return chartAcc.id;
            }
        }

        const fallbackAcc = await db.chartAccount.findOne({
            where: { accountNumber: defaultNum }
        });
        if (fallbackAcc) return fallbackAcc.id;

        const firstAsset = await db.chartAccount.findOne({ where: { accountType: 'Asset' } });
        return firstAsset ? firstAsset.id : null;
    }

    /**
     * Preview all unposted cash/settlement transactions.
     */
    static async previewUnposted(startDate, endDate, module) {
        logger.info(`Previewing unposted cash/settlement transactions for ${module} from ${startDate} to ${endDate}`);

        if (module === 'AP_SETTLEMENT') {
            const unposted = await db.apInvoiceSettlement.findAll({
                where: {
                    settlementDate: { [Op.between]: [startDate, endDate] },
                    status: 'completed',
                    glPostingStatus: 'unposted'
                },
                include: [
                    { 
                        model: db.apInvoiceSettlementLine, 
                        as: 'invoiceSettlements',
                        include: [
                            { 
                                model: db.invoiceLineItem, 
                                as: 'invoiceLineItem',
                                include: [
                                    { model: db.chartAccount, as: 'CRglAccount' }
                                ]
                            }
                        ]
                    },
                    { model: db.bankAccount, as: 'bankAccount' },
                    { model: db.currency, as: 'currency' }
                ]
            });

            return unposted.map(settlement => {
                const line = settlement.invoiceSettlements?.[0]?.invoiceLineItem;
                const crAccount = line?.CRglAccount?.accountName || 'Accounts Payable';
                const crAccountCode = line?.CRglAccount?.accountNumber || '2000';
                
                return {
                    id: settlement.id,
                    documentNumber: settlement.reference || `SETTLE-${settlement.id}`,
                    documentDate: settlement.settlementDate,
                    partnerName: 'Vendor Payment',
                    currency: settlement?.currency?.code || 'LAK',
                    exchangeRate: parseFloat(settlement.exchangeRate || 1.0),
                    totalAmount: parseFloat(settlement.paymentAmount || 0),
                    description: settlement.description || 'AP Settlement Posting',
                    drAccount: crAccount, 
                    drAccountCode: crAccountCode,
                    crAccount: settlement.bankAccount?.accountName || 'Cash/Bank Account',
                    crAccountCode: settlement.bankAccount?.accountNumber || ''
                };
            });
        }

        if (module === 'AR_RECEIPT') {
            const unposted = await db.arReceiveHeaderV2.findAll({
                where: {
                    receivedDate: { [Op.between]: [startDate, endDate] },
                    status: 'active',
                    glPostingStatus: 'unposted'
                },
                include: [
                    { 
                        model: db.arReceiveLine, 
                        as: 'receiveLines',
                        include: [
                            { 
                                model: db.arInvoiceLine, 
                                as: 'invoiceLine',
                                include: [{ model: db.chartAccount, as: 'DRglAccount' }]
                            }
                        ]
                    },
                    { model: db.currency, as: 'currency' }
                ]
            });

            return unposted.map(receipt => {
                const line = receipt.receiveLines?.[0]?.invoiceLine;
                const drAccount = line?.DRglAccount?.accountName || 'Accounts Receivable';
                const drAccountCode = line?.DRglAccount?.accountNumber || '1005';

                return {
                    id: receipt.id,
                    documentNumber: receipt.receiptNumber,
                    documentDate: receipt.receivedDate,
                    partnerName: 'Customer Receipt',
                    currency: receipt?.currency?.code || 'LAK',
                    exchangeRate: parseFloat(receipt.exchangeRate || 1.0),
                    totalAmount: parseFloat(receipt.totalReceivedAmount || 0),
                    description: receipt.notes || 'AR Receipt Posting',
                    drAccount: receipt.paymentMethod === 'cash' ? 'Cash on Hand' : 'Bank Account',
                    drAccountCode: receipt.paymentMethod === 'cash' ? '1000' : '1002',
                    crAccount: drAccount, 
                    crAccountCode: drAccountCode
                };
            });
        }

        if (module === 'MONEY_SETTLEMENT') {
            const unposted = await db.moneySettlement.findAll({
                where: {
                    bookingDate: { [Op.between]: [startDate, endDate] },
                    glPostingStatus: 'unposted'
                },
                include: [
                    { model: db.chartAccount, as: 'chartAccount' },
                    { model: db.currency, as: 'currency' },
                    { model: db.bankAccount, as: 'bankAccount' },
                    { model: db.ministry, as: 'ministry' },
                    { model: db.moneyAdvance, as: 'moneyAdvance' }
                ]
            });

            return unposted.map(settlement => {
                return {
                    id: settlement.id,
                    documentNumber: settlement.externalRefNo || `MS-${settlement.id}`,
                    documentDate: settlement.bookingDate,
                    partnerName: settlement.fromPersonName || 'Advance Clearance',
                    currency: settlement?.currency?.code || 'LAK',
                    exchangeRate: parseFloat(settlement.exchangeRate || 1.0),
                    totalAmount: parseFloat(settlement.amount || 0),
                    description: settlement.notes || 'Money Settlement Posting',
                    drAccount: settlement.chartAccount?.accountName || 'Settlement Account',
                    drAccountCode: settlement.chartAccount?.accountNumber || '',
                    crAccount: 'Advance Control Account',
                    crAccountCode: '1001'
                };
            });
        }

        throw new Error(`Unsupported cash module: ${module}`);
    }

    /**
     * Executes manual batch-posting of unposted cash-ledger records to the General Ledger.
     */
    static async postBatch(startDate, endDate, module, userId = 1) {
        logger.info(`Starting batch cash-posting for ${module} from ${startDate} to ${endDate} by User ${userId}`);

        const t = await db.sequelize.transaction();

        try {
            let documents = [];
            
            if (module === 'AP_SETTLEMENT') {
                documents = await db.apInvoiceSettlement.findAll({
                    where: {
                        settlementDate: { [Op.between]: [startDate, endDate] },
                        status: 'completed',
                        glPostingStatus: 'unposted'
                    },
                    include: [
                        { 
                            model: db.apInvoiceSettlementLine, 
                            as: 'invoiceSettlements',
                            include: [
                                { 
                                    model: db.invoiceLineItem, 
                                    as: 'invoiceLineItem',
                                    include: [{ model: db.apInvoice, as: 'invoice' }]
                                }
                            ]
                        }
                    ],
                    transaction: t
                });
            } else if (module === 'AR_RECEIPT') {
                documents = await db.arReceiveHeaderV2.findAll({
                    where: {
                        receivedDate: { [Op.between]: [startDate, endDate] },
                        status: 'active',
                        glPostingStatus: 'unposted'
                    },
                    include: [
                        { 
                            model: db.arReceiveLine, 
                            as: 'receiveLines',
                            include: [
                                { 
                                    model: db.arInvoiceLine, 
                                    as: 'invoiceLine',
                                    include: [{ model: db.arInvoiceHeader, as: 'invoiceHeader' }]
                                }
                            ]
                        }
                    ],
                    transaction: t
                });
            } else if (module === 'MONEY_SETTLEMENT') {
                documents = await db.moneySettlement.findAll({
                    where: {
                        bookingDate: { [Op.between]: [startDate, endDate] },
                        glPostingStatus: 'unposted'
                    },
                    include: [{ model: db.moneyAdvance, as: 'moneyAdvance' }],
                    transaction: t
                });
            } else {
                throw new Error(`Unsupported cash module for GL posting: ${module}`);
            }

            if (documents.length === 0) {
                throw new Error(`No unposted ${module} records found in the date range.`);
            }

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const timestamp = Date.now().toString().slice(-6);
            const batchNumber = `BATCH-${module}-${dateStr}-${timestamp}`;

            const batchLog = await db.glPostingBatch.create({
                batchNumber,
                startDate,
                endDate,
                module,
                totalEntriesPosted: 0,
                totalAmountPosted: 0.00,
                runByUserId: userId
            }, { transaction: t });

            let totalEntriesPosted = 0;
            let totalAmountPosted = 0;

            for (const doc of documents) {
                let drAccountId = null;
                let crAccountId = null;
                let amount = 0;
                let fxRate = parseFloat(doc.exchangeRate || 1.0);
                let currencyId = doc.currencyId;
                let docNumber = '';
                let docDate = '';
                let docDesc = '';
                let projectId = null;
                let contractId = null;
                let ministryId = null;
                let categoryId = null;

                if (module === 'AP_SETTLEMENT') {
                    amount = parseFloat(doc.paymentAmount);
                    docNumber = doc.reference || `SETTLE-${doc.id}`;
                    docDate = doc.settlementDate;
                    docDesc = doc.description || 'AP Settlement Posting';
                    
                    crAccountId = await this.resolveCashBankAccountId('AP', doc.bankAccountId, 1002);
                    
                    const line = doc.invoiceSettlements?.[0]?.invoiceLineItem;
                    if (line) {
                        drAccountId = line.CRglAccountId; 
                        projectId = line.projectId || line.invoice?.projectId || null;
                        contractId = line.contractId || line.invoice?.contractId || null;
                        ministryId = line.ministryId || line.invoice?.ministryId || null;
                        categoryId = line.categoryId || line.invoice?.categoryId || null;
                    }
                    if (!drAccountId) {
                        const apAcc = await db.chartAccount.findOne({ where: { accountNumber: 2000 }, transaction: t });
                        drAccountId = apAcc ? apAcc.id : null;
                    }

                } else if (module === 'AR_RECEIPT') {
                    amount = parseFloat(doc.totalReceivedAmount);
                    docNumber = doc.receiptNumber;
                    docDate = doc.receivedDate;
                    docDesc = doc.notes || 'AR Receipt Posting';
                    
                    drAccountId = await this.resolveCashBankAccountId('AR', null, doc.paymentMethod === 'cash' ? 1000 : 1002);
                    
                    const line = doc.receiveLines?.[0]?.invoiceLine;
                    if (line) {
                        crAccountId = line.DRglAccountId; 
                        projectId = line.projectId || line.invoiceHeader?.projectId || null;
                        contractId = line.contractId || line.invoiceHeader?.contractId || null;
                        ministryId = line.ministryId || line.invoiceHeader?.ministryId || null;
                        categoryId = line.categoryId || line.invoiceHeader?.categoryId || null;
                    }
                    if (!crAccountId) {
                        const arAcc = await db.chartAccount.findOne({ where: { accountNumber: 1005 }, transaction: t });
                        crAccountId = arAcc ? arAcc.id : null;
                    }

                } else if (module === 'MONEY_SETTLEMENT') {
                    amount = parseFloat(doc.amount);
                    docNumber = doc.externalRefNo || `MS-${doc.id}`;
                    docDate = doc.bookingDate;
                    docDesc = doc.notes || 'Money Settlement Posting';
                    
                    drAccountId = doc.chartAccountId;
                    
                    const advanceAcc = await db.chartAccount.findOne({ where: { accountNumber: 1001 }, transaction: t });
                    crAccountId = advanceAcc ? advanceAcc.id : null;

                    projectId = doc.projectId || doc.moneyAdvance?.projectId || null;
                    contractId = doc.contractId || doc.moneyAdvance?.contractId || null;
                    ministryId = doc.ministryId || doc.moneyAdvance?.ministryId || null;
                    categoryId = doc.categoryId || doc.moneyAdvance?.categoryId || null;
                }

                if (!drAccountId || !crAccountId) {
                    throw new Error(`Posting Failed: Missing DR/CR accounts for document ${docNumber}.`);
                }

                const localAmt = parseFloat((amount * fxRate).toFixed(2));

                await db.gl.create({
                    bookingDate: docDate,
                    postingReference: docNumber,
                    debit: amount,
                    credit: amount,
                    description: docDesc,
                    localDebit: localAmt,
                    localCredit: localAmt,
                    rate: fxRate,
                    source: 'GL',
                    status: 'POSTED',
                    glBatchId: batchNumber,
                    drAccountId,
                    crAccountId,
                    currencyId,
                    projectId,
                    contractId,
                    ministryId,
                    categoryId
                }, { transaction: t });

                await doc.update({
                    glPostingStatus: 'posted',
                    glPostingDate: new Date(),
                    glBatchId: batchNumber
                }, { transaction: t });

                totalEntriesPosted++;
                totalAmountPosted += amount;
            }

            await batchLog.update({
                totalEntriesPosted,
                totalAmountPosted
            }, { transaction: t });

            await t.commit();
            logger.info(`Cash GL posting batch run ${batchNumber} completed. Posted: ${totalEntriesPosted}`);

            return batchLog.toJSON();

        } catch (error) {
            await t.rollback();
            logger.error(`Cash GL Batch Posting Rollback: ${error.message}`);
            throw error;
        }
    }
}

module.exports = GLCashPostingService;
