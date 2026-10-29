/**
 * Worked examples from docs/loan/rev5-accounting-addendum.md §4 (revision 2), used as fixtures
 * for the Phase 2B validators. Each step gives the engine's tag amounts and the journal lines
 * the seeded entry rules must produce: 'TAG DR|CR ROLE[QUALIFIER] amount'.
 * VAT variants use the illustrative 5% rate from the addendum (never the real rate).
 */
const DEFAULT_PRODUCT = { feeFinancingMode: 'UPFRONT', deferredFeePresentation: 'IMMEDIATE', disbursementTargetCode: 'SALE_INVOICE_SETTLEMENT' };

const EXAMPLES = [
  {
    name: 'Example 1: disbursement with fee and insurance',
    steps: [
      { event: 'FEE_COLLECT', tags: { TOTAL_PAID: '10000000', FEE_DOC: '3000000', INS_PREM: '7000000' },
        expected: ['TOTAL_PAID DR CASH_BANK 10000000', 'FEE_DOC CR FEE_INCOME 3000000', 'INS_PREM CR INSURANCE_PAYABLE 7000000'] },
      { event: 'DISB', qualifiers: { CURRENT: 'NORMAL' }, tags: { PRINCIPAL: '240000000' },
        expected: ['PRINCIPAL DR LOAN_PORTFOLIO[NORMAL] 240000000', 'PRINCIPAL CR SALE_RECEIVABLE 240000000'] },
      { event: 'INS_REMIT', tags: { REMIT_AMT: '7000000' },
        expected: ['REMIT_AMT DR INSURANCE_PAYABLE 7000000', 'REMIT_AMT CR CASH_BANK 7000000'] }
    ]
  },
  {
    name: 'Example 1a: VAT on fee, tax-exclusive',
    steps: [
      { event: 'FEE_COLLECT', tags: { TOTAL_PAID: '10150000', FEE_DOC: '3000000', VAT_OUT: '150000', INS_PREM: '7000000' },
        expected: ['TOTAL_PAID DR CASH_BANK 10150000', 'FEE_DOC CR FEE_INCOME 3000000', 'VAT_OUT CR TAX_PAYABLE 150000', 'INS_PREM CR INSURANCE_PAYABLE 7000000'] }
    ]
  },
  {
    name: 'Example 1b: VAT on fee, tax-inclusive',
    steps: [
      { event: 'FEE_COLLECT', tags: { TOTAL_PAID: '10000000', FEE_DOC: '2857142.8571', VAT_OUT: '142857.1429', INS_PREM: '7000000' },
        expected: ['TOTAL_PAID DR CASH_BANK 10000000', 'FEE_DOC CR FEE_INCOME 2857142.8571', 'VAT_OUT CR TAX_PAYABLE 142857.1429', 'INS_PREM CR INSURANCE_PAYABLE 7000000'] }
    ]
  },
  {
    name: 'Example 2: installment 1 received on time',
    steps: [
      { event: 'ACCR', tags: { INT_ACCR: '3600000' },
        expected: ['INT_ACCR DR INTEREST_RECEIVABLE 3600000', 'INT_ACCR CR INTEREST_INCOME 3600000'] },
      { event: 'LIQD', id: 'ex2-liqd', qualifiers: { CURRENT: 'NORMAL' }, tags: { TOTAL_PAID: '23600000', INT_PAID: '3600000', PRIN_PAID: '20000000' },
        expected: ['TOTAL_PAID DR CASH_BANK 23600000', 'INT_PAID CR INTEREST_RECEIVABLE 3600000', 'PRIN_PAID CR LOAN_PORTFOLIO[NORMAL] 20000000'] }
    ]
  },
  {
    name: 'Example 3: installment 2 paid 20 days late, memo-only penalty collected',
    steps: [
      { event: 'ACCR', tags: { INT_ACCR: '3300000' },
        expected: ['INT_ACCR DR INTEREST_RECEIVABLE 3300000', 'INT_ACCR CR INTEREST_INCOME 3300000'] },
      { event: 'LIQD', qualifiers: { CURRENT: 'NORMAL' }, tags: { TOTAL_PAID: '23533000', PEN_CASH: '233000', INT_PAID: '3300000', PRIN_PAID: '20000000' },
        expected: ['TOTAL_PAID DR CASH_BANK 23533000', 'PEN_CASH CR PENALTY_INCOME 233000', 'INT_PAID CR INTEREST_RECEIVABLE 3300000', 'PRIN_PAID CR LOAN_PORTFOLIO[NORMAL] 20000000'] }
    ]
  },
  {
    name: 'Example 4: prepayment, Loan D',
    steps: [
      { event: 'PREPAY', qualifiers: { CURRENT: 'NORMAL' }, tags: { TRUE_UP: '600000', PAYOFF_CASH: '82200000', OUT_PRIN: '80000000', EARNED_INT: '600000', EARLY_FEE: '1600000' },
        expected: ['TRUE_UP DR INTEREST_RECEIVABLE 600000', 'TRUE_UP CR INTEREST_INCOME 600000', 'PAYOFF_CASH DR CASH_BANK 82200000',
          'OUT_PRIN CR LOAN_PORTFOLIO[NORMAL] 80000000', 'EARNED_INT CR INTEREST_RECEIVABLE 600000', 'EARLY_FEE CR FEE_INCOME 1600000'] }
    ]
  },
  {
    name: 'Example 4 VAT: early fee taxable, tax-exclusive',
    steps: [
      { event: 'PREPAY', qualifiers: { CURRENT: 'NORMAL' }, tags: { TRUE_UP: '600000', PAYOFF_CASH: '82280000', OUT_PRIN: '80000000', EARNED_INT: '600000', EARLY_FEE: '1600000', VAT_OUT: '80000' },
        expected: ['TRUE_UP DR INTEREST_RECEIVABLE 600000', 'TRUE_UP CR INTEREST_INCOME 600000', 'PAYOFF_CASH DR CASH_BANK 82280000',
          'OUT_PRIN CR LOAN_PORTFOLIO[NORMAL] 80000000', 'EARNED_INT CR INTEREST_RECEIVABLE 600000', 'EARLY_FEE CR FEE_INCOME 1600000', 'VAT_OUT CR TAX_PAYABLE 80000'] }
    ]
  },
  {
    name: 'Example 5: NPL, repossession and sale at a loss, Loan B',
    steps: [
      { event: 'STCH', qualifiers: { NEW: 'SUBSTANDARD', PREVIOUS: 'WATCH' }, tags: { OUT_PRIN: '150000000', UNCOL_INT: '6000000' },
        expected: ['OUT_PRIN DR LOAN_PORTFOLIO[SUBSTANDARD] 150000000', 'OUT_PRIN CR LOAN_PORTFOLIO[WATCH] 150000000',
          'UNCOL_INT DR INTEREST_INCOME 6000000', 'UNCOL_INT CR SUSPENDED_INTEREST 6000000'] },
      { event: 'ACCR_SUSP', tags: { INT_ACCR: '3000000' },
        expected: ['INT_ACCR DR INTEREST_RECEIVABLE 3000000', 'INT_ACCR CR SUSPENDED_INTEREST 3000000'] },
      { event: 'REPOSSESS', qualifiers: { CURRENT: 'SUBSTANDARD' }, tags: { APPRAISED: '125000000', RESERVE_ABS: '25000000', OUT_PRIN: '150000000', SUSP_CLR: '9000000' },
        expected: ['APPRAISED DR REPOSSESSED_VEHICLE_ASSET 125000000', 'RESERVE_ABS DR PROVISION_RESERVE 25000000', 'OUT_PRIN CR LOAN_PORTFOLIO[SUBSTANDARD] 150000000',
          'SUSP_CLR DR SUSPENDED_INTEREST 9000000', 'SUSP_CLR CR INTEREST_RECEIVABLE 9000000'] },
      { event: 'PROV_WB', tags: { PROV_WB: '5000000' },
        expected: ['PROV_WB DR PROVISION_RESERVE 5000000', 'PROV_WB CR PROVISION_EXPENSE 5000000'] },
      { event: 'VEH_DISPOSE', tags: { SALE_PRICE: '118000000', LOSS: '7000000', CARRYING: '125000000' },
        expected: ['SALE_PRICE DR CASH_BANK 118000000', 'LOSS DR LOSS_ON_REPOSSESSED_ASSET 7000000', 'CARRYING CR REPOSSESSED_VEHICLE_ASSET 125000000'] }
    ]
  },
  {
    name: 'Example 5 VAT: repossessed vehicle sale taxable, tax-inclusive',
    steps: [
      { event: 'VEH_DISPOSE', tags: { SALE_PRICE: '118000000', LOSS: '12619047.6190', CARRYING: '125000000', VAT_OUT: '5619047.6190' },
        expected: ['SALE_PRICE DR CASH_BANK 118000000', 'LOSS DR LOSS_ON_REPOSSESSED_ASSET 12619047.6190',
          'CARRYING CR REPOSSESSED_VEHICLE_ASSET 125000000', 'VAT_OUT CR TAX_PAYABLE 5619047.6190'] }
    ]
  },
  {
    name: 'Example 6: write-off, then recovery, Loan C',
    steps: [
      { event: 'WRITE_OFF', qualifiers: { CURRENT: 'LOSS' }, tags: { PRIN_WO: '60000000', SHORTFALL: '20000000', SUSP_CLR: '6000000', MEMO_WO: '86000000' },
        expected: ['PRIN_WO DR PROVISION_RESERVE 60000000', 'PRIN_WO CR LOAN_PORTFOLIO[LOSS] 60000000',
          'SHORTFALL DR LOAN_LOSS_SHORTFALL 20000000', 'SHORTFALL CR LOAN_PORTFOLIO[LOSS] 20000000',
          'SUSP_CLR DR SUSPENDED_INTEREST 6000000', 'SUSP_CLR CR INTEREST_RECEIVABLE 6000000',
          'MEMO_WO DR WRITTEN_OFF_MEMO_DR 86000000', 'MEMO_WO CR WRITTEN_OFF_MEMO_CR 86000000'] },
      { event: 'RECOVERY', tags: { REC_AMT: '10000000' },
        expected: ['REC_AMT DR CASH_BANK 10000000', 'REC_AMT CR BAD_DEBT_RECOVERY 10000000',
          'REC_AMT DR WRITTEN_OFF_MEMO_CR 10000000', 'REC_AMT CR WRITTEN_OFF_MEMO_DR 10000000'] }
    ]
  },
  {
    name: 'Example 7: reversal of the Example 2 receipt',
    steps: [
      { event: 'REVERSAL', reverses: 'ex2-liqd',
        expected: ['TOTAL_PAID CR CASH_BANK 23600000', 'INT_PAID DR INTEREST_RECEIVABLE 3600000', 'PRIN_PAID DR LOAN_PORTFOLIO[NORMAL] 20000000'] }
    ]
  },
  {
    name: 'Example 8: deal cancelled before disbursement',
    steps: [
      { event: 'FEE_REFUND', tags: { FEE_DOC: '3000000', INS_PREM: '7000000', REFUND_AMT: '10000000' },
        expected: ['FEE_DOC DR FEE_INCOME 3000000', 'INS_PREM DR INSURANCE_PAYABLE 7000000', 'REFUND_AMT CR CASH_BANK 10000000'] }
    ]
  },
  {
    name: 'Example 8 VAT: VAT booked at collection is refunded',
    steps: [
      { event: 'FEE_REFUND', tags: { FEE_DOC: '3000000', VAT_OUT: '150000', INS_PREM: '7000000', REFUND_AMT: '10150000' },
        expected: ['FEE_DOC DR FEE_INCOME 3000000', 'VAT_OUT DR TAX_PAYABLE 150000', 'INS_PREM DR INSURANCE_PAYABLE 7000000', 'REFUND_AMT CR CASH_BANK 10150000'] }
    ]
  }
];

module.exports = { DEFAULT_PRODUCT, EXAMPLES };
