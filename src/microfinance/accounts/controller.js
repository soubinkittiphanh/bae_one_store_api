const db = require('../../models');
const { generateSchedule } = require('./scheduleEngine');

/**
 * Preview loan schedule without creating the account
 */
async function previewSchedule(req, res) {
  try {
    const { sanctionedAmount, interestRate, productCode, repaymentFrequency, tenorWeeks, valueDate, gracePeriodWeeks } = req.body;
    
    // Fetch product to validate or fetch default settings
    const product = await db.mfLoanProduct.findByPk(productCode);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Loan Product not found' });
    }

    const rate = interestRate || product.interestRate;
    const freq = repaymentFrequency || product.repaymentFrequency;
    const grace = gracePeriodWeeks != null ? gracePeriodWeeks : product.gracePeriodWeeks;

    const schedules = generateSchedule({
      sanctionedAmount,
      interestRate: rate,
      interestType: product.interestType,
      repaymentFrequency: freq,
      tenorWeeks,
      valueDate,
      gracePeriodWeeks: grace
    });

    return res.status(200).json({
      success: true,
      interestType: product.interestType,
      schedules
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Disburse / Create Loan Account and generate repayment schedule + journal logs
 */
async function create(req, res) {
  const transaction = await db.sequelize.transaction();
  try {
    const { cifId, productCode, sanctionedAmount, interestRate, repaymentFrequency, tenorWeeks, valueDate, gracePeriodWeeks, linkedSavingsAcc } = req.body;

    // 1. Fetch Customer and Product
    const customer = await db.cifCustomer.findByPk(cifId);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const product = await db.mfLoanProduct.findByPk(productCode, {
      include: [{ model: db.currency, as: 'currency' }]
    });
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // 2. Validate Limits
    const amount = parseFloat(sanctionedAmount);
    if (amount < parseFloat(product.minAmount) || amount > parseFloat(product.maxAmount)) {
      return res.status(400).json({
        success: false,
        error: `Amount must be between ${product.minAmount} and ${product.maxAmount}`
      });
    }

    const weeks = parseInt(tenorWeeks);
    if (weeks < parseInt(product.minTenorWeeks) || weeks > parseInt(product.maxTenorWeeks)) {
      return res.status(400).json({
        success: false,
        error: `Tenor must be between ${product.minTenorWeeks} and ${product.maxTenorWeeks} weeks`
      });
    }

    const rate = interestRate || product.interestRate;
    const freq = repaymentFrequency || product.repaymentFrequency;
    const grace = gracePeriodWeeks != null ? gracePeriodWeeks : product.gracePeriodWeeks;

    // 3. Generate schedule details
    const schedulesData = generateSchedule({
      sanctionedAmount: amount,
      interestRate: rate,
      interestType: product.interestType,
      repaymentFrequency: freq,
      tenorWeeks: weeks,
      valueDate,
      gracePeriodWeeks: grace
    });

    const maturityDate = schedulesData[schedulesData.length - 1].dueDate;

    // 4. Generate unique Account No
    const count = await db.mfLoanAccount.count();
    const accountNo = `LACC${String(count + 1).padStart(6, '0')}`;

    // 5. Create Loan Account
    const currencyCode = req.body.currency || (product.currency ? product.currency.code : 'USD') || 'USD';
    const currencyRecord = await db.currency.findOne({ where: { code: currencyCode } });
    const currencyId = currencyRecord ? currencyRecord.id : 1;

    const loanAccount = await db.mfLoanAccount.create({
      accountNo,
      cifId,
      productCode,
      sanctionedAmount: amount,
      interestRate: rate,
      valueDate,
      maturityDate,
      linkedSavingsAcc,
      currencyId,
      status: 'ACTIVE'
    }, { transaction });

    // 6. Create Repayment Schedule Entries
    const schedulesToSave = schedulesData.map(s => ({
      loanAccountId: loanAccount.id,
      installmentNo: s.installmentNo,
      dueDate: s.dueDate,
      principalDue: s.principalDue,
      interestDue: s.interestDue,
      feesDue: s.feesDue,
      status: 'UNPAID'
    }));

    await db.mfRepaymentSchedule.bulkCreate(schedulesToSave, { transaction });

    // 7. Write Journal Entries:
    // Event BOOK: Book the loan approval
    await db.mfJournalEntry.create({
      loanAccountId: loanAccount.id,
      eventCode: 'BOOK',
      valueDate,
      debitGL: '901001', // Contingent Assets GL
      creditGL: '901002', // Contingent Liabilities GL
      amount,
      currencyId: loanAccount.currencyId,
      description: `Booked loan application ${accountNo} for CIF: ${customer.cifNo} in ${currencyCode}`
    }, { transaction });

    // Event DSBR: Disburse the loan to customer savings / account
    await db.mfJournalEntry.create({
      loanAccountId: loanAccount.id,
      eventCode: 'DSBR',
      valueDate,
      debitGL: '101001', // Loan Asset GL (Standard Loans)
      creditGL: '201001', // Customer Savings Account / Clearing GL
      amount,
      currencyId: loanAccount.currencyId,
      description: `Disbursed principal to account ${accountNo} for CIF: ${customer.cifNo} in ${currencyCode}`
    }, { transaction });

    await transaction.commit();

    // Fetch complete active loan with schedule
    const completeLoan = await db.mfLoanAccount.findByPk(loanAccount.id, {
      include: [
        { model: db.cifCustomer, as: 'customer' },
        { model: db.mfRepaymentSchedule, as: 'schedules' },
        { model: db.mfJournalEntry, as: 'journalEntries' },
        { model: db.currency, as: 'currency' }
      ]
    });

    return res.status(201).json({ success: true, data: completeLoan });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Process a loan manual repayment/payment (MLIQ event)
 */
async function makePayment(req, res) {
  const transaction = await db.sequelize.transaction();
  try {
    const { id } = req.params; // loan account ID
    const { amountPaid, paymentDate } = req.body;
    
    let remainingPaid = parseFloat(amountPaid);
    const valDate = paymentDate || new Date().toISOString().split('T')[0];

    const loan = await db.mfLoanAccount.findByPk(id, {
      include: [
        { model: db.mfRepaymentSchedule, as: 'schedules' },
        { model: db.mfLoanProduct, as: 'product' },
        { model: db.currency, as: 'currency' }
      ],
      transaction
    });

    if (!loan) {
      return res.status(404).json({ success: false, error: 'Loan Account not found' });
    }

    if (loan.status === 'PAID') {
      return res.status(400).json({ success: false, error: 'Loan is already fully PAID' });
    }

    // Sort schedules by installment number
    const schedules = loan.schedules.sort((a, b) => a.installmentNo - b.installmentNo);

    let totalPrincipalAllocated = 0;
    let totalInterestAllocated = 0;

    for (const schedule of schedules) {
      if (remainingPaid <= 0) break;
      if (schedule.status === 'PAID') continue;

      const pDue = parseFloat(schedule.principalDue) - parseFloat(schedule.principalPaid || 0);
      const iDue = parseFloat(schedule.interestDue) - parseFloat(schedule.interestPaid || 0);

      // Allocate first to Interest, then to Principal (standard core banking payment allocation)
      let allocatedInterest = 0;
      let allocatedPrincipal = 0;

      if (iDue > 0 && remainingPaid > 0) {
        allocatedInterest = Math.min(iDue, remainingPaid);
        remainingPaid -= allocatedInterest;
        schedule.interestPaid = parseFloat(schedule.interestPaid || 0) + allocatedInterest;
        totalInterestAllocated += allocatedInterest;
      }

      if (pDue > 0 && remainingPaid > 0) {
        allocatedPrincipal = Math.min(pDue, remainingPaid);
        remainingPaid -= allocatedPrincipal;
        schedule.principalPaid = parseFloat(schedule.principalPaid || 0) + allocatedPrincipal;
        totalPrincipalAllocated += allocatedPrincipal;
      }

      // Check new status
      const totalOutstanding = (parseFloat(schedule.principalDue) - parseFloat(schedule.principalPaid)) +
                               (parseFloat(schedule.interestDue) - parseFloat(schedule.interestPaid));
      
      if (totalOutstanding <= 0) {
        schedule.status = 'PAID';
      } else {
        schedule.status = 'PARTIALLY_PAID';
      }

      await schedule.save({ transaction });
    }

    // Write manual liquidation GL entries:
    // For principal: Debit Cash GL (100001), Credit Loan Asset GL (101001)
    if (totalPrincipalAllocated > 0) {
      await db.mfJournalEntry.create({
        loanAccountId: loan.id,
        eventCode: 'MLIQ',
        valueDate: valDate,
        debitGL: '100001', // Cash GL
        creditGL: '101001', // Loan Asset GL
        amount: totalPrincipalAllocated,
        currencyId: loan.currencyId,
        description: `Manual principal payment for Account: ${loan.accountNo} (${loan.currency ? loan.currency.code : 'USD'})`
      }, { transaction });
    }

    // For interest: Debit Cash GL (100001), Credit Interest Receivable GL (102001)
    if (totalInterestAllocated > 0) {
      await db.mfJournalEntry.create({
        loanAccountId: loan.id,
        eventCode: 'MLIQ',
        valueDate: valDate,
        debitGL: '100001', // Cash GL
        creditGL: loan.product.linkedGLAsset || '102001', // Interest Receivable GL
        amount: totalInterestAllocated,
        currencyId: loan.currencyId,
        description: `Manual interest payment for Account: ${loan.accountNo} (${loan.currency ? loan.currency.code : 'USD'})`
      }, { transaction });
    }

    // Check if the entire loan is paid off
    const outstandingInstallmentsCount = await db.mfRepaymentSchedule.count({
      where: {
        loanAccountId: loan.id,
        status: { [db.Sequelize.Op.ne]: 'PAID' }
      },
      transaction
    });

    if (outstandingInstallmentsCount === 0) {
      await loan.update({ status: 'PAID' }, { transaction });
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Repayment processed successfully',
      principalPaid: totalPrincipalAllocated,
      interestPaid: totalInterestAllocated,
      unallocatedAmount: remainingPaid
    });

  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findAll(req, res) {
  try {
    const accounts = await db.mfLoanAccount.findAll({
      include: [
        { model: db.cifCustomer, as: 'customer' },
        { model: db.mfRepaymentSchedule, as: 'schedules' },
        { model: db.mfLoanProduct, as: 'product' },
        { model: db.currency, as: 'currency' }
      ]
    });
    return res.status(200).json({ success: true, data: accounts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findOne(req, res) {
  try {
    const { id } = req.params;
    const account = await db.mfLoanAccount.findByPk(id, {
      include: [
        { model: db.cifCustomer, as: 'customer' },
        { model: db.mfRepaymentSchedule, as: 'schedules' },
        { model: db.mfJournalEntry, as: 'journalEntries' },
        { model: db.mfLoanProduct, as: 'product' },
        { model: db.currency, as: 'currency' }
      ]
    });
    if (!account) {
      return res.status(404).json({ success: false, error: 'Loan Account not found' });
    }
    return res.status(200).json({ success: true, data: account });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  previewSchedule,
  create,
  makePayment,
  findAll,
  findOne
};
