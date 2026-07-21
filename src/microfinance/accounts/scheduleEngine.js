/**
 * Microfinance Loan Schedule Generation Engine
 */

/**
 * Adds weeks to a date string in YYYY-MM-DD format
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {number} weeks - Number of weeks to add
 * @returns {string} Date string in YYYY-MM-DD format
 */
function addWeeks(dateStr, weeks) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + (weeks * 7));
  return date.toISOString().split('T')[0];
}

/**
 * Adds months to a date string in YYYY-MM-DD format
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {number} months - Number of months to add
 * @returns {string} Date string in YYYY-MM-DD format
 */
function addMonths(dateStr, months) {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}

/**
 * Generates repayment schedule for a loan account
 * @param {object} params
 * @param {number} params.sanctionedAmount - Principal loan amount
 * @param {number} params.interestRate - Annual interest rate (e.g. 15 for 15%)
 * @param {string} params.interestType - 'FLAT' or 'REDUCING_BALANCE'
 * @param {string} params.repaymentFrequency - 'WEEKLY', 'BI_WEEKLY', 'MONTHLY'
 * @param {number} params.tenorWeeks - Total loan tenor in weeks
 * @param {string} params.valueDate - Disbursement date in YYYY-MM-DD format
 * @param {number} [params.gracePeriodWeeks=0] - Grace period in weeks (only interest is paid)
 * @returns {array} Repayment schedules
 */
function generateSchedule({
  sanctionedAmount,
  interestRate,
  interestType,
  repaymentFrequency,
  tenorWeeks,
  valueDate,
  gracePeriodWeeks = 0
}) {
  const principal = parseFloat(sanctionedAmount);
  const annualRate = parseFloat(interestRate) / 100.0;
  const graceWeeks = parseInt(gracePeriodWeeks) || 0;
  
  let installmentInterval = 1; // in weeks (default weekly)
  let periodsPerYear = 52;
  
  if (repaymentFrequency === 'BI_WEEKLY') {
    installmentInterval = 2;
    periodsPerYear = 26;
  } else if (repaymentFrequency === 'MONTHLY') {
    installmentInterval = 4; // Approx 4 weeks
    periodsPerYear = 12;
  }

  // Number of installments (excluding grace period weeks, or total installments including grace period)
  // In Microfinance, tenor includes grace period, and repayments occur at the frequency interval
  const totalInstallments = Math.ceil(tenorWeeks / installmentInterval);
  const graceInstallments = Math.ceil(graceWeeks / installmentInterval);
  const repaymentInstallments = totalInstallments - graceInstallments;

  if (repaymentInstallments <= 0) {
    throw new Error('Tenor must be greater than grace period');
  }

  const schedules = [];
  let outstandingPrincipal = principal;
  let currentDate = valueDate;

  // 1. FLAT INTEREST SCHEDULE CALCULATION
  if (interestType === 'FLAT') {
    // Flat interest: Interest = Principal * AnnualRate * (Tenor in Years)
    const tenorYears = tenorWeeks / 52.0;
    const totalInterest = principal * annualRate * tenorYears;
    const interestPerPeriod = Math.round((totalInterest / totalInstallments) * 100) / 100;
    
    // Principal starts paying after grace period
    const principalPerPeriod = Math.round((principal / repaymentInstallments) * 100) / 100;

    let principalAccumulated = 0;
    let interestAccumulated = 0;

    for (let i = 1; i <= totalInstallments; i++) {
      const isGracePeriod = i <= graceInstallments;
      
      // Calculate due date
      if (repaymentFrequency === 'MONTHLY') {
        currentDate = addMonths(currentDate, 1);
      } else {
        currentDate = addWeeks(currentDate, installmentInterval);
      }

      let pDue = isGracePeriod ? 0 : principalPerPeriod;
      let iDue = interestPerPeriod;

      // Adjust last installment to prevent rounding errors
      if (i === totalInstallments) {
        pDue = principal - principalAccumulated;
        iDue = Math.round((totalInterest - interestAccumulated) * 100) / 100;
      } else if (!isGracePeriod) {
        principalAccumulated += pDue;
      }
      
      interestAccumulated += iDue;

      schedules.push({
        installmentNo: i,
        dueDate: currentDate,
        principalDue: pDue,
        interestDue: iDue,
        feesDue: 0.00
      });
    }
  } 
  // 2. REDUCING BALANCE (AMORTIZED) SCHEDULE CALCULATION
  else {
    const periodRate = annualRate / periodsPerYear;
    
    // PMT Formula: EPI = P * [r(1+r)^N] / [(1+r)^N - 1]
    let epi = 0;
    if (periodRate > 0) {
      epi = principal * (periodRate * Math.pow(1 + periodRate, repaymentInstallments)) / 
            (Math.pow(1 + periodRate, repaymentInstallments) - 1);
    } else {
      epi = principal / repaymentInstallments;
    }

    let principalAccumulated = 0;

    for (let i = 1; i <= totalInstallments; i++) {
      const isGracePeriod = i <= graceInstallments;

      // Calculate due date
      if (repaymentFrequency === 'MONTHLY') {
        currentDate = addMonths(currentDate, 1);
      } else {
        currentDate = addWeeks(currentDate, installmentInterval);
      }

      let iDue = Math.round((outstandingPrincipal * periodRate) * 100) / 100;
      let pDue = 0;

      if (!isGracePeriod) {
        pDue = Math.round((epi - iDue) * 100) / 100;
        
        // Check if principal due exceeds remaining outstanding
        if (pDue > outstandingPrincipal || i === totalInstallments) {
          pDue = outstandingPrincipal;
        }
        
        outstandingPrincipal -= pDue;
        principalAccumulated += pDue;
      }

      // Adjust last installment to capture any residue
      if (i === totalInstallments && outstandingPrincipal > 0) {
        pDue += outstandingPrincipal;
        outstandingPrincipal = 0;
      }

      schedules.push({
        installmentNo: i,
        dueDate: currentDate,
        principalDue: pDue,
        interestDue: iDue,
        feesDue: 0.00
      });
    }
  }

  return schedules;
}

module.exports = {
  generateSchedule
};
