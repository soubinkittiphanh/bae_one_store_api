const { Sequelize, Op } = require('sequelize');
const db = require('../../models');
const logger = require('../../api/logger');

const MinistryPeriodBalance = db.ministryPeriodBalance;
const BankPeriodBalance = db.bankPeriodBalance;
const MoneyAdvance = db.moneyAdvance;
const MoneySettlement = db.moneySettlement;
const Ministry = db.ministry;
const BankAccount = db.bankAccount;
const Currency = db.currency;
const User = db.user;

class MinistryPeriodBalanceService {
  /**
   * Helper to get start and end dates for a year and month
   */
  static getMonthDateRange(year, month) {
    const y = parseInt(year);
    const m = parseInt(month);
    const mStr = String(m).padStart(2, '0');
    const startDate = `${y}-${mStr}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate, y, m };
  }

  /**
   * Unified Master Summary Engine
   */
  static async getMasterSummary(branchId, year, month) {
    try {
      const { startDate, endDate, y, m } = this.getMonthDateRange(year, month);
      const bId = branchId ? parseInt(branchId) : 1;

      // 1. Fetch active currencies & exchange rates
      const currencies = await Currency.findAll({ where: { isActive: true } });
      const currencyMap = new Map();
      const exchangeRates = { LAK: 1, THB: 670, USD: 21200, CNY: 3100 };
      currencies.forEach(c => {
        currencyMap.set(c.id, c);
        if (c.rate) exchangeRates[c.code] = parseFloat(c.rate);
      });

      // 2. Check if period is closed
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
      // Capture ALL advances & settlements before startDate (including NULL ministry)
      const openingAdvQuery = `
        SELECT 
          COALESCE(ma.ministryId, 0) AS ministryId,
          COALESCE(m.ministryCode, 'NO_MINISTRY') AS ministryCode,
          COALESCE(m.ministryName, 'ລາຍການບໍ່ລະບຸກົມ (Unassigned)') AS ministryName,
          COALESCE(ma.bankAccountId, 0) AS bankAccountId,
          COALESCE(b.accountNumber, 'N/A') AS accountNumber,
          COALESCE(b.accountName, 'Cash') AS accountName,
          COALESCE(b.bankName, 'Cash Drawer') AS bankName,
          COALESCE(ma.currencyId, 1) AS currencyId,
          COALESCE(c.code, 'LAK') AS currencyCode,
          SUM(ma.amount) AS totalAdvances,
          SUM(ma.amount * COALESCE(NULLIF(ma.exchangeRate, 0), c.rate, 1)) AS totalAdvancesLak
        FROM MoneyAdvance ma
        LEFT JOIN ministry m ON m.id = ma.ministryId
        LEFT JOIN bankAccount b ON b.id = ma.bankAccountId
        LEFT JOIN currency c ON c.id = ma.currencyId
        WHERE ma.bookingDate < :startDate
        GROUP BY COALESCE(ma.ministryId, 0), COALESCE(ma.bankAccountId, 0), COALESCE(ma.currencyId, 1)
      `;

      const openingSetQuery = `
        SELECT 
          COALESCE(s.ministryId, 0) AS ministryId,
          COALESCE(m.ministryCode, 'NO_MINISTRY') AS ministryCode,
          COALESCE(m.ministryName, 'ລາຍການບໍ່ລະບຸກົມ (Unassigned)') AS ministryName,
          COALESCE(s.bankAccountId, 0) AS bankAccountId,
          COALESCE(b.accountNumber, 'N/A') AS accountNumber,
          COALESCE(b.accountName, 'Cash') AS accountName,
          COALESCE(b.bankName, 'Cash Drawer') AS bankName,
          COALESCE(s.currencyId, 1) AS currencyId,
          COALESCE(c.code, 'LAK') AS currencyCode,
          SUM(s.amount) AS totalSettlements,
          SUM(s.amount * COALESCE(NULLIF(s.exchangeRate, 0), c.rate, 1)) AS totalSettlementsLak
        FROM Settlement s
        LEFT JOIN ministry m ON m.id = s.ministryId
        LEFT JOIN bankAccount b ON b.id = s.bankAccountId
        LEFT JOIN currency c ON c.id = s.currencyId
        WHERE s.bookingDate < :startDate AND (s.isActive IS NULL OR s.isActive = 1)
        GROUP BY COALESCE(s.ministryId, 0), COALESCE(s.bankAccountId, 0), COALESCE(s.currencyId, 1)
      `;

      const [openingAdvRows, openingSetRows] = await Promise.all([
        db.sequelize.query(openingAdvQuery, { replacements: { startDate }, type: Sequelize.QueryTypes.SELECT }),
        db.sequelize.query(openingSetQuery, { replacements: { startDate }, type: Sequelize.QueryTypes.SELECT })
      ]);

      // 4. Fetch Current Period Transactions (startDate to endDate)
      const currentAdvances = await MoneyAdvance.findAll({
        where: {
          bookingDate: { [Op.between]: [startDate, endDate] }
        },
        include: [
          { model: Ministry, as: 'ministry', attributes: ['id', 'ministryCode', 'ministryName'] },
          { model: Currency, as: 'currency', attributes: ['id', 'code', 'name', 'rate'] },
          { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNumber', 'accountName', 'bankName'] }
        ],
        order: [['bookingDate', 'ASC']]
      });

      const currentSettlements = await MoneySettlement.findAll({
        where: {
          bookingDate: { [Op.between]: [startDate, endDate] },
          isActive: { [Op.or]: [true, null, 1] }
        },
        include: [
          { model: Ministry, as: 'ministry', attributes: ['id', 'ministryCode', 'ministryName'] },
          { model: Currency, as: 'currency', attributes: ['id', 'code', 'name', 'rate'] },
          { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNumber', 'accountName', 'bankName'] }
        ],
        order: [['bookingDate', 'ASC']]
      });

      // 5. Build Balance Forward Structures
      const bfMinistryMap = new Map();
      const bfBankAccountMap = new Map();
      const bfCurrencyTotals = {};
      let bfTotalLak = 0;

      openingAdvRows.forEach(row => {
        const mId = row.ministryId;
        const bId = row.bankAccountId;
        const cCode = row.currencyCode || 'LAK';
        const amt = parseFloat(row.totalAdvances) || 0;
        const lak = parseFloat(row.totalAdvancesLak) || (amt * (exchangeRates[cCode] || 1));

        // Ministry BF
        if (!bfMinistryMap.has(mId)) {
          bfMinistryMap.set(mId, {
            ministryId: mId,
            ministryCode: row.ministryCode,
            ministryName: row.ministryName,
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const mEntry = bfMinistryMap.get(mId);
        mEntry.amounts[cCode] = (mEntry.amounts[cCode] || 0) + amt;
        mEntry.totalLakEquivalent += lak;

        // Bank BF
        if (!bfBankAccountMap.has(bId)) {
          bfBankAccountMap.set(bId, {
            bankAccountId: bId,
            accountNumber: row.accountNumber,
            accountName: row.accountName,
            bankName: row.bankName,
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const bEntry = bfBankAccountMap.get(bId);
        bEntry.amounts[cCode] = (bEntry.amounts[cCode] || 0) + amt;
        bEntry.totalLakEquivalent += lak;

        bfCurrencyTotals[cCode] = (bfCurrencyTotals[cCode] || 0) + amt;
        bfTotalLak += lak;
      });

      openingSetRows.forEach(row => {
        const mId = row.ministryId;
        const bId = row.bankAccountId;
        const cCode = row.currencyCode || 'LAK';
        const amt = parseFloat(row.totalSettlements) || 0;
        const lak = parseFloat(row.totalSettlementsLak) || (amt * (exchangeRates[cCode] || 1));

        // Ministry BF deduction
        if (!bfMinistryMap.has(mId)) {
          bfMinistryMap.set(mId, {
            ministryId: mId,
            ministryCode: row.ministryCode,
            ministryName: row.ministryName,
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const mEntry = bfMinistryMap.get(mId);
        mEntry.amounts[cCode] = (mEntry.amounts[cCode] || 0) - amt;
        mEntry.totalLakEquivalent -= lak;

        // Bank BF deduction
        if (!bfBankAccountMap.has(bId)) {
          bfBankAccountMap.set(bId, {
            bankAccountId: bId,
            accountNumber: row.accountNumber,
            accountName: row.accountName,
            bankName: row.bankName,
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const bEntry = bfBankAccountMap.get(bId);
        bEntry.amounts[cCode] = (bEntry.amounts[cCode] || 0) - amt;
        bEntry.totalLakEquivalent -= lak;

        bfCurrencyTotals[cCode] = (bfCurrencyTotals[cCode] || 0) - amt;
        bfTotalLak -= lak;
      });

      // 6. Build Current Advances Structures
      const advMinistryMap = new Map();
      const advBankAccountMap = new Map();
      const advCurrencyTotals = {};
      let advTotalLak = 0;

      currentAdvances.forEach(item => {
        const m = item.ministry;
        const b = item.bankAccount;
        const cCode = item.currency?.code || 'LAK';
        const officialRate = exchangeRates[cCode] || 1;
        const rate = parseFloat(item.exchangeRate) || officialRate;
        const amt = parseFloat(item.amount) || 0;
        const lakEq = amt * rate;

        const mId = m?.id || 0;
        if (!advMinistryMap.has(mId)) {
          advMinistryMap.set(mId, {
            ministryId: mId,
            ministryCode: m?.ministryCode || 'NO_MINISTRY',
            ministryName: m?.ministryName || 'ລາຍການບໍ່ລະບຸກົມ (Unassigned)',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const mEntry = advMinistryMap.get(mId);
        mEntry.amounts[cCode] = (mEntry.amounts[cCode] || 0) + amt;
        mEntry.totalLakEquivalent += lakEq;

        const bId = b?.id || 0;
        if (!advBankAccountMap.has(bId)) {
          advBankAccountMap.set(bId, {
            bankAccountId: bId,
            accountNumber: b?.accountNumber || 'N/A',
            accountName: b?.accountName || 'Cash',
            bankName: b?.bankName || 'Cash Drawer',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const bEntry = advBankAccountMap.get(bId);
        bEntry.amounts[cCode] = (bEntry.amounts[cCode] || 0) + amt;
        bEntry.totalLakEquivalent += lakEq;

        advCurrencyTotals[cCode] = (advCurrencyTotals[cCode] || 0) + amt;
        advTotalLak += lakEq;
      });

      // 7. Build Current Settlements Structures
      const setMinistryMap = new Map();
      const setBankAccountMap = new Map();
      const setCurrencyTotals = {};
      let setTotalLak = 0;

      currentSettlements.forEach(item => {
        const m = item.ministry;
        const b = item.bankAccount;
        const cCode = item.currency?.code || 'LAK';
        const officialRate = exchangeRates[cCode] || 1;
        const rate = parseFloat(item.exchangeRate) || officialRate;
        const amt = parseFloat(item.amount) || 0;
        const lakEq = amt * rate;

        const mId = m?.id || 0;
        if (!setMinistryMap.has(mId)) {
          setMinistryMap.set(mId, {
            ministryId: mId,
            ministryCode: m?.ministryCode || 'NO_MINISTRY',
            ministryName: m?.ministryName || 'ລາຍການບໍ່ລະບຸກົມ (Unassigned)',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const mEntry = setMinistryMap.get(mId);
        mEntry.amounts[cCode] = (mEntry.amounts[cCode] || 0) + amt;
        mEntry.totalLakEquivalent += lakEq;

        const bId = b?.id || 0;
        if (!setBankAccountMap.has(bId)) {
          setBankAccountMap.set(bId, {
            bankAccountId: bId,
            accountNumber: b?.accountNumber || 'N/A',
            accountName: b?.accountName || 'Cash',
            bankName: b?.bankName || 'Cash Drawer',
            amounts: {},
            totalLakEquivalent: 0
          });
        }
        const bEntry = setBankAccountMap.get(bId);
        bEntry.amounts[cCode] = (bEntry.amounts[cCode] || 0) + amt;
        bEntry.totalLakEquivalent += lakEq;

        setCurrencyTotals[cCode] = (setCurrencyTotals[cCode] || 0) + amt;
        setTotalLak += lakEq;
      });

      // 8. Build Closing Balances
      const closingMinistryMap = new Map();
      const allMinistryIds = new Set([...bfMinistryMap.keys(), ...advMinistryMap.keys(), ...setMinistryMap.keys()]);

      allMinistryIds.forEach(mId => {
        const bf = bfMinistryMap.get(mId);
        const adv = advMinistryMap.get(mId);
        const st = setMinistryMap.get(mId);

        const code = bf?.ministryCode || adv?.ministryCode || st?.ministryCode || 'NO_MINISTRY';
        const name = bf?.ministryName || adv?.ministryName || st?.ministryName || 'Unassigned';

        const amounts = {};
        const allCurrencies = new Set([
          ...Object.keys(bf?.amounts || {}),
          ...Object.keys(adv?.amounts || {}),
          ...Object.keys(st?.amounts || {})
        ]);

        let lakEq = (bf?.totalLakEquivalent || 0) + (adv?.totalLakEquivalent || 0) - (st?.totalLakEquivalent || 0);

        allCurrencies.forEach(curr => {
          const bVal = bf?.amounts?.[curr] || 0;
          const aVal = adv?.amounts?.[curr] || 0;
          const sVal = st?.amounts?.[curr] || 0;
          amounts[curr] = bVal + aVal - sVal;
        });

        closingMinistryMap.set(mId, {
          ministryId: mId,
          ministryCode: code,
          ministryName: name,
          amounts,
          totalLakEquivalent: lakEq
        });
      });

      const closingBankAccountMap = new Map();
      const allBankIds = new Set([...bfBankAccountMap.keys(), ...advBankAccountMap.keys(), ...setBankAccountMap.keys()]);

      allBankIds.forEach(bId => {
        const bf = bfBankAccountMap.get(bId);
        const adv = advBankAccountMap.get(bId);
        const st = setBankAccountMap.get(bId);

        const accNo = bf?.accountNumber || adv?.accountNumber || st?.accountNumber || 'N/A';
        const accName = bf?.accountName || adv?.accountName || st?.accountName || 'Cash';
        const bName = bf?.bankName || adv?.bankName || st?.bankName || 'Cash Drawer';

        const amounts = {};
        const allCurrencies = new Set([
          ...Object.keys(bf?.amounts || {}),
          ...Object.keys(adv?.amounts || {}),
          ...Object.keys(st?.amounts || {})
        ]);

        let lakEq = (bf?.totalLakEquivalent || 0) + (adv?.totalLakEquivalent || 0) - (st?.totalLakEquivalent || 0);

        allCurrencies.forEach(curr => {
          const bVal = bf?.amounts?.[curr] || 0;
          const aVal = adv?.amounts?.[curr] || 0;
          const sVal = st?.amounts?.[curr] || 0;
          amounts[curr] = bVal + aVal - sVal;
        });

        closingBankAccountMap.set(bId, {
          bankAccountId: bId,
          accountNumber: accNo,
          accountName: accName,
          bankName: bName,
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
      let closingTotalLak = bfTotalLak + advTotalLak - setTotalLak;

      allCurrs.forEach(curr => {
        closingCurrencyTotals[curr] = (bfCurrencyTotals[curr] || 0) + (advCurrencyTotals[curr] || 0) - (setCurrencyTotals[curr] || 0);
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
          byBankAccount: Array.from(closingBankAccountMap.values()).filter(b => Math.abs(b.totalLakEquivalent) > 0.01 || Object.values(b.amounts).some(v => Math.abs(v) > 0.01)),
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
        for (const curr of currencies) {
          const opening = summary.balanceForward.byMinistry.find(b => b.ministryId === mItem.ministryId)?.amounts?.[curr.code] || 0;
          const advances = summary.currentAdvances.byMinistry.find(a => a.ministryId === mItem.ministryId)?.amounts?.[curr.code] || 0;
          const settlements = summary.currentSettlements.byMinistry.find(s => s.ministryId === mItem.ministryId)?.amounts?.[curr.code] || 0;
          const closing = mItem.amounts?.[curr.code] || 0;

          if (opening !== 0 || advances !== 0 || settlements !== 0 || closing !== 0) {
            recordsToUpsert.push({
              branchId: bId,
              ministryId: mItem.ministryId || null,
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
        const whereClause = {
          branchId: rec.branchId,
          currencyId: rec.currencyId,
          year: rec.year,
          month: rec.month
        };
        if (rec.ministryId) whereClause.ministryId = rec.ministryId;

        const existing = await MinistryPeriodBalance.findOne({ where: whereClause });
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
   * Historical Backfill Utility (Sequential Multi-Year Engine)
   */
  static async backfillAllHistory(branchId, userId) {
    try {
      const bId = branchId ? parseInt(branchId) : 1;
      
      const earliestAdvance = await MoneyAdvance.findOne({
        order: [['bookingDate', 'ASC']],
        attributes: ['bookingDate']
      });

      const earliestSettlement = await MoneySettlement.findOne({
        where: { isActive: { [Op.or]: [true, null, 1] } },
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

  /**
   * Get list of all 12 monthly periods for a given year with continuous strict chain
   */
  static async getYearPeriodsList(branchId, year) {
    try {
      const bId = branchId ? parseInt(branchId) : 1;
      const y = parseInt(year) || new Date().getFullYear();

      const monthNames = [
        'ມັງກອນ (Jan)', 'ກຸມພາ (Feb)', 'ມີນາ (Mar)', 'ເມສາ (Apr)',
        'ພຶດສະພາ (May)', 'ມິຖຸນາ (Jun)', 'ກໍລະກົດ (Jul)', 'ສິງຫາ (Aug)',
        'ກັນຍາ (Sep)', 'ຕຸລາ (Oct)', 'ພະຈິກ (Nov)', 'ທັນວາ (Dec)'
      ];

      const periods = [];
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      // 1. Fetch closed snapshots
      const closedSnapshots = await MinistryPeriodBalance.findAll({
        where: { branchId: bId, year: y, isClosed: true },
        include: [{ model: User, as: 'closedByUser', attributes: ['id', 'cus_name'] }]
      });

      // 2. Fetch initial year opening balance before Jan 1 of this year
      const jan1 = `${y}-01-01`;
      const summaryJan = await this.getMasterSummary(bId, y, 1);
      let runningOpeningLak = summaryJan.balanceForward?.totals?.totalLakEquivalent || 0;

      for (let m = 1; m <= 12; m++) {
        const { startDate, endDate } = this.getMonthDateRange(y, m);
        const monthSnapshots = closedSnapshots.filter(s => s.month === m);
        const isClosed = monthSnapshots.length > 0;
        const firstSnap = monthSnapshots[0];

        // Fetch actual period activity
        const summary = await this.getMasterSummary(bId, y, m);
        const advancesLak = summary.currentAdvances?.totals?.totalLakEquivalent || 0;
        const settlementsLak = summary.currentSettlements?.totals?.totalLakEquivalent || 0;
        
        // Strict continuous balance chain
        const openingLak = runningOpeningLak;
        const closingLak = openingLak + advancesLak - settlementsLak;

        const [advCount, setCount] = await Promise.all([
          MoneyAdvance.count({ where: { bookingDate: { [Op.between]: [startDate, endDate] } } }),
          MoneySettlement.count({ where: { bookingDate: { [Op.between]: [startDate, endDate] }, isActive: { [Op.or]: [true, null, 1] } } })
        ]);

        periods.push({
          year: y,
          month: m,
          monthName: monthNames[m - 1],
          startDate,
          endDate,
          isClosed,
          closedAt: firstSnap?.closedAt || null,
          closedBy: firstSnap?.closedByUser?.cus_name || null,
          note: firstSnap?.note || '',
          openingBalanceLak: openingLak,
          advancesLak: advancesLak,
          settlementsLak: settlementsLak,
          closingBalanceLak: closingLak,
          advancesCount: advCount,
          settlementsCount: setCount,
          isCurrent: y === currentYear && m === currentMonth,
          isPast: y < currentYear || (y === currentYear && m < currentMonth),
          isFuture: y > currentYear || (y === currentYear && m > currentMonth)
        });

        // Pass this month's closing to next month's opening
        runningOpeningLak = closingLak;
      }

      const closedCount = periods.filter(p => p.isClosed).length;
      const openCount = periods.filter(p => !p.isClosed && (p.isPast || p.isCurrent)).length;

      return {
        success: true,
        year: y,
        branchId: bId,
        yearStats: {
          totalPeriods: 12,
          closedCount,
          openCount,
          totalAdvancesYearLak: periods.reduce((sum, p) => sum + p.advancesLak, 0),
          totalSettlementsYearLak: periods.reduce((sum, p) => sum + p.settlementsLak, 0),
          netChangeYearLak: periods.reduce((sum, p) => sum + (p.advancesLak - p.settlementsLak), 0)
        },
        periods
      };
    } catch (error) {
      logger.error('Error in getYearPeriodsList service:', error);
      throw error;
    }
  }
}

module.exports = MinistryPeriodBalanceService;
