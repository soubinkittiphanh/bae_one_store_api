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
  'lookup-deferred-fee-presentation': 'lnLookupDeferredFeePresentation'
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
    children: ['lnProductCurrency', 'lnProductComponent', 'lnProductUde', 'lnWaterfallRule', 'lnDocumentChecklist'],
    fields: {
      categoryId: ref('lnProductCategory'),
      loanTypeCode: ref('lnLookupLoanType', 'code'),
      disbursementTargetCode: ref('lnLookupDisbursementTarget', 'code'),
      deferredFeePresentation: ref('lnLookupDeferredFeePresentation', 'code'),
      earlySettlementRebateMethod: ref('lnLookupRebateMethod', 'code'),
      accrualMethodCode: ref('lnLookupAccrualMethod', 'code'),
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
      (row) => (row.disbursementTargetCode === 'SALE_INVOICE_SETTLEMENT' && row.feeFinancingMode === 'DEDUCTED'
        ? 'DEDUCTED fee mode is not allowed with SALE_INVOICE_SETTLEMENT (it would leave an unpaid invoice balance)'
        : null)
    ]
  },

  'product-currency': {
    model: 'lnProductCurrency', functionCode: 'LN_PRODUCT',
    fields: { productId: ref('lnProduct'), currencyId: ref('currency') }
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
    fields: { productComponentId: ref('lnProductComponent'), tierBasis: enumOf('AMOUNT', 'TENOR') },
    rules: [minMax('fromValue', 'toValue', 'Tier')]
  },
  'holiday-calendar': { model: 'lnHolidayCalendar', functionCode: 'LN_HOLIDAY', fields: { branchId: ref('location') } },
  'holiday-date': { model: 'lnHolidayDate', functionCode: 'LN_HOLIDAY', fields: { calendarId: ref('lnHolidayCalendar') } },
  fee: {
    model: 'lnFeeMaster', functionCode: 'LN_FEE',
    fields: { componentId: ref('lnComponent'), triggerEventCode: ref('lnEventMaster', 'eventCode'), accountingRoleCode: ref('lnAccountingRole', 'roleCode') },
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
    fields: { entityType: enumOf('APPLICATION', 'WRITE_OFF', 'AMENDMENT') },
    rules: [minMax('minAmount', 'maxAmount', 'Amount')]
  },
  'document-checklist': { model: 'lnDocumentChecklist', functionCode: 'LN_DOC_CHECKLIST', fields: { productId: ref('lnProduct') } },

  // Accounting setup is view-only in Phase 2A (LN_ACCOUNTING_SETUP grants VIEW only; 2B held)
  'accounting-role': { model: 'lnAccountingRole', functionCode: 'LN_ACCOUNTING_SETUP', fields: { resolverType: enumOf('MAPPING_TABLE', 'SYSTEM_PARAM', 'BANK_ACCOUNT') } },
  'amount-tag': { model: 'lnAmountTag', functionCode: 'LN_ACCOUNTING_SETUP' },
  event: { model: 'lnEventMaster', functionCode: 'LN_ACCOUNTING_SETUP' },
  'accounting-entry-rule': { model: 'lnAccountingEntryRule', functionCode: 'LN_ACCOUNTING_SETUP' },
  'role-gl-mapping': { model: 'lnRoleGlMapping', functionCode: 'LN_ACCOUNTING_SETUP' },

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

module.exports = { ENTITIES, SYSTEM_FIELDS, getEntity, entityForModel };
