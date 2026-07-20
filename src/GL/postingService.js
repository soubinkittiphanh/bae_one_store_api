const db = require('../models');
const { Op } = require('sequelize');
const logger = require('../api/logger');

class GLPostingService {
    /**
     * Preview all unposted transactions in a date range for a given module.
     * Useful for accountants to reconcile before execution.
     * 
     * @param {string} startDate - Start of date range (YYYY-MM-DD)
     * @param {string} endDate - End of date range (YYYY-MM-DD)
     * @param {string} module - 'AP' or 'AR'
     * @returns {Promise<Array>} List of unposted documents with their totals and line details.
     */
    static async previewUnposted(startDate, endDate, module) {
        logger.info(`Previewing unposted transactions for ${module} from ${startDate} to ${endDate}`);

        if (module === 'AP') {
            const unpostedAP = await db.apInvoice.findAll({
                where: {
                    invoiceDate: { [Op.between]: [startDate, endDate] },
                    status: 'approved',
                    glPostingStatus: 'unposted'
                },
                include: [
                    {
                        model: db.invoiceLineItem,
                        as: 'lineItems',
                        include: [
                            { model: db.chartAccount, as: 'DRglAccount', attributes: ['id', 'accountName', 'accountNumber'] },
                            { model: db.chartAccount, as: 'CRglAccount', attributes: ['id', 'accountName', 'accountNumber'] }
                        ]
                    },
                    { model: db.vendor, as: 'vendor', attributes: ['id', 'name'] },
                    { model: db.currency, as: 'currency', attributes: ['id', 'name', 'code'] }
                ]
            });

            return unpostedAP.map(invoice => ({
                id: invoice.id,
                documentNumber: invoice.invoiceNumber,
                documentDate: invoice.invoiceDate,
                partnerName: invoice?.vendor?.name || 'Unknown Vendor',
                currency: invoice?.currency?.code || 'USD',
                exchangeRate: parseFloat(invoice.exchangeRate || 1.0),
                totalAmount: parseFloat(invoice.totalAmount || 0),
                description: invoice.description || 'AP Invoice Posting',
                lines: (invoice.lineItems || []).map(line => ({
                    lineNumber: line.lineNumber,
                    description: line.description,
                    amount: parseFloat(line.lineTotal || 0),
                    drAccount: line?.DRglAccount?.accountName || 'Missing DR Account',
                    drAccountCode: line?.DRglAccount?.accountNumber || '',
                    crAccount: line?.CRglAccount?.accountName || 'Missing CR Account',
                    crAccountCode: line?.CRglAccount?.accountNumber || ''
                }))
            }));
        } 
        
        if (module === 'AR') {
            const unpostedAR = await db.arInvoiceHeader.findAll({
                where: {
                    invoiceDate: { [Op.between]: [startDate, endDate] },
                    status: ['sent', 'paid'],
                    glPostingStatus: 'unposted'
                },
                include: [
                    {
                        model: db.arInvoiceLine,
                        as: 'invoiceLines',
                        include: [
                            { model: db.chartAccount, as: 'DRglAccount', attributes: ['id', 'accountName', 'accountNumber'] },
                            { model: db.chartAccount, as: 'CRglAccount', attributes: ['id', 'accountName', 'accountNumber'] }
                        ]
                    },
                    { model: db.client, as: 'client', attributes: ['id', 'name'] },
                    { model: db.currency, as: 'currency', attributes: ['id', 'name', 'code'] }
                ]
            });

            return unpostedAR.map(invoice => ({
                id: invoice.id,
                documentNumber: invoice.invoiceNumber,
                documentDate: invoice.invoiceDate,
                partnerName: invoice?.client?.name || 'Unknown Client',
                currency: invoice?.currency?.code || 'USD',
                exchangeRate: parseFloat(invoice.exchangeRate || 1.0),
                totalAmount: parseFloat(invoice.totalAmount || 0),
                description: invoice.description || 'AR Invoice Posting',
                lines: (invoice.invoiceLines || []).map(line => ({
                    lineNumber: line.lineNumber,
                    description: line.description,
                    amount: parseFloat(line.lineTotal || 0),
                    drAccount: line?.DRglAccount?.accountName || 'Missing DR Account',
                    drAccountCode: line?.DRglAccount?.accountNumber || '',
                    crAccount: line?.CRglAccount?.accountName || 'Missing CR Account',
                    crAccountCode: line?.CRglAccount?.accountNumber || ''
                }))
            }));
        }

        throw new Error(`Unsupported module: ${module}`);
    }

    /**
     * Executes manual batch-posting of unposted sub-ledger records to the General Ledger.
     * Runs inside an atomic database transaction.
     * 
     * @param {string} startDate - Start of select range (YYYY-MM-DD)
     * @param {string} endDate - End of select range (YYYY-MM-DD)
     * @param {string} module - 'AP' or 'AR'
     * @param {number} userId - ID of user executing the post batch
     * @returns {Promise<Object>} Batch log information
     */
    static async postBatch(startDate, endDate, module, userId = 1) {
        logger.info(`Starting batch posting for ${module} from ${startDate} to ${endDate} by User ${userId}`);

        // Start database transaction
        const t = await db.sequelize.transaction();

        try {
            let documents = [];
            
            // 1. Fetch unposted records with lines based on module choice
            if (module === 'AP') {
                documents = await db.apInvoice.findAll({
                    where: {
                        invoiceDate: { [Op.between]: [startDate, endDate] },
                        status: 'approved',
                        glPostingStatus: 'unposted'
                    },
                    include: [{ model: db.invoiceLineItem, as: 'lineItems' }],
                    transaction: t
                });
            } else if (module === 'AR') {
                documents = await db.arInvoiceHeader.findAll({
                    where: {
                        invoiceDate: { [Op.between]: [startDate, endDate] },
                        status: ['sent', 'paid'],
                        glPostingStatus: 'unposted'
                    },
                    include: [{ model: db.arInvoiceLine, as: 'invoiceLines' }],
                    transaction: t
                });
            } else {
                throw new Error(`Unsupported module for GL posting: ${module}`);
            }

            if (documents.length === 0) {
                throw new Error(`No unposted ${module} records found in the date range ${startDate} to ${endDate}.`);
            }

            // 2. Generate unique batch number and create parent batch record first (resolving FK constraints)
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

            // 3. Process each document and its lines
            for (const doc of documents) {
                const lines = module === 'AP' ? doc.lineItems : doc.invoiceLines;
                const docNumber = doc.invoiceNumber;
                const docDate = doc.invoiceDate;
                const fxRate = parseFloat(doc.exchangeRate || 1.0);
                const currencyId = doc.currencyId;
                const docDescription = doc.description || `${module} Invoice Posting`;

                if (!lines || lines.length === 0) {
                    logger.warn(`Document ${docNumber} has no line items. Skipping GL posting.`);
                    continue;
                }

                // Verify line items are correctly configured with accounts
                for (const line of lines) {
                    const drAccId = line.DRglAccountId;
                    const crAccId = line.CRglAccountId;
                    const lineAmount = parseFloat(line.lineTotal || 0.00);

                    if (!drAccId || !crAccId) {
                        throw new Error(`Posting Failed: Line item ${line.lineNumber} in document ${docNumber} is missing DRglAccountId or CRglAccountId.`);
                    }

                    if (lineAmount <= 0) {
                        logger.warn(`Line ${line.lineNumber} in document ${docNumber} has zero or negative amount. Skipping line.`);
                        continue;
                    }

                    const localAmt = parseFloat((lineAmount * fxRate).toFixed(2));

                    // Create the balanced double-entry General Ledger record
                    await db.gl.create({
                        bookingDate: docDate,
                        postingReference: docNumber,
                        debit: lineAmount,
                        credit: lineAmount,
                        description: line.description || docDescription,
                        localDebit: localAmt,
                        localCredit: localAmt,
                        rate: fxRate,
                        source: module,
                        status: 'POSTED',
                        glBatchId: batchNumber,
                        drAccountId: drAccId,
                        crAccountId: crAccId,
                        currencyId: currencyId,
                        projectId: line.projectId || doc.projectId || null,
                        contractId: line.contractId || doc.contractId || null,
                        ministryId: line.ministryId || doc.ministryId || null,
                        categoryId: line.categoryId || doc.categoryId || null
                    }, { transaction: t });

                    totalEntriesPosted++;
                    totalAmountPosted += lineAmount;
                }

                // Mark the sub-ledger invoice as POSTED
                await doc.update({
                    glPostingStatus: 'posted',
                    glPostingDate: new Date(),
                    glBatchId: batchNumber
                }, { transaction: t });
            }

            // 4. Update the Batch Run log audit record with actual totals
            await batchLog.update({
                totalEntriesPosted,
                totalAmountPosted
            }, { transaction: t });

            // Commit atomic transaction
            await t.commit();
            logger.info(`GL posting batch run ${batchNumber} completed successfully. Posted entries: ${totalEntriesPosted}`);

            return batchLog.toJSON();

        } catch (error) {
            // Roll back all changes if any single record fails
            await t.rollback();
            logger.error(`GL Batch Posting Rollback triggered due to error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = GLPostingService;
