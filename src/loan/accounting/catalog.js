/**
 * Phase 2B accounting catalog (docs/loan/rev5-accounting-addendum.md, revision 2).
 * Used by seed_loan_phase2b_accounting.js and by the validator tests.
 * Entry rules are seeded PENDING; nothing here creates GL accounts or role-to-GL mappings.
 */

const EVENTS = [
  { eventCode: 'FEE_COLLECT', name: 'Upfront Fee Collection (ການເກັບຄ່າທຳນຽມລ່ວງໜ້າ)', description: 'Fees and insurance paid at signing (UPFRONT)' },
  { eventCode: 'FEE_REFUND', name: 'Upfront Fee Refund (ການຄືນຄ່າທຳນຽມ)', description: 'Deal cancelled before disbursement: fees, VAT and insurance refunded' },
  { eventCode: 'ADV_REFUND', name: 'Customer Advance Refund (ການຄືນເງິນລ່ວງໜ້າ)', description: 'Cash refund of a customer advance' }
];

const TAGS = {
  VAT_OUT: 'Output VAT',
  REFUND_AMT: 'Cash refunded',
  INT_WAIVE_SUSP: 'Suspended interest waived',
  TRUE_UP_REV: 'Rebate true-up reversal (over-accrual)',
  PEN_CASH: 'Memo-only penalty collected',
  INT_CASH: 'Unbooked interest collected',
  ADV_APPLIED: 'Customer advance applied',
  ROUND_DIFF: 'Base-currency rounding difference'
};

const INTEREST_RECOGNITION = [
  { code: 'DUE_DATE', name: 'On installment due date (ຮັບຮູ້ຕາມວັນຄົບກຳນົດງວດ)', description: 'Recommended default: one ACCR per installment on its due date' },
  { code: 'DAILY', name: 'Daily accrual (ຮັບຮູ້ລາຍວັນ)', description: 'ACCR every day by the EOD batch' },
  { code: 'CASH', name: 'Cash basis (ຮັບຮູ້ເມື່ອໄດ້ຮັບເງິນ)', description: 'Interest recognized only when received (LIQD INT_CASH); not recommended' }
];

// Statuses whose penalty treatment defaults to MEMO_ONLY (revision 2); terminal statuses keep STOP_ACCRUAL
const MEMO_PENALTY_STATUSES = ['NORMAL', 'WATCH', 'SUBSTANDARD', 'DOUBTFUL', 'LOSS'];

// Tags whose amount is one cash line equal to the sum of the other one-sided tags (addendum §0)
const TOTAL_CASH_TAGS = ['TOTAL_PAID', 'PAYOFF_CASH', 'REFUND_AMT'];

// Role that holds the presentation of an upfront fee
const PRESENTATION_ROLE = {
  IMMEDIATE: 'FEE_INCOME',
  LIABILITY: 'DEFERRED_FEE',
  CONTRA_ASSET_NET: 'UNAMORTIZED_FEE_CONTRA'
};
const DEFERRED_PRESENTATIONS = ['LIABILITY', 'CONTRA_ASSET_NET'];

// Rule builder: [tag, drCr, role, options]. Unqualified roles use qualifierSource NONE.
const leg = (eventCode, amountTag, drCr, roleCode, opts = {}) => ({
  eventCode,
  amountTag,
  drCr,
  roleCode,
  qualifierSource: opts.q || (roleCode === 'LOAN_PORTFOLIO' ? 'CURRENT' : 'NONE'),
  isActive: opts.active !== false,
  feeModeFilter: opts.mode || 'ANY',
  presentationFilter: opts.pres || 'ANY',
  targetFilter: opts.target || 'ANY'
});
const pair = (eventCode, tag, drRole, crRole, opts = {}) => [
  leg(eventCode, tag, 'DR', drRole, { ...opts, q: opts.drQ }),
  leg(eventCode, tag, 'CR', crRole, { ...opts, q: opts.crQ })
];
const INACTIVE = { active: false };
// Every leg touching PENALTY_RECEIVABLE is inactive under the default MEMO_ONLY penalty
const BILL_OPTION = { active: false };

const presentationLegs = (build) => [
  ...build('IMMEDIATE', {}),
  ...DEFERRED_PRESENTATIONS.flatMap(p => build(p, INACTIVE))
];

const ENTRY_RULES = [
  // FEE_COLLECT (UPFRONT only)
  leg('FEE_COLLECT', 'TOTAL_PAID', 'DR', 'CASH_BANK', { mode: 'UPFRONT' }),
  ...presentationLegs((pres, o) => [leg('FEE_COLLECT', 'FEE_DOC', 'CR', PRESENTATION_ROLE[pres], { ...o, mode: 'UPFRONT', pres })]),
  leg('FEE_COLLECT', 'INS_PREM', 'CR', 'INSURANCE_PAYABLE', { mode: 'UPFRONT' }),
  leg('FEE_COLLECT', 'VAT_OUT', 'CR', 'TAX_PAYABLE', { mode: 'UPFRONT' }),

  // FEE_REFUND (UPFRONT only, before disbursement)
  ...presentationLegs((pres, o) => [leg('FEE_REFUND', 'FEE_DOC', 'DR', PRESENTATION_ROLE[pres], { ...o, mode: 'UPFRONT', pres })]),
  leg('FEE_REFUND', 'VAT_OUT', 'DR', 'TAX_PAYABLE', { mode: 'UPFRONT' }),
  leg('FEE_REFUND', 'INS_PREM', 'DR', 'INSURANCE_PAYABLE', { mode: 'UPFRONT' }),
  leg('FEE_REFUND', 'REFUND_AMT', 'CR', 'CASH_BANK', { mode: 'UPFRONT' }),

  // DISB
  leg('DISB', 'PRINCIPAL', 'DR', 'LOAN_PORTFOLIO'),
  leg('DISB', 'PRINCIPAL', 'CR', 'SALE_RECEIVABLE', { target: 'SALE_INVOICE_SETTLEMENT' }),
  leg('DISB', 'PRINCIPAL', 'CR', 'CASH_BANK', { target: 'CASH_BANK' }),
  leg('DISB', 'FEE_DOC', 'DR', 'LOAN_PORTFOLIO', { mode: 'CAPITALIZED' }),
  leg('DISB', 'FEE_DOC', 'DR', 'CASH_BANK', { mode: 'DEDUCTED' }),
  ...['CAPITALIZED', 'DEDUCTED'].flatMap(mode => presentationLegs((pres, o) => [leg('DISB', 'FEE_DOC', 'CR', PRESENTATION_ROLE[pres], { ...o, mode, pres })])),
  leg('DISB', 'INS_PREM', 'DR', 'LOAN_PORTFOLIO', { mode: 'CAPITALIZED' }),
  leg('DISB', 'INS_PREM', 'DR', 'CASH_BANK', { mode: 'DEDUCTED' }),
  leg('DISB', 'INS_PREM', 'CR', 'INSURANCE_PAYABLE', { mode: 'CAPITALIZED' }),
  leg('DISB', 'INS_PREM', 'CR', 'INSURANCE_PAYABLE', { mode: 'DEDUCTED' }),

  // Interest recognition
  ...pair('ACCR', 'INT_ACCR', 'INTEREST_RECEIVABLE', 'INTEREST_INCOME'),
  ...pair('ACCR_SUSP', 'INT_ACCR', 'INTEREST_RECEIVABLE', 'SUSPENDED_INTEREST'),

  // EIR_AMORT (deferred presentations only, inactive)
  ...DEFERRED_PRESENTATIONS.flatMap(pres => pair('EIR_AMORT', 'EIR_AMORT', PRESENTATION_ROLE[pres], 'FEE_INCOME', { ...INACTIVE, pres })),

  // Billing
  ...pair('BILL', 'PENALTY', 'PENALTY_RECEIVABLE', 'PENALTY_INCOME', BILL_OPTION),
  ...pair('BILL_NON_CAP', 'FEE_BILL', 'FEE_RECEIVABLE', 'FEE_INCOME'),
  ...pair('BILL_NON_CAP', 'INS_BILL', 'INSURANCE_RECEIVABLE', 'INSURANCE_PAYABLE'),
  ...pair('BILL_NON_CAP', 'VAT_OUT', 'FEE_RECEIVABLE', 'TAX_PAYABLE'),

  // LIQD
  leg('LIQD', 'TOTAL_PAID', 'DR', 'CASH_BANK'),
  leg('LIQD', 'ADV_APPLIED', 'DR', 'CUSTOMER_ADVANCE_LIAB'),
  leg('LIQD', 'PEN_CASH', 'CR', 'PENALTY_INCOME'),
  leg('LIQD', 'PENALTY', 'CR', 'PENALTY_RECEIVABLE', BILL_OPTION),
  leg('LIQD', 'FEE_DOC', 'CR', 'FEE_RECEIVABLE'),
  leg('LIQD', 'INS_PREM', 'CR', 'INSURANCE_RECEIVABLE'),
  leg('LIQD', 'INT_PAID', 'CR', 'INTEREST_RECEIVABLE'),
  leg('LIQD', 'INT_CASH', 'CR', 'INTEREST_INCOME'),
  leg('LIQD', 'PRIN_PAID', 'CR', 'LOAN_PORTFOLIO'),

  // LIQD_SUSP: one tag, two balanced pairs (cash in, suspended interest realized)
  ...pair('LIQD_SUSP', 'SUSP_PAID', 'CASH_BANK', 'INTEREST_RECEIVABLE'),
  ...pair('LIQD_SUSP', 'SUSP_PAID', 'SUSPENDED_INTEREST', 'INTEREST_INCOME'),

  ...pair('OVERPAY', 'OVERPAY', 'CASH_BANK', 'CUSTOMER_ADVANCE_LIAB'),
  ...pair('ADV_REFUND', 'REFUND_AMT', 'CUSTOMER_ADVANCE_LIAB', 'CASH_BANK'),
  ...pair('INS_REMIT', 'REMIT_AMT', 'INSURANCE_PAYABLE', 'CASH_BANK'),

  // Waivers
  ...pair('WAIVE', 'PEN_WAIVE', 'PENALTY_WAIVER_EXPENSE', 'PENALTY_RECEIVABLE', BILL_OPTION),
  ...pair('WAIVE', 'FEE_WAIVE', 'FEE_WAIVER_EXPENSE', 'FEE_RECEIVABLE'),
  ...pair('INT_WAIVE', 'INT_WAIVE', 'INTEREST_WAIVER_EXPENSE', 'INTEREST_RECEIVABLE'),
  ...pair('INT_WAIVE', 'INT_WAIVE_SUSP', 'SUSPENDED_INTEREST', 'INTEREST_RECEIVABLE'),

  // Status changes
  ...pair('STCH', 'OUT_PRIN', 'LOAN_PORTFOLIO', 'LOAN_PORTFOLIO', { drQ: 'NEW', crQ: 'PREVIOUS' }),
  ...pair('STCH', 'UNCOL_INT', 'INTEREST_INCOME', 'SUSPENDED_INTEREST'),
  ...pair('STCH_CURE', 'OUT_PRIN', 'LOAN_PORTFOLIO', 'LOAN_PORTFOLIO', { drQ: 'NEW', crQ: 'PREVIOUS' }),
  ...pair('STCH_CURE', 'SUSP_REV', 'SUSPENDED_INTEREST', 'INTEREST_INCOME'),

  // Provisioning
  ...pair('PROVISION', 'PROV_EXP', 'PROVISION_EXPENSE', 'PROVISION_RESERVE'),
  ...pair('PROV_WB', 'PROV_WB', 'PROVISION_RESERVE', 'PROVISION_EXPENSE'),

  // WRITE_OFF
  ...pair('WRITE_OFF', 'PRIN_WO', 'PROVISION_RESERVE', 'LOAN_PORTFOLIO'),
  ...pair('WRITE_OFF', 'SHORTFALL', 'LOAN_LOSS_SHORTFALL', 'LOAN_PORTFOLIO'),
  ...pair('WRITE_OFF', 'SUSP_CLR', 'SUSPENDED_INTEREST', 'INTEREST_RECEIVABLE'),
  ...pair('WRITE_OFF', 'UNCOL_INT', 'INTEREST_INCOME', 'INTEREST_RECEIVABLE'),
  ...pair('WRITE_OFF', 'PEN_WO', 'PENALTY_WRITEOFF_EXPENSE', 'PENALTY_RECEIVABLE', BILL_OPTION),
  ...pair('WRITE_OFF', 'FEE_WO', 'FEE_WRITEOFF_EXPENSE', 'FEE_RECEIVABLE'),
  ...DEFERRED_PRESENTATIONS.flatMap(pres => pair('WRITE_OFF', 'FEE_REL', PRESENTATION_ROLE[pres], 'FEE_INCOME', { ...INACTIVE, pres })),
  ...pair('WRITE_OFF', 'MEMO_WO', 'WRITTEN_OFF_MEMO_DR', 'WRITTEN_OFF_MEMO_CR'),

  // RECOVERY: cash pair plus memo reduction pair
  ...pair('RECOVERY', 'REC_AMT', 'CASH_BANK', 'BAD_DEBT_RECOVERY'),
  ...pair('RECOVERY', 'REC_AMT', 'WRITTEN_OFF_MEMO_CR', 'WRITTEN_OFF_MEMO_DR'),

  // PREPAY
  ...pair('PREPAY', 'TRUE_UP', 'INTEREST_RECEIVABLE', 'INTEREST_INCOME'),
  ...pair('PREPAY', 'TRUE_UP_REV', 'INTEREST_INCOME', 'INTEREST_RECEIVABLE'),
  leg('PREPAY', 'PAYOFF_CASH', 'DR', 'CASH_BANK'),
  leg('PREPAY', 'ADV_APPLIED', 'DR', 'CUSTOMER_ADVANCE_LIAB'),
  leg('PREPAY', 'OUT_PRIN', 'CR', 'LOAN_PORTFOLIO'),
  leg('PREPAY', 'EARNED_INT', 'CR', 'INTEREST_RECEIVABLE'),
  leg('PREPAY', 'PEN_CASH', 'CR', 'PENALTY_INCOME'),
  leg('PREPAY', 'PENALTY', 'CR', 'PENALTY_RECEIVABLE', BILL_OPTION),
  leg('PREPAY', 'FEES', 'CR', 'FEE_RECEIVABLE'),
  leg('PREPAY', 'EARLY_FEE', 'CR', 'FEE_INCOME'),
  leg('PREPAY', 'VAT_OUT', 'CR', 'TAX_PAYABLE'),
  ...DEFERRED_PRESENTATIONS.flatMap(pres => pair('PREPAY', 'UNAMORT', PRESENTATION_ROLE[pres], 'FEE_INCOME', { ...INACTIVE, pres })),

  // REPOSSESS
  leg('REPOSSESS', 'APPRAISED', 'DR', 'REPOSSESSED_VEHICLE_ASSET'),
  leg('REPOSSESS', 'RESERVE_ABS', 'DR', 'PROVISION_RESERVE'),
  leg('REPOSSESS', 'SHORTFALL', 'DR', 'LOAN_LOSS_SHORTFALL'),
  leg('REPOSSESS', 'OUT_PRIN', 'CR', 'LOAN_PORTFOLIO'),
  ...pair('REPOSSESS', 'SUSP_CLR', 'SUSPENDED_INTEREST', 'INTEREST_RECEIVABLE'),
  ...pair('REPOSSESS', 'UNCOL_INT', 'INTEREST_INCOME', 'INTEREST_RECEIVABLE'),
  ...pair('REPOSSESS', 'PEN_WO', 'PENALTY_WRITEOFF_EXPENSE', 'PENALTY_RECEIVABLE', BILL_OPTION),
  ...pair('REPOSSESS', 'FEE_WO', 'FEE_WRITEOFF_EXPENSE', 'FEE_RECEIVABLE'),
  ...DEFERRED_PRESENTATIONS.flatMap(pres => pair('REPOSSESS', 'UNAMORT', PRESENTATION_ROLE[pres], 'FEE_INCOME', { ...INACTIVE, pres })),

  // VEH_DISPOSE
  leg('VEH_DISPOSE', 'SALE_PRICE', 'DR', 'CASH_BANK'),
  leg('VEH_DISPOSE', 'LOSS', 'DR', 'LOSS_ON_REPOSSESSED_ASSET'),
  leg('VEH_DISPOSE', 'CARRYING', 'CR', 'REPOSSESSED_VEHICLE_ASSET'),
  leg('VEH_DISPOSE', 'GAIN', 'CR', 'GAIN_ON_REPOSSESSED_ASSET'),
  leg('VEH_DISPOSE', 'VAT_OUT', 'CR', 'TAX_PAYABLE')

  // REVERSAL has no rules: it mirrors the original journal lines (same chartAccountId)
];

module.exports = {
  EVENTS,
  TAGS,
  INTEREST_RECOGNITION,
  MEMO_PENALTY_STATUSES,
  TOTAL_CASH_TAGS,
  PRESENTATION_ROLE,
  DEFERRED_PRESENTATIONS,
  ENTRY_RULES
};
