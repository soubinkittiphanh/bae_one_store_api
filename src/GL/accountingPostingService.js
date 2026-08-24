const db = require('../models');
const logger = require('../api/logger');

class AccountingPostingService {
  /**
   * Helper to retrieve account ID from SPF parameter configuration
   */
  static async getMappedAccountId(code) {
    const param = await db.spf.findOne({ where: { code } });
    if (!param || !param.value) {
      throw new Error(`Accounting GL mapping parameter ${code} not found in SPF configuration.`);
    }
    const accountNumber = parseInt(param.value, 10);
    if (isNaN(accountNumber)) {
      throw new Error(`Invalid Account Number configured in system parameter: ${code}`);
    }
    const account = await db.chartAccount.findOne({ where: { accountNumber } });
    if (!account) {
      throw new Error(`Chart of account with number ${accountNumber} configured in ${code} not found in database.`);
    }
    return account.id;
  }

  /**
   * Helper to determine Debit account for sales based on payment type
   */
  static async getSaleDebitAccount(paymentId) {
    let paymentCode = 'CASH';
    if (paymentId) {
      const payment = await db.payment.findByPk(paymentId);
      if (payment) {
        paymentCode = String(payment.payment_code || '').toUpperCase();
      }
    }

    if (paymentCode === 'CASH' || paymentCode === 'COD') {
      return await this.getMappedAccountId('GL_MAP_CASH_ACC');
    } else if (paymentCode === 'CREDIT') {
      return await this.getMappedAccountId('GL_MAP_AR_ACC');
    } else {
      // Default all bank transfers, JDB, BCEL, QR scans, etc. to Bank account
      return await this.getMappedAccountId('GL_MAP_BANK_ACC');
    }
  }

  /**
   * Automatically post balanced double entries to the GL for POS sales
   */
  static async postSaleEntry(saleHeader, transaction) {
    logger.info(`AccountingPostingService: Creating GL entries for Sale Header ID ${saleHeader.id}`);

    try {
      const bookingDate = saleHeader.bookingDate;
      const refNo = saleHeader.referenceNo || `SALE-${saleHeader.id}`;
      const totalAmount = parseFloat(saleHeader.total || 0);
      const rate = parseFloat(saleHeader.exchangeRate || 1.0);
      const currencyId = saleHeader.currencyId;

      if (totalAmount <= 0) {
        logger.warn(`AccountingPostingService: Sale Header ID ${saleHeader.id} has zero or negative amount. Skipping GL post.`);
        return;
      }

      // 1. Payment/Receivable (Debit) & Revenue (Credit)
      const debitAccountId = await this.getSaleDebitAccount(saleHeader.paymentId);
      const revenueAccountId = await this.getMappedAccountId('GL_MAP_REV_ACC');

      const localAmount = parseFloat((totalAmount * rate).toFixed(2));

      await db.gl.create({
        bookingDate,
        postingReference: refNo,
        debit: totalAmount,
        credit: totalAmount,
        description: `POS Sale Receipt #${saleHeader.id}`,
        localDebit: localAmount,
        localCredit: localAmount,
        rate,
        source: 'AR',
        status: 'POSTED',
        drAccountId: debitAccountId,
        crAccountId: revenueAccountId,
        currencyId
      }, { transaction });

      logger.info(`AccountingPostingService: Successfully posted Revenue entry: DR ${debitAccountId}, CR ${revenueAccountId} for ${totalAmount}`);

      // 2. Inventory (Credit) & COGS (Debit) (if physical stock items exist)
      // Fetch all active currencies to support dynamic home currency conversion
      const currencies = await db.currency.findAll({ transaction });
      const localCurrency = currencies.find(c => c.isLocalCCY === true || c.isLocalCCY === 1) || { code: 'LAK', rate: 1.0, exchangeDirection: 'local_to_foreign' };

      const convertToHomeCurrency = (amount, ccyId) => {
        const val = parseFloat(amount || 0);
        if (isNaN(val) || val === 0) return 0;

        const fromCurrency = currencies.find(c => c.id === ccyId);
        
        // Step 1: Convert card cost to database base currency (LAK)
        let amountInLAK = val;
        if (fromCurrency && fromCurrency.code !== 'LAK') {
          if (fromCurrency.exchangeDirection === 'local_to_foreign') {
            amountInLAK = val / (parseFloat(fromCurrency.rate) || 1.0);
          } else {
            amountInLAK = val * (parseFloat(fromCurrency.rate) || 1.0);
          }
        }

        // Step 2: Convert LAK to dynamic home currency
        if (localCurrency.code === 'LAK') {
          return amountInLAK;
        }
        if (localCurrency.exchangeDirection === 'local_to_foreign') {
          return amountInLAK * (parseFloat(localCurrency.rate) || 1.0);
        } else {
          return amountInLAK / (parseFloat(localCurrency.rate) || 1.0);
        }
      };

      // Fetch lines with associated cards & products
      const lines = await db.saleLine.findAll({
        where: { saleHeaderId: saleHeader.id, isActive: true },
        include: [
          { model: db.card, as: 'cards' },
          { model: db.product, as: 'product' }
        ],
        transaction
      });

      let totalCOGSInHome = 0;
      for (const line of lines) {
        if (line.cards && line.cards.length > 0) {
          const lineCostInHome = line.cards.reduce((sum, card) => {
            return sum + convertToHomeCurrency(card.cost, card.currencyId);
          }, 0);
          totalCOGSInHome += lineCostInHome;
        } else if (line.product) {
          const productCostInHome = convertToHomeCurrency(
            parseFloat(line.product.costPrice || line.product.cost_price || 0),
            line.product.costCurrencyId || line.product.purchaseCurrencyId || 1
          );
          totalCOGSInHome += productCostInHome * parseFloat(line.quantity || 0);
        }
      }

      if (totalCOGSInHome > 0) {
        const totalCOGS = rate > 0 ? parseFloat((totalCOGSInHome / rate).toFixed(2)) : 0;
        const localCOGS = parseFloat(totalCOGSInHome.toFixed(2));
        const cogsAccountId = await this.getMappedAccountId('GL_MAP_COGS_ACC');
        const inventoryAccountId = await this.getMappedAccountId('GL_MAP_INV_ACC');

        await db.gl.create({
          bookingDate,
          postingReference: refNo,
          debit: totalCOGS,
          credit: totalCOGS,
          description: `COGS posting for POS Sale #${saleHeader.id}`,
          localDebit: localCOGS,
          localCredit: localCOGS,
          rate,
          source: 'AR',
          status: 'POSTED',
          drAccountId: cogsAccountId,
          crAccountId: inventoryAccountId,
          currencyId
        }, { transaction });

        logger.info(`AccountingPostingService: Successfully posted Inventory/COGS entry: DR ${cogsAccountId}, CR ${inventoryAccountId} for ${totalCOGS}`);
      }

    } catch (error) {
      logger.error(`AccountingPostingService: Error posting sale entries: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reverse sale journal entries in case of cancellation
   */
  static async postSaleReversalEntry(saleHeader, transaction) {
    logger.info(`AccountingPostingService: Creating GL reversal entries for Sale Header ID ${saleHeader.id}`);

    try {
      const bookingDate = saleHeader.bookingDate;
      const refNo = `REV-SALE-${saleHeader.id}`;
      const totalAmount = parseFloat(saleHeader.total || 0);
      const rate = parseFloat(saleHeader.exchangeRate || 1.0);
      const currencyId = saleHeader.currencyId;

      if (totalAmount <= 0) return;

      // Reverse Revenue: Debit Sales Revenue, Credit Cash/Bank/AR
      const originalDebitAccountId = await this.getSaleDebitAccount(saleHeader.paymentId);
      const originalCreditAccountId = await this.getMappedAccountId('GL_MAP_REV_ACC');
      const localAmount = parseFloat((totalAmount * rate).toFixed(2));

      await db.gl.create({
        bookingDate,
        postingReference: refNo,
        debit: totalAmount,
        credit: totalAmount,
        description: `POS Sale Reversal Receipt #${saleHeader.id}`,
        localDebit: localAmount,
        localCredit: localAmount,
        rate,
        source: 'AR',
        status: 'POSTED',
        drAccountId: originalCreditAccountId, // Debit Revenue
        crAccountId: originalDebitAccountId,  // Credit Cash/Bank/AR
        currencyId
      }, { transaction });

      // Reverse Inventory: Debit Inventory, Credit COGS
      // Fetch all active currencies to support dynamic home currency conversion
      const currencies = await db.currency.findAll({ transaction });
      const localCurrency = currencies.find(c => c.isLocalCCY === true || c.isLocalCCY === 1) || { code: 'LAK', rate: 1.0, exchangeDirection: 'local_to_foreign' };

      const convertToHomeCurrency = (amount, ccyId) => {
        const val = parseFloat(amount || 0);
        if (isNaN(val) || val === 0) return 0;

        const fromCurrency = currencies.find(c => c.id === ccyId);
        
        // Step 1: Convert card cost to database base currency (LAK)
        let amountInLAK = val;
        if (fromCurrency && fromCurrency.code !== 'LAK') {
          if (fromCurrency.exchangeDirection === 'local_to_foreign') {
            amountInLAK = val / (parseFloat(fromCurrency.rate) || 1.0);
          } else {
            amountInLAK = val * (parseFloat(fromCurrency.rate) || 1.0);
          }
        }

        // Step 2: Convert LAK to dynamic home currency
        if (localCurrency.code === 'LAK') {
          return amountInLAK;
        }
        if (localCurrency.exchangeDirection === 'local_to_foreign') {
          return amountInLAK * (parseFloat(localCurrency.rate) || 1.0);
        } else {
          return amountInLAK / (parseFloat(localCurrency.rate) || 1.0);
        }
      };

      const lines = await db.saleLine.findAll({
        where: { saleHeaderId: saleHeader.id },
        include: [
          { model: db.card, as: 'cards' },
          { model: db.product, as: 'product' }
        ],
        transaction
      });

      let totalCOGSInHome = 0;
      for (const line of lines) {
        if (line.cards && line.cards.length > 0) {
          const lineCostInHome = line.cards.reduce((sum, card) => {
            return sum + convertToHomeCurrency(card.cost, card.currencyId);
          }, 0);
          totalCOGSInHome += lineCostInHome;
        } else if (line.product) {
          const productCostInHome = convertToHomeCurrency(
            parseFloat(line.product.costPrice || line.product.cost_price || 0),
            line.product.costCurrencyId || line.product.purchaseCurrencyId || 1
          );
          totalCOGSInHome += productCostInHome * parseFloat(line.quantity || 0);
        }
      }

      if (totalCOGSInHome > 0) {
        const totalCOGS = rate > 0 ? parseFloat((totalCOGSInHome / rate).toFixed(2)) : 0;
        const localCOGS = parseFloat(totalCOGSInHome.toFixed(2));
        const cogsAccountId = await this.getMappedAccountId('GL_MAP_COGS_ACC');
        const inventoryAccountId = await this.getMappedAccountId('GL_MAP_INV_ACC');

        await db.gl.create({
          bookingDate,
          postingReference: refNo,
          debit: totalCOGS,
          credit: totalCOGS,
          description: `COGS reversal posting for POS Sale #${saleHeader.id}`,
          localDebit: localCOGS,
          localCredit: localCOGS,
          rate,
          source: 'AR',
          status: 'POSTED',
          drAccountId: inventoryAccountId, // Debit Inventory (return item to inventory)
          crAccountId: cogsAccountId,       // Credit COGS (remove cost)
          currencyId
        }, { transaction });
      }

    } catch (error) {
      logger.error(`AccountingPostingService: Error posting sale reversals: ${error.message}`);
      throw error;
    }
  }

  /**
   * Post GL double entries for stock receiving (topup)
   */
  static async postStockTopupEntry(receivingHeader, lines, transaction) {
    logger.info(`AccountingPostingService: Creating GL entries for Stock Topup (Receiving Header ID ${receivingHeader.id})`);

    try {
      const bookingDate = receivingHeader.bookingDate;
      const refNo = receivingHeader.referenceNo || `REC-${receivingHeader.id}`;
      const rate = parseFloat(receivingHeader.exchangeRate || 1.0);
      const currencyId = receivingHeader.currencyId;

      // Calculate total cost of receiving lines
      let totalCost = 0;
      for (const line of lines) {
        const qty = parseFloat(line.quantity || 0);
        const cost = parseFloat(line.cost || 0);
        totalCost += qty * cost;
      }

      if (totalCost <= 0) {
        logger.warn(`AccountingPostingService: Stock topup cost is zero. Skipping GL post.`);
        return;
      }

      // Debit: Inventory, Credit: Accounts Payable
      const inventoryAccountId = await this.getMappedAccountId('GL_MAP_INV_ACC');
      const apAccountId = await this.getMappedAccountId('GL_MAP_AP_ACC');
      const localCost = parseFloat((totalCost * rate).toFixed(2));

      await db.gl.create({
        bookingDate,
        postingReference: refNo,
        debit: totalCost,
        credit: totalCost,
        description: `Stock Inward / Topup #${receivingHeader.id}`,
        localDebit: localCost,
        localCredit: localCost,
        rate,
        source: 'AP',
        status: 'POSTED',
        drAccountId: inventoryAccountId,
        crAccountId: apAccountId,
        currencyId
      }, { transaction });

      logger.info(`AccountingPostingService: Successfully posted Stock Topup entry: DR ${inventoryAccountId}, CR ${apAccountId} for ${totalCost}`);

    } catch (error) {
      logger.error(`AccountingPostingService: Error posting stock topup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reverse stock receiving entries on deletion
   */
  static async postStockDeletionEntry(receivingHeader, lines, transaction) {
    logger.info(`AccountingPostingService: Creating GL reversal entries for Deleting Stock (Receiving Header ID ${receivingHeader.id})`);

    try {
      const bookingDate = receivingHeader.bookingDate;
      const refNo = `REV-REC-${receivingHeader.id}`;
      const rate = parseFloat(receivingHeader.exchangeRate || 1.0);
      const currencyId = receivingHeader.currencyId;

      let totalCost = 0;
      for (const line of lines) {
        const qty = parseFloat(line.quantity || 0);
        const cost = parseFloat(line.cost || 0);
        totalCost += qty * cost;
      }

      if (totalCost <= 0) return;

      // Debit: Accounts Payable, Credit: Inventory (Reverse topup)
      const inventoryAccountId = await this.getMappedAccountId('GL_MAP_INV_ACC');
      const apAccountId = await this.getMappedAccountId('GL_MAP_AP_ACC');
      const localCost = parseFloat((totalCost * rate).toFixed(2));

      await db.gl.create({
        bookingDate,
        postingReference: refNo,
        debit: totalCost,
        credit: totalCost,
        description: `Reversal of Stock Inward / Topup #${receivingHeader.id}`,
        localDebit: localCost,
        localCredit: localCost,
        rate,
        source: 'AP',
        status: 'POSTED',
        drAccountId: apAccountId,
        crAccountId: inventoryAccountId,
        currencyId
      }, { transaction });

    } catch (error) {
      logger.error(`AccountingPostingService: Error posting stock deletion: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AccountingPostingService;
