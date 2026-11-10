/**
 * Loan parameter entity registry.
 * Each entity maps a URL name to a model, its sec_function code and field rules.
 * Field types are derived from the model column types; `fields` overrides add
 * references (ref), enums and special numeric types. Engines read only AUTHORIZED rows.
 */
const { compareDecimal } = require('../decimal');

const LOOKUPS = {
  'lookup-loan-type': 'lnLookupLoanType',
  'lookup-frequency': 'lnLookupFrequency',
  'lookup-disbursement-target': 'lnLookupDisbursementTarget',
  'lookup-holiday-handling': 'lnLookupHolidayHandling',
  'lookup-day-count': 'lnLookupDayCount',
  'lookup-rebate-method': 'lnLookupRebateMethod',
  'lookup-accrual-method': 'lnLookupAccrualMethod',
  'lookup-collateral-type': 'lnLookupCollateralType',
  'lookup-loan-purpose': 'lnLookupLoanPurpose',
  'lookup-deferred-fee-presentation': 'lnLookupDeferredFeePresentation',
  'lookup-interest-recognition': 'lnLookupInterestRecognition',
  'lookup-repayment-method': 'lnLookupRepaymentMethod'
};

// ref: { model, key } -> value must exist; loan refs must not be REJECTED/CLOSED, and must be
// AUTHORIZED before the referencing row can be authorized.
const ref = (model, key = 'id') => ({ ref: { model, key } });
const enumOf = (...values) => ({ enum: values });

const minMax = (minField, maxField, label) => (row) => {
  if (row[minField] == null || row[maxField] == null) return null;
  return compareDecimal(row[minField], row[maxField]) > 0 ? `${label}: ${minField} cannot exceed ${maxField}` : null;
};

// YYYY-MM-DD strings compare correctly as text
const dateOrder = (fromField, toField, label) => (row) => (
  row[fromField] && row[toField] && String(row[toField]) < String(row[fromField]) ? `${label}: ${toField} is before ${fromField}` : null
);

// Values a print template may use (filled by the screen from the account; nothing else is substituted)
const PRINT_PLACEHOLDERS = ['companyName', 'printDate', 'customerName', 'customerPhone', 'accountNo', 'productName', 'currency', 'principal',
  'interestRatePct', 'tenorMonths', 'installmentCount', 'installmentAmount', 'valueDate', 'firstDueDate', 'maturityDate'];

const ENTITIES = {
  ...Object.fromEntries(Object.entries(LOOKUPS).map(([name, model]) => [name, {
    model, functionCode: 'LN_LOOKUP', key: 'code',
    fields: name === 'lookup-frequency' ? { periodsPerYear: { type: 'decimal96' } } : {}
  }])),

  'product-category': { model: 'lnProductCategory', functionCode: 'LN_PRODUCT_CATEGORY' },

  product: {
    model: 'lnProduct',
    functionCode: 'LN_PRODUCT',
    versioned: true,
    readOnly: ['version', 'status'],
    children: ['lnProductCurrency', 'lnProductAmount', 'lnProductComponent', 'lnProductUde', 'lnWaterfallRule', 'lnDocumentChecklist'],
    fields: {
      categoryId: ref('lnProductCategory'),
      loanTypeCode: ref('lnLookupLoanType', 'code'),
      disbursementTargetCode: ref('lnLookupDisbursementTarget', 'code'),
      deferredFeePresentation: ref('lnLookupDeferredFeePresentation', 'code'),
      earlySettlementRebateMethod: ref('lnLookupRebateMethod', 'code'),
      accrualMethodCode: ref('lnLookupAccrualMethod', 'code'),
      interestRecognitionCode: ref('lnLookupInterestRecognition', 'code'),
      repaymentMethodCode: ref('lnLookupRepaymentMethod', 'code'),
      dayCountCode: ref('lnLookupDayCount', 'code'),
      defaultFrequencyCode: ref('lnLookupFrequency', 'code'),
      holidayHandlingCode: ref('lnLookupHolidayHandling', 'code'),
      feeFinancingMode: enumOf('CAPITALIZED', 'UPFRONT', 'DEDUCTED'),
      partialPrepayOption: enumOf('REDUCE_INSTALLMENT', 'REDUCE_TENOR'),
      overpaymentTreatment: enumOf('CUSTOMER_ADVANCE', 'AUTO_FUTURE_INSTALLMENTS', 'PRINCIPAL_PREPAY')
    },
    rules: [
      minMax('minAmount', 'maxAmount', 'Amount'),
      minMax('minTenorMonths', 'maxTenorMonths', 'Tenor'),
      minMax('minInterestRate', 'maxInterestRate', 'Interest rate'),
      minMax('firstPeriodMinDays', 'firstPeriodMaxDays', 'First period days'),
      // Phase 3 engine combinations (decision D6)
      (row) => {
        if (!row.repaymentMethodCode || !row.accrualMethodCode) return null;
        const flat = row.repaymentMethodCode === 'FLAT';
        const flatAccrual = ['MONTHLY_FLAT', 'UPFRONT_SIMPLE'].includes(row.accrualMethodCode);
        if (flat !== flatAccrual) return `Repayment method ${row.repaymentMethodCode} cannot be combined with accrual method ${row.accrualMethodCode}`;
        return null;
      },
      (row) => (row.repaymentMethodCode === 'FLAT' && row.earlySettlementRebateMethod === 'ACTUARIAL_PRO_RATA'
        ? 'ACTUARIAL_PRO_RATA rebate is not supported for FLAT products (use RULE_OF_78 or NONE)'
        : null),
      (row) => (row.disbursementTargetCode === 'SALE_INVOICE_SETTLEMENT' && row.feeFinancingMode === 'DEDUCTED'
        ? 'DEDUCTED fee mode is not allowed with SALE_INVOICE_SETTLEMENT (it would leave an unpaid invoice balance)'
        : null)
    ]
  },

  'product-currency': {
    model: 'lnProductCurrency', functionCode: 'LN_PRODUCT',
    fields: { productId: ref('lnProduct'), currencyId: ref('currency') },
    rules: [minMax('minAmount', 'maxAmount', 'Amount')]
  },
  // Phase 5 B0: fixed amounts per currency (a component with a fixed-amount formula, a UDE of dataType AMOUNT)
  'product-amount': {
    model: 'lnProductAmount', functionCode: 'LN_PRODUCT',
    fields: { productId: ref('lnProduct'), currencyId: ref('currency'), itemType: enumOf('COMPONENT', 'UDE') },
    rules: [minMax('minValue', 'maxValue', 'Value'), minMax('minValue', 'defaultValue', 'Default'), minMax('defaultValue', 'maxValue', 'Default')]
  },
  component: {
    model: 'lnComponent', functionCode: 'LN_COMPONENT',
    fields: { taxPointEvent: enumOf('DISB', 'BILL', 'COLLECTION', 'VEH_DISPOSE') }
  },
  'product-component': {
    model: 'lnProductComponent', functionCode: 'LN_PRODUCT',
    fields: { productId: ref('lnProduct'), componentId: ref('lnComponent') },
    rules: [minMax('minValue', 'maxValue', 'Value'), minMax('minValue', 'defaultValue', 'Default'), minMax('defaultValue', 'maxValue', 'Default')]
  },
  'waterfall-rule': {
    model: 'lnWaterfallRule', functionCode: 'LN_PRODUCT',
    fields: { productId: ref('lnProduct'), componentId: ref('lnComponent'), accountStatus: ref('lnStatusMaster', 'statusCode') }
  },
  ude: { model: 'lnUde', functionCode: 'LN_UDE', fields: { dataType: enumOf('RATE', 'AMOUNT', 'DAYS', 'COUNT') } },
  'product-ude': {
    model: 'lnProductUde', functionCode: 'LN_PRODUCT',
    fields: { productId: ref('lnProduct'), udeCode: ref('lnUde', 'udeCode') },
    rules: [minMax('minValue', 'maxValue', 'Value'), minMax('minValue', 'defaultValue', 'Default'), minMax('defaultValue', 'maxValue', 'Default')]
  },
  'rate-index': { model: 'lnRateIndex', functionCode: 'LN_RATE_INDEX', fields: { resetFrequencyCode: ref('lnLookupFrequency', 'code') } },
  'rate-index-value': { model: 'lnRateIndexValue', functionCode: 'LN_RATE_INDEX', fields: { rateIndexId: ref('lnRateIndex') } },
  'rate-tier': {
    model: 'lnRateTier', functionCode: 'LN_PRODUCT',
    fields: { productComponentId: ref('lnProductComponent'), tierBasis: enumOf('AMOUNT', 'TENOR'), currencyId: ref('currency') },
    rules: [minMax('fromValue', 'toValue', 'Tier'), (row) => (row.tierBasis === 'AMOUNT' && !row.currencyId ? 'An AMOUNT tier needs its currencyId' : null)]
  },
  'holiday-calendar': {
    model: 'lnHolidayCalendar', functionCode: 'LN_HOLIDAY',
    fields: { branchId: ref('location') },
    rules: [(row) => (row.weekendDays !== undefined && !/^((MON|TUE|WED|THU|FRI|SAT|SUN)(,(MON|TUE|WED|THU|FRI|SAT|SUN))*)?$/.test(row.weekendDays)
      ? 'weekendDays must be a comma list of MON..SUN' : null)]
  },
  // Loan-owned rounding rule per currency (docs/loan/rounding-policy.md)
  'currency-rule': {
    model: 'lnCurrencyRule', functionCode: 'LN_CURRENCY_RULE',
    fields: { currencyId: ref('currency'), roundingMode: enumOf('HALF_UP') },
    rules: [
      (row) => (row.decimalPlaces !== undefined && (Number(row.decimalPlaces) < 0 || Number(row.decimalPlaces) > 2) ? 'decimalPlaces must be 0, 1 or 2 (general_ledger stores 2 decimals)' : null),
      dateOrder('effectiveFrom', 'effectiveTo', 'Currency rule')
    ]
  },
  // Phase 5: dated exchange rates, base units per 1 unit of the currency (maker-checker; LOAN_ALLOW_SELF_AUTHORIZE applies)
  'exchange-rate': {
    model: 'lnExchangeRate', functionCode: 'LN_EXCHANGE_RATE',
    fields: { currencyId: ref('currency'), source: enumOf('MANUAL', 'POS_COPY'), rate: { type: 'fxrate' } },
    rules: [(row) => (/^\d{1,12}(\.\d{1,8})?$/.test(String(row.rate)) && Number(row.rate) > 0 ? null : 'rate must be a positive decimal with at most 8 decimals')]
  },
  'holiday-date': { model: 'lnHolidayDate', functionCode: 'LN_HOLIDAY', fields: { calendarId: ref('lnHolidayCalendar') } },
  fee: {
    model: 'lnFeeMaster', functionCode: 'LN_FEE',
    fields: { currencyId: ref('currency'), componentId: ref('lnComponent'), triggerEventCode: ref('lnEventMaster', 'eventCode'), accountingRoleCode: ref('lnAccountingRole', 'roleCode') },
    rules: [minMax('minAmount', 'maxAmount', 'Amount')]
  },
  'tax-master': {
    model: 'lnTaxMaster', functionCode: 'LN_TAX_MASTER',
    fields: { componentId: ref('lnComponent'), posTaxId: ref('tax'), accountingRoleCode: ref('lnAccountingRole', 'roleCode') },
    rules: [dateOrder('effectiveFrom', 'effectiveTo', 'Effective dates')]
  },
  'regulatory-class': { model: 'lnRegulatoryClass', functionCode: 'LN_PROVISION' },
  status: { model: 'lnStatusMaster', functionCode: 'LN_STATUS_RULE', fields: { regulatoryClassCode: ref('lnRegulatoryClass', 'classCode') } },
  'status-movement-rule': {
    model: 'lnStatusMovementRule', functionCode: 'LN_STATUS_RULE',
    fields: { fromStatus: ref('lnStatusMaster', 'statusCode'), toStatus: ref('lnStatusMaster', 'statusCode') },
    rules: [minMax('minDpd', 'maxDpd', 'DPD range')]
  },
  'status-cure-rule': {
    model: 'lnStatusCureRule', functionCode: 'LN_STATUS_RULE',
    fields: { fromStatus: ref('lnStatusMaster', 'statusCode'), toStatus: ref('lnStatusMaster', 'statusCode') }
  },
  'provision-rule': {
    model: 'lnProvisionRule', functionCode: 'LN_PROVISION',
    fields: {
      regulatoryClassCode: ref('lnRegulatoryClass', 'classCode'),
      productId: ref('lnProduct'),
      categoryId: ref('lnProductCategory'),
      provisionBase: enumOf('NET_EXPOSURE', 'TOTAL_OUTSTANDING')
    }
  },
  'approval-matrix': {
    model: 'lnApprovalMatrix', functionCode: 'LN_APPROVAL_MATRIX',
    fields: { entityType: enumOf('APPLICATION', 'WRITE_OFF', 'AMENDMENT'), currencyId: ref('currency') },
    rules: [minMax('minAmount', 'maxAmount', 'Amount')]
  },
  'document-checklist': { model: 'lnDocumentChecklist', functionCode: 'LN_DOC_CHECKLIST', fields: { productId: ref('lnProduct') } },

  // Accounting setup is view-only in Phase 2A (LN_ACCOUNTING_SETUP grants VIEW only; 2B held)
  // Phase 5: roles are reviewed with their GL mappings (LN_GL_MAPPING maker-checker); seeded FX roles start PENDING
  'accounting-role': { model: 'lnAccountingRole', functionCode: 'LN_GL_MAPPING', fields: { resolverType: enumOf('MAPPING_TABLE', 'SYSTEM_PARAM', 'BANK_ACCOUNT') } },
  // Phase 2B: events, tags and entry rules are maintained under LN_ENTRY_RULE; roles and GL mappings stay view-only
  'amount-tag': { model: 'lnAmountTag', functionCode: 'LN_ENTRY_RULE' },
  event: { model: 'lnEventMaster', functionCode: 'LN_ENTRY_RULE' },
  'accounting-entry-rule': {
    model: 'lnAccountingEntryRule',
    functionCode: 'LN_ENTRY_RULE',
    fields: {
      productId: ref('lnProduct'),
      categoryId: ref('lnProductCategory'),
      eventCode: ref('lnEventMaster', 'eventCode'),
      amountTag: ref('lnAmountTag', 'tagCode'),
      roleCode: ref('lnAccountingRole', 'roleCode'),
      drCr: enumOf('DR', 'CR'),
      qualifierSource: enumOf('CURRENT', 'NEW', 'PREVIOUS', 'NONE'),
      feeModeFilter: enumOf('ANY', 'UPFRONT', 'CAPITALIZED', 'DEDUCTED'),
      presentationFilter: enumOf('ANY', 'IMMEDIATE', 'LIABILITY', 'CONTRA_ASSET_NET'),
      targetFilter: enumOf('ANY', 'SALE_INVOICE_SETTLEMENT', 'CASH_BANK', 'CUSTOMER_ACCOUNT')
    },
    rules: [
      (row) => {
        if (!row.roleCode || !row.qualifierSource) return null;
        if (row.roleCode === 'LOAN_PORTFOLIO') {
          const allowed = ['STCH', 'STCH_CURE'].includes(row.eventCode) ? ['NEW', 'PREVIOUS'] : ['CURRENT'];
          return allowed.includes(row.qualifierSource) ? null : `LOAN_PORTFOLIO needs qualifierSource ${allowed.join(' or ')} for ${row.eventCode}`;
        }
        return row.qualifierSource === 'NONE' ? null : 'Only LOAN_PORTFOLIO is status-qualified; use qualifierSource NONE';
      },
      dateOrder('effectiveFrom', 'effectiveTo', 'Entry rule')
    ]
  },
  // Phase 4: role-to-GL mappings follow maker-checker under LN_GL_MAPPING (SUPER_ADMIN by default)
  'role-gl-mapping': {
    model: 'lnRoleGlMapping', functionCode: 'LN_GL_MAPPING',
    fields: { roleCode: ref('lnAccountingRole', 'roleCode'), chartAccountId: ref('chartAccount'), productId: ref('lnProduct'), categoryId: ref('lnProductCategory'), branchId: ref('location'), currencyId: ref('currency') },
    rules: [dateOrder('effectiveFrom', 'effectiveTo', 'GL mapping')]
  },

  // Phase 5 B7: print wording (D11); placeholders must come from PRINT_PLACEHOLDERS
  'print-template': {
    model: 'lnPrintTemplate', functionCode: 'LN_PRINT_TEMPLATE',
    fields: { templateCode: enumOf('CONTRACT_SUMMARY', 'RECEIPT_FOOTER', 'STATEMENT_FOOTER') },
    rules: [
      (row) => {
        if (row.body === undefined || row.body === null) return null;
        const unknown = [...String(row.body).matchAll(/{{\s*([^}]*?)\s*}}/g)].map(m => m[1]).filter(p => !PRINT_PLACEHOLDERS.includes(p));
        return unknown.length ? `Unknown placeholder(s): ${[...new Set(unknown)].join(', ')}; allowed: ${PRINT_PLACEHOLDERS.join(', ')}` : null;
      },
      dateOrder('effectiveFrom', 'effectiveTo', 'Print template')
    ]
  },

  // Phase 6: a POS location used as a loan branch (its {BRANCH} numbering code), and the bank/cash
  // accounts each branch may post to. Maker-checker under LN_BRANCH.
  'branch-profile': {
    model: 'lnBranchProfile', functionCode: 'LN_BRANCH',
    fields: { locationId: ref('location') },
    // fits every number column: LN-<code>-YYYYMM-NNNNN is at most 26 of accountNo's 30 characters
    rules: [(row) => (row.branchCode !== undefined && !/^[A-Z0-9]{2,10}$/.test(String(row.branchCode)) ? 'branchCode must be 2 to 10 capital letters or digits' : null)]
  },
  'branch-bank-account': {
    model: 'lnBranchBankAccount', functionCode: 'LN_BRANCH',
    fields: { locationId: ref('location'), bankAccountId: ref('bankAccount'), purpose: enumOf('CASH', 'BANK') }
  },

  sequence: { model: 'lnNumberingSequence', functionCode: 'LN_SEQUENCE' },
  'batch-job': { model: 'lnBatchJob', functionCode: 'LN_BATCH_JOB', readOnly: ['lastRunDate', 'lastStatus'] }
};

// Columns managed by the maker-checker engine, never accepted from a client
const SYSTEM_FIELDS = ['authStatus', 'makerId', 'checkerId', 'authorizedAt', 'createdAt', 'updatedAt', 'optLockVersion'];

const getEntity = (name) => {
  const def = ENTITIES[name];
  return def ? { name, key: 'id', fields: {}, rules: [], readOnly: [], ...def } : null;
};

const entityForModel = (modelName) => Object.keys(ENTITIES).find(n => ENTITIES[n].model === modelName);

module.exports = { ENTITIES, SYSTEM_FIELDS, PRINT_PLACEHOLDERS, getEntity, entityForModel };
