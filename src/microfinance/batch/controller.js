const db = require('../../models');
const { Op } = require('sequelize');

/**
 * Run End of Day (EOD) Batch processing for Microfinance
 */
async function runEOD(req, res) {
  const transaction = await db.sequelize.transaction();
  try {
    // 1. Get Current Business Date
    let businessDateRecord = await db.businessDate.findOne({
      where: { status: 'OPEN' },
      transaction
    });

    let currentBusinessDate;
    if (businessDateRecord) {
      currentBusinessDate = businessDateRecord.currentDate;
    } else {
      currentBusinessDate = new Date().toISOString().split('T')[0];
    }

    console.log(`[EOD BATCH] Starting EOD for Business Date: ${currentBusinessDate}`);

    const logMessages = [];
    logMessages.push(`Starting EOD process for business date: ${currentBusinessDate}`);

    // ==========================================
    // STEP 2: INTEREST ACCRUALS (ACCR)
    // ==========================================
    // Fetch all active/NPA loans
    const activeLoans = await db.mfLoanAccount.findAll({
      where: {
        status: {
          [Op.in]: ['ACTIVE', 'NPA_SUBSTANDARD', 'NPA_DOUBTFUL']
        }
      },
      include: [
        {
          model: db.mfLoanProduct,
          as: 'product'
        },
        {
          model: db.mfRepaymentSchedule,
          as: 'schedules'
        },
        {
          model: db.currency,
          as: 'currency'
        }
      ],
      transaction
    });

    for (const loan of activeLoans) {
      // Calculate Outstanding Principal
      let totalPrincipalPaid = 0;
      loan.schedules.forEach(s => {
        totalPrincipalPaid += parseFloat(s.principalPaid || 0);
      });
      const outstandingPrincipal = parseFloat(loan.sanctionedAmount) - totalPrincipalPaid;

      if (outstandingPrincipal <= 0) continue;

      // Daily Interest Accrual Math: (Outstanding Principal * AnnualRate) / 365
      const annualRate = parseFloat(loan.interestRate) / 100.0;
      const dailyInterest = Math.round(((outstandingPrincipal * annualRate) / 365.0) * 100) / 100;

      if (dailyInterest > 0) {
        // Record Journal Entry
        await db.mfJournalEntry.create({
          loanAccountId: loan.id,
          eventCode: 'ACCR',
          valueDate: currentBusinessDate,
          debitGL: loan.product.linkedGLAsset || '102001', // Interest Receivable GL
          creditGL: loan.product.linkedGLIncome || '401001', // Interest Income GL
          amount: dailyInterest,
          currency: loan.currency,
          description: `Daily interest accrual for Account: ${loan.accountNo}. Principal: ${outstandingPrincipal} (${loan.currency})`
        }, { transaction });

        logMessages.push(`Accrued daily interest of ${dailyInterest} ${loan.currency} for Account: ${loan.accountNo}`);
      }
    }

    // ==========================================
    // STEP 3: AUTO LIQUIDATION (ALIQ)
    // ==========================================
    // Find repayment schedules due today
    const dueInstallments = await db.mfRepaymentSchedule.findAll({
      where: {
        dueDate: currentBusinessDate,
        status: {
          [Op.in]: ['UNPAID', 'PARTIALLY_PAID']
        }
      },
      include: [
        {
          model: db.mfLoanAccount,
          as: 'loanAccount',
          include: [
            { model: db.mfLoanProduct, as: 'product' },
            { model: db.currency, as: 'currency' }
          ]
        }
      ],
      transaction
    });

    for (const schedule of dueInstallments) {
      const loan = schedule.loanAccount;
      const principalDue = parseFloat(schedule.principalDue) - parseFloat(schedule.principalPaid || 0);
      const interestDue = parseFloat(schedule.interestDue) - parseFloat(schedule.interestPaid || 0);
      const totalDue = principalDue + interestDue;

      if (totalDue <= 0) continue;

      // Simulate client payment (Debit Savings Account, Credit Asset/Receivable GLs)
      // Mark installment as fully paid
      await schedule.update({
        principalPaid: schedule.principalDue,
        interestPaid: schedule.interestDue,
        status: 'PAID'
      }, { transaction });

      // Principal payment accounting log
      if (principalDue > 0) {
        await db.mfJournalEntry.create({
          loanAccountId: loan.id,
          eventCode: 'ALIQ',
          valueDate: currentBusinessDate,
          debitGL: '201001', // Savings GL (debit/decrease client liability)
          creditGL: '101001', // Loan Asset GL (credit/decrease loan asset)
          amount: principalDue,
          currency: loan.currency,
          description: `Auto-liquidation principal payment for Account: ${loan.accountNo}, Installment #${schedule.installmentNo} (${loan.currency})`
        }, { transaction });
      }

      // Interest payment accounting log
      if (interestDue > 0) {
        await db.mfJournalEntry.create({
          loanAccountId: loan.id,
          eventCode: 'ALIQ',
          valueDate: currentBusinessDate,
          debitGL: '201001', // Savings GL
          creditGL: loan.product.linkedGLAsset || '102001', // Interest Receivable GL
          amount: interestDue,
          currency: loan.currency,
          description: `Auto-liquidation interest payment for Account: ${loan.accountNo}, Installment #${schedule.installmentNo} (${loan.currency})`
        }, { transaction });
      }

      logMessages.push(`Auto-liquidated installment #${schedule.installmentNo} for Account: ${loan.accountNo}, paid: ${totalDue}`);
    }

    // ==========================================
    // STEP 4: NPA CLASSIFICATION & STATUS CHANGE (STCH)
    // ==========================================
    // Fetch all active loans again to calculate DPD
    const loansForStatusCheck = await db.mfLoanAccount.findAll({
      where: { status: 'ACTIVE' },
      include: [
        { model: db.mfRepaymentSchedule, as: 'schedules' },
        { model: db.currency, as: 'currency' }
      ],
      transaction
    });

    const todayDate = new Date(currentBusinessDate);

    for (const loan of loansForStatusCheck) {
      let oldestUnpaidDate = null;
      
      // Find oldest unpaid installment
      loan.schedules.forEach(s => {
        if (s.status !== 'PAID') {
          const sDate = new Date(s.dueDate);
          if (!oldestUnpaidDate || sDate < oldestUnpaidDate) {
            oldestUnpaidDate = sDate;
          }
        }
      });

      if (oldestUnpaidDate) {
        // Calculate DPD (Days Past Due)
        const diffTime = Math.abs(todayDate - oldestUnpaidDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // If DPD > 30, classify as NPA Substandard
        if (diffDays > 30) {
          await loan.update({ status: 'NPA_SUBSTANDARD' }, { transaction });

          // Record Journal Entry for asset reclassification
          // Outstanding principal
          let totalPrincipalPaid = 0;
          loan.schedules.forEach(s => {
            totalPrincipalPaid += parseFloat(s.principalPaid || 0);
          });
          const outstandingPrincipal = parseFloat(loan.sanctionedAmount) - totalPrincipalPaid;

          await db.mfJournalEntry.create({
            loanAccountId: loan.id,
            eventCode: 'STCH',
            valueDate: currentBusinessDate,
            debitGL: '101002', // Substandard Loan Asset GL
            creditGL: '101001', // Standard Loan Asset GL
            amount: outstandingPrincipal,
            currencyId: loan.currencyId,
            description: `Asset reclassified to NPA Substandard. DPD: ${diffDays} days. Account: ${loan.accountNo} (${loan.currency ? loan.currency.code : 'USD'})`
          }, { transaction });

          logMessages.push(`Reclassified Account: ${loan.accountNo} to NPA_SUBSTANDARD. DPD: ${diffDays}`);
        }
      }
    }

    // ==========================================
    // STEP 5: ADVANCE BUSINESS DATE
    // ==========================================
    let nextDate = new Date(currentBusinessDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextBusinessDateStr = nextDate.toISOString().split('T')[0];

    if (businessDateRecord) {
      await businessDateRecord.update({
        lastWorkingDate: currentBusinessDate,
        currentDate: nextBusinessDateStr
      }, { transaction });
    } else {
      await db.businessDate.create({
        currentDate: nextBusinessDateStr,
        lastWorkingDate: currentBusinessDate,
        status: 'OPEN'
      }, { transaction });
    }

    logMessages.push(`Business date advanced to: ${nextBusinessDateStr}`);
    console.log(`[EOD BATCH] EOD Completed successfully. Next date: ${nextBusinessDateStr}`);

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'End of Day batch completed successfully',
      previousDate: currentBusinessDate,
      nextDate: nextBusinessDateStr,
      logs: logMessages
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[EOD BATCH] Error running EOD:', error);
    return res.status(500).json({
      success: false,
      error: 'Error running End of Day batch processing',
      details: error.message
    });
  }
}

module.exports = {
  runEOD
};
