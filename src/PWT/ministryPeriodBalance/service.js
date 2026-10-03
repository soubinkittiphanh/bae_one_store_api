const logger = require('../../api/logger');
const db = require('../../models');
const { Sequelize, Op } = require('sequelize');

const MinistryPeriodBalance = db.ministryPeriodBalance;
const BankPeriodBalance = db.bankPeriodBalance;
const MoneyAdvance = db.moneyAdvance;
const MoneySettlement = db.moneySettlement;
const Ministry = db.ministry;
const Currency = db.currency;
const BankAccount = db.bankAccount;
const User = db.user;

class MinistryPeriodBalanceService {
  /**
   * Helper: format year & month into date range (YYYY-MM-01 to YYYY-MM-LastDay)
   */
  static getMonthDateRange(year, month) {
    const y = parseInt(year);
    const m = parseInt(month);
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0); // last day of month

    const formatDate = (d) => {
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      return `${yearStr}-${monthStr}-${dayStr}`;
    };

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      year: y,
      month: m
    };
  }

  /**
   * Get Master Analysis Summary for a period (e.g. year = 2026, month = 5)
   */
  static async getMasterSummary(branchId, year, month) {
    try {
      const { startDate, endDate, year: y, month: m } = this.getMonthDateRange(year, month);
      const bId = branchId ? parseInt(branchId) : 1;

      // 1. Fetch active ministries, currencies, and bank accounts
      const [ministries, currencies, bankAccounts] = await Promise.all([
        Ministry.findAll({ where: { isActive: true }, order: [['ministryCode', 'ASC']] }),
        Currency.findAll({ where: { isActive: true }, order: [['id', 'ASC']] }),
        BankAccount.findAll({ where: { isActive: true }, order: [['bankName', 'ASC'], ['accountName', 'ASC']] })
      ]);

      const currencyMap = {};
      currencies.forEach(c => {
        currencyMap[c.id] = c;
      });

      // 2. Check if period is closed in MinistryPeriodBalance
      const closedRecord = await MinistryPeriodBalance.findOne({
        where: { branchId: bId, year: y, month: m, isClosed: true },
        include: [{ model: User, as: 'closedByUser', attributes: ['id', 'cus_name'] }]
      });

      const isPeriodClosed = !!closedRecord;
      const periodStatus = {
        year: y,
        month: m,
        startDate,
        endDate,
        isClosed: isPeriodClosed,
        closedAt: closedRecord?.closedAt || null,
        closedBy: closedRecord?.closedByUser?.cus_name || null,
        note: closedRecord?.note || ''
      };

      // 3. Compute Opening Balances (Balance Forward)
      // All transactions strictly before startDate
      const openingQuery = `
        SELECT 
          m.id AS ministryId,
          m.ministryCode,
          m.ministryName,
          c.id AS currencyId,
          c.code AS currencyCode,
          COALESCE(SUM(CASE WHEN ma.bookingDate < :startDate THEN ma.amount ELSE 0 END), 0) AS totalAdvances,
          COALESCE((
            SELECT SUM(s.amount)
            FROM Settlement s
            WHERE s.ministryId = m.id 
              AND s.currencyId = c.id 
              AND (s.isActive IS NULL OR s.isActive = 1)
              AND s.bookingDate < :startDate
          ), 0) AS totalSettlements
        FROM ministry m
        CROSS JOIN currency c
        LEFT JOIN MoneyAdvance ma ON ma.ministryId = m.id AND ma.currencyId = c.id
        WHERE m.isActive = 1 AND c.isActive = 1
        GROUP BY m.id, m.ministryCode, m.ministryName, c.id, c.code
      `;

      const openingRows = await db.sequelize.query(openingQuery, {
        replacements: { startDate },
        type: Sequelize.QueryTypes.SELECT
      });

      // Bank account opening query
      const bankOpeningQuery = `
        SELECT 
          b.id AS bankAccountId,
          b.accountNumber,
          b.accountName,
          b.bankName,
          c.id AS currencyId,
          c.code AS currencyCode,
          COALESCE(SUM(CASE WHEN ma.bookingDate < :startDate THEN ma.amount ELSE 0 END), 0) AS totalAdvances,
          COALESCE((
            SELECT SUM(s.amount)
            FROM Settlement s
            WHERE s.bankAccountId = b.id 
              AND s.currencyId = c.id 
              AND (s.isActive IS NULL OR s.isActive = 1)
              AND s.bookingDate < :startDate
          ), 0) AS totalSettlements
        FROM bankAccount b
        CROSS JOIN currency c
        LEFT JOIN MoneyAdvance ma ON ma.bankAccountId = b.id AND ma.currencyId = c.id
        WHERE b.isActive = 1 AND c.isActive = 1
        GROUP BY b.id, b.accountNumber, b.accountName, b.bankName, c.id, c.code
      `;

      const bankOpeningRows = await db.sequelize.query(bankOpeningQuery, {
        replacements: { startDate },
        type: Sequelize.QueryTypes.SELECT
      });

      // 4. Fetch Current Period Transactions (startDate to endDate)
      const currentAdvances = await MoneyAdvance.findAll({
        where: {
          bookingDate: { [Op.between]: [startDate, endDate] }
        },
        include: [
          { model: Ministry, as: 'ministry', attributes: ['id', 'ministryCode', 'ministryName'] },
          { model: Currency, as: 'currency', attributes: ['id', 'code', 'name'] },
          { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNumber', 'accountName', 'bankName'] }
        ],
        order: [['bookingDate', 'ASC']]
      });

      const currentSettlements = await MoneySettlement.findAll({
        where: {
          bookingDate: { [Op.between]: [startDate, endDate] },
          isActive: true
        },
        include: [
          { model: Ministry, as: 'ministry', attributes: ['id', 'ministryCode', 'ministryName'] },
          { model: Currency, as: 'currency', attributes: ['id', 'code', 'name'] },
          { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNumber', 'accountName', 'bankName'] }
        ],
        order: [['bookingDate', 'ASC']]
      });

      // 5. Structure Balance Forward Data
      const bfMinistryMap = new Map();
      const bfCurrencyTotals = {};

      openingRows.forEach(row => {
        const netOpening = (parseFloat(row.totalAdvances) || 0) - (parseFloat(row.totalSettlements) || 0);
        const cCode = row.currencyCode || 'LAK';

        if (!bfMinistryMap.has(row.ministryId)) {
          bfMinistryMap.set(row.ministryId, {
            ministryId: row.ministryId,
            ministryCode: row.ministryCode,
            ministryName: row.ministryName,
            amounts: {},
            totalLakEquivalent: 0
          });
        }

        const entry = bfMinistryMap.get(row.ministryId);
        entry.amounts[cCode] = (entry.amounts[cCode] || 0) + netOpening;
        bfCurrencyTotals[cCode] = (bfCurrencyTotals[cCode] || 0) + netOpening;
      });

      const bfBankAccountMap = new Map();
      bankOpeningRows.forEach(row => {
        const netOpening = (parseFloat(row.totalAdvances) || 0) - (parseFloat(row.totalSettlements) || 0);
        const cCode = row.currencyCode || 'LAK';

        if (!bfBankAccountMap.has(row.bankAccountId)) {
          bfBankAccountMap.set(row.bankAccountId, {
            bankAccountId: row.bankAccountId,
            accountNumber: row.accountNumber,
            accountName: row.accountName,
            bankName: row.bankName,
            amounts: {},
            totalLakEquivalent: 0
          });
        }

        const entry = bfBankAccountMap.get(row.bankAccountId);
        entry.amounts[cCode] = (entry.amounts[cCode] || 0) + netOpening;
      });

      // 6. Structure Current Advances Data
      const advMinistryMap = new Map();
      const advBankAccountMap = new Map();
      const advCurrencyTotals = {};
      let advTotalLak = 0;

      currentAdvances.forEach(item => {
        const m = item.ministry;
        const b = item.bankAccount;
        const cCode = item.currency?.code || 'LAK';
        const rate = parseFloat(item.exchangeRate) || 1;
        const amt = parseFloat(item.amount) || 0;
        const lakEq = amt * rate;

        const mId = m?.id || 'NO_MINISTRY';
        if (!advMinistryMap.has(mId)) {
          advMinistryMap.set(mId, {
            ministryId: mId,
            ministryCode: m?.ministryCode || 'N/A',
            ministryName: m?.ministryName || 'No Ministry',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const mEntry = advMinistryMap.get(mId);
        mEntry.amounts[cCode] = (mEntry.amounts[cCode] || 0) + amt;
        mEntry.totalLakEquivalent += lakEq;

        const bIdKey = b?.id || 'NO_BANK_ACCOUNT';
        if (!advBankAccountMap.has(bIdKey)) {
          advBankAccountMap.set(bIdKey, {
            bankAccountId: bIdKey,
            accountNumber: b?.accountNumber || 'N/A',
            accountName: b?.accountName || 'Cash',
            bankName: b?.bankName || 'Cash Drawer',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const bEntry = advBankAccountMap.get(bIdKey);
        bEntry.amounts[cCode] = (bEntry.amounts[cCode] || 0) + amt;
        bEntry.totalLakEquivalent += lakEq;

        advCurrencyTotals[cCode] = (advCurrencyTotals[cCode] || 0) + amt;
        advTotalLak += lakEq;
      });

      // 7. Structure Current Settlements Data
      const setMinistryMap = new Map();
      const setBankAccountMap = new Map();
      const setCurrencyTotals = {};
      let setTotalLak = 0;

      currentSettlements.forEach(item => {
        const m = item.ministry;
        const b = item.bankAccount;
        const cCode = item.currency?.code || 'LAK';
        const rate = parseFloat(item.exchangeRate) || 1;
        const amt = parseFloat(item.amount) || 0;
        const lakEq = amt * rate;

        const mId = m?.id || 'NO_MINISTRY';
        if (!setMinistryMap.has(mId)) {
          setMinistryMap.set(mId, {
            ministryId: mId,
            ministryCode: m?.ministryCode || 'N/A',
            ministryName: m?.ministryName || 'No Ministry',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const mEntry = setMinistryMap.get(mId);
        mEntry.amounts[cCode] = (mEntry.amounts[cCode] || 0) + amt;
        mEntry.totalLakEquivalent += lakEq;

        const bIdKey = b?.id || 'NO_BANK_ACCOUNT';
        if (!setBankAccountMap.has(bIdKey)) {
          setBankAccountMap.set(bIdKey, {
            bankAccountId: bIdKey,
            accountNumber: b?.accountNumber || 'N/A',
            accountName: b?.accountName || 'Cash',
            bankName: b?.bankName || 'Cash Drawer',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const bEntry = setBankAccountMap.get(bIdKey);
        bEntry.amounts[cCode] = (bEntry.amounts[cCode] || 0) + amt;
        bEntry.totalLakEquivalent += lakEq;

        setCurrencyTotals[cCode] = (setCurrencyTotals[cCode] || 0) + amt;
        setTotalLak += lakEq;
      });

      // Compute LAK equivalents for Balance Forward using currency exchange rates
      const exchangeRates = { LAK: 1, THB: 650, USD: 22000, CNY: 3100 };
      currencies.forEach(c => {
        if (c.exchangeRate) exchangeRates[c.code] = parseFloat(c.exchangeRate);
      });

      let bfTotalLak = 0;
      bfMinistryMap.forEach(m => {
        let lakSum = 0;
        Object.keys(m.amounts).forEach(curr => {
          const rate = exchangeRates[curr] || 1;
          lakSum += (m.amounts[curr] || 0) * rate;
        });
        m.totalLakEquivalent = lakSum;
        bfTotalLak += lakSum;
      });

      bfBankAccountMap.forEach(b => {
        let lakSum = 0;
        Object.keys(b.amounts).forEach(curr => {
          const rate = exchangeRates[curr] || 1;
          lakSum += (b.amounts[curr] || 0) * rate;
        });
        b.totalLakEquivalent = lakSum;
      });

      // 8. Closing Balances = Opening + Advances - Settlements
      const closingMinistryMap = new Map();
      const allMinistryIds = new Set([...bfMinistryMap.keys(), ...advMinistryMap.keys(), ...setMinistryMap.keys()]);

      allMinistryIds.forEach(mId => {
        const bf = bfMinistryMap.get(mId);
        const adv = advMinistryMap.get(mId);
        const st = setMinistryMap.get(mId);

        const code = bf?.ministryCode || adv?.ministryCode || st?.ministryCode || 'N/A';
        const name = bf?.ministryName || adv?.ministryName || st?.ministryName || 'Unknown';

        const amounts = {};
        const allCurrencies = new Set([
          ...Object.keys(bf?.amounts || {}),
          ...Object.keys(adv?.amounts || {}),
          ...Object.keys(st?.amounts || {})
        ]);

        let lakEq = 0;
        allCurrencies.forEach(curr => {
          const bVal = bf?.amounts?.[curr] || 0;
          const aVal = adv?.amounts?.[curr] || 0;
          const sVal = st?.amounts?.[curr] || 0;
          const net = bVal + aVal - sVal;
          amounts[curr] = net;
          lakEq += net * (exchangeRates[curr] || 1);
        });

        closingMinistryMap.set(mId, {
          ministryId: mId,
          ministryCode: code,
          ministryName: name,
          amounts,
          totalLakEquivalent: lakEq
        });
      });

      const closingCurrencyTotals = {};
      const allCurrs = new Set([
        ...Object.keys(bfCurrencyTotals),
        ...Object.keys(advCurrencyTotals),
        ...Object.keys(setCurrencyTotals)
      ]);
      let closingTotalLak = 0;

      allCurrs.forEach(curr => {
        const net = (bfCurrencyTotals[curr] || 0) + (advCurrencyTotals[curr] || 0) - (setCurrencyTotals[curr] || 0);
        closingCurrencyTotals[curr] = net;
        closingTotalLak += net * (exchangeRates[curr] || 1);
      });

      return {
        success: true,
        period: periodStatus,
        balanceForward: {
          byMinistry: Array.from(bfMinistryMap.values()).filter(m => Math.abs(m.totalLakEquivalent) > 0.01 || Object.values(m.amounts).some(v => Math.abs(v) > 0.01)),
          byBankAccount: Array.from(bfBankAccountMap.values()).filter(b => Math.abs(b.totalLakEquivalent) > 0.01 || Object.values(b.amounts).some(v => Math.abs(v) > 0.01)),
          totals: {
            currencyTotals: bfCurrencyTotals,
            totalLakEquivalent: bfTotalLak
          }
        },
        currentAdvances: {
          byMinistry: Array.from(advMinistryMap.values()),
          byBankAccount: Array.from(advBankAccountMap.values()),
          totals: {
            currencyTotals: advCurrencyTotals,
            totalLakEquivalent: advTotalLak
          }
        },
        currentSettlements: {
          byMinistry: Array.from(setMinistryMap.values()),
          byBankAccount: Array.from(setBankAccountMap.values()),
          totals: {
            currencyTotals: setCurrencyTotals,
            totalLakEquivalent: setTotalLak
          }
        },
        closingBalance: {
          byMinistry: Array.from(closingMinistryMap.values()).filter(m => Math.abs(m.totalLakEquivalent) > 0.01 || Object.values(m.amounts).some(v => Math.abs(v) > 0.01)),
          totals: {
            currencyTotals: closingCurrencyTotals,
            totalLakEquivalent: closingTotalLak
          }
        },
        exchangeRates
      };
    } catch (error) {
      logger.error('Error in getMasterSummary service:', error);
      throw error;
    }
  }

  /**
   * Close a period (Lock balance and freeze snapshot)
   */
  static async closePeriod(branchId, year, month, userId, note) {
    try {
      const summary = await this.getMasterSummary(branchId, year, month);
      const bId = branchId ? parseInt(branchId) : 1;
      const y = parseInt(year);
      const m = parseInt(month);

      const recordsToUpsert = [];
      const currencies = await Currency.findAll({ where: { isActive: true } });

      for (const mItem of summary.closingBalance.byMinistry) {
        if (mItem.ministryId === 'NO_MINISTRY') continue;

        for (const curr of currencies) {
          const opening = summary.balanceForward.byMinistry.find(b => b.ministryId === mItem.ministryId)?.amounts?.[curr.code] || 0;
          const advances = summary.currentAdvances.byMinistry.find(a => a.ministryId === mItem.ministryId)?.amounts?.[curr.code] || 0;
          const settlements = summary.currentSettlements.byMinistry.find(s => s.ministryId === mItem.ministryId)?.amounts?.[curr.code] || 0;
          const closing = mItem.amounts?.[curr.code] || 0;

          if (opening !== 0 || advances !== 0 || settlements !== 0 || closing !== 0) {
            recordsToUpsert.push({
              branchId: bId,
              ministryId: mItem.ministryId,
              currencyId: curr.id,
              year: y,
              month: m,
              openingBalance: opening,
              totalAdvances: advances,
              totalSettlements: settlements,
              closingBalance: closing,
              exchangeRateLak: summary.exchangeRates[curr.code] || 1,
              isClosed: true,
              closedAt: new Date(),
              closedBy: userId || null,
              note: note || `Closed on ${new Date().toISOString().slice(0, 10)}`
            });
          }
        }
      }

      for (const rec of recordsToUpsert) {
        const existing = await MinistryPeriodBalance.findOne({
          where: {
            branchId: rec.branchId,
            ministryId: rec.ministryId,
            currencyId: rec.currencyId,
            year: rec.year,
            month: rec.month
          }
        });

        if (existing) {
          await existing.update(rec);
        } else {
          await MinistryPeriodBalance.create(rec);
        }
      }

      logger.info(`Successfully closed period ${y}-${m} with ${recordsToUpsert.length} ministry snapshots.`);
      return { success: true, count: recordsToUpsert.length };
    } catch (error) {
      logger.error('Error in closePeriod service:', error);
      throw error;
    }
  }

  /**
   * Reopen a closed period
   */
  static async reopenPeriod(branchId, year, month, userId) {
    try {
      const bId = branchId ? parseInt(branchId) : 1;
      const y = parseInt(year);
      const m = parseInt(month);

      const [updated] = await MinistryPeriodBalance.update(
        {
          isClosed: false,
          closedAt: null,
          closedBy: null,
          note: `Reopened by user ${userId || 'admin'} on ${new Date().toISOString().slice(0, 10)}`
        },
        {
          where: { branchId: bId, year: y, month: m }
        }
      );

      return { success: true, updated };
    } catch (error) {
      logger.error('Error in reopenPeriod service:', error);
      throw error;
    }
  }

  /**
   * Historical Backfill Utility
   */
  static async backfillAllHistory(branchId, userId) {
    try {
      const bId = branchId ? parseInt(branchId) : 1;
      
      const earliestAdvance = await MoneyAdvance.findOne({
        order: [['bookingDate', 'ASC']],
        attributes: ['bookingDate']
      });

      const earliestSettlement = await MoneySettlement.findOne({
        where: { isActive: true },
        order: [['bookingDate', 'ASC']],
        attributes: ['bookingDate']
      });

      let earliestDateStr = '2023-01-01';
      if (earliestAdvance?.bookingDate) earliestDateStr = earliestAdvance.bookingDate;
      if (earliestSettlement?.bookingDate && earliestSettlement.bookingDate < earliestDateStr) {
        earliestDateStr = earliestSettlement.bookingDate;
      }

      const [startYearStr, startMonthStr] = earliestDateStr.split('-');
      let currentYear = parseInt(startYearStr);
      let currentMonth = parseInt(startMonthStr);

      const today = new Date();
      const endYear = today.getFullYear();
      const endMonth = today.getMonth() + 1;

      const processedPeriods = [];

      while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        logger.info(`Backfilling period ${currentYear}-${currentMonth}...`);
        await this.closePeriod(bId, currentYear, currentMonth, userId, 'Automatic Historical Backfill');
        processedPeriods.push({ year: currentYear, month: currentMonth, status: 'processed' });

        if (currentMonth === 12) {
          currentYear++;
          currentMonth = 1;
        } else {
          currentMonth++;
        }
      }

      return {
        success: true,
        message: `Successfully backfilled ${processedPeriods.length} periods from ${earliestDateStr}`,
        processedPeriods
      };
    } catch (error) {
      logger.error('Error in backfillAllHistory service:', error);
      throw error;
    }
  }
}

module.exports = MinistryPeriodBalanceService;
