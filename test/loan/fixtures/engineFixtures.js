/**
 * Phase 3 engine fixtures. Loans A-D come from docs/loan/rev5-accounting-addendum.md §4; the other
 * expected values were computed independently with Python decimal (precision 60, ROUND_HALF_UP)
 * outside the JS engine, and are recorded here.
 */
const LAK = { currencyId: 1, decimalPlaces: 0, roundingMode: 'HALF_UP', effectiveFrom: '2026-01-01' };
const USD = { currencyId: 5, decimalPlaces: 2, roundingMode: 'HALF_UP', effectiveFrom: '2026-01-01' };

const MONTHLY = { code: 'MONTHLY', periodsPerYear: '12.000000' };
const QUARTERLY = { code: 'QUARTERLY', periodsPerYear: '4.000000' };
const DAY_30_360 = { code: '30_360', daysInYear: 360 };
const ACT_ACT = { code: 'ACTUAL_ACTUAL', daysInYear: 366 };

// Seeded values (seed_loan_phase2a_data.js / 2B): DPD bands, status treatments and GL qualifiers
const MOVEMENT_RULES = [
  { fromStatus: 'NORMAL', toStatus: 'WATCH', minDpd: 31, maxDpd: 60 },
  { fromStatus: 'WATCH', toStatus: 'SUBSTANDARD', minDpd: 61, maxDpd: 90 },
  { fromStatus: 'SUBSTANDARD', toStatus: 'DOUBTFUL', minDpd: 91, maxDpd: 180 },
  { fromStatus: 'DOUBTFUL', toStatus: 'LOSS', minDpd: 181, maxDpd: 99999 }
];
const STATUS_MASTER = {
  NORMAL: { interestTreatment: 'CONTINUE_ACCRUAL', glQualifier: 'NORMAL' },
  WATCH: { interestTreatment: 'CONTINUE_ACCRUAL', glQualifier: 'WATCH' },
  SUBSTANDARD: { interestTreatment: 'SUSPEND_ACCRUAL', glQualifier: 'SUBSTANDARD' },
  DOUBTFUL: { interestTreatment: 'SUSPEND_ACCRUAL', glQualifier: 'DOUBTFUL' },
  LOSS: { interestTreatment: 'STOP_ACCRUAL', glQualifier: 'LOSS' }
};
// Decision D4 defaults (seeded PENDING by seed_loan_phase3.js)
const CURE_RULES = [
  { fromStatus: 'WATCH', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 0, observationMonthsRequired: 0 },
  { fromStatus: 'SUBSTANDARD', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 3, observationMonthsRequired: 0 },
  { fromStatus: 'DOUBTFUL', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 3, observationMonthsRequired: 0 },
  { fromStatus: 'LOSS', toStatus: 'NORMAL', consecutiveOnTimeInstallmentsRequired: 3, observationMonthsRequired: 0 }
];
const WATERFALL = ['PENALTY', 'PROCESSING_FEE', 'DOCUMENTATION_FEE', 'INTEREST', 'PRINCIPAL'];

const base = {
  annualRate: '0.180000', tenorMonths: 12, frequency: MONTHLY, dayCount: DAY_30_360,
  valueDate: '2026-01-15', holidayHandling: 'EXACT_DATE', graceType: 'NONE', gracePeriods: 0
};

// Loan A: 240,000,000, 12 months, 18%, 30/360, equal principal (addendum Examples 1-3, 7)
const LOAN_A = { ...base, principal: '240000000', repaymentMethod: 'EQUAL_PRINCIPAL', accrualMethod: 'DAILY_OUTSTANDING' };
// Loan D: 120,000,000, equal principal 10,000,000 (Example 4)
const LOAN_D = { ...LOAN_A, principal: '120000000' };

const EXPECTED = {
  annuity: { payment: '22003198', row1: ['18403198', '3600000'], row2: ['18679246', '3323952'], row12: ['21678030', '325170', '22003200'], interest: '24038378' },
  balloon: { balloon: '60000000', payment: '17402399', row1: ['13802399', '3600000'], row12: ['76258517', '1143878'], interest: '28828784' },
  graceInterestOnly: { row1: ['0', '3600000'], row3: ['24000000', '3600000'], row12: ['24000000', '360000'], interest: '27000000' },
  graceFull: { capitalized: '3600000', payment: '24187980', row2: ['20533980', '3654000'], row12: ['23830527', '357458'], principal: '243600000' },
  brokenFirstInterest: '5400000',
  actActInterest: '1017921',
  rule78Unbilled: '600000',
  noneUnbilled: '5400000',
  flatInterestPerInstallment: '3600000'
};

module.exports = { LAK, USD, MONTHLY, QUARTERLY, DAY_30_360, ACT_ACT, MOVEMENT_RULES, STATUS_MASTER, CURE_RULES, WATERFALL, LOAN_A, LOAN_D, EXPECTED };
