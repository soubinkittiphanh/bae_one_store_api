/**
 * Account parameter snapshot (spec Rev 4 §4.1): what is frozen at booking. DPD rules, provision
 * rules, holiday dates and rate-index values stay live and are NOT copied here.
 */
const SNAPSHOT_VERSION = 1;

const PRODUCT_FIELDS = [
  'id', 'productCode', 'version', 'name', 'categoryId', 'loanTypeCode', 'disbursementTargetCode', 'feeFinancingMode',
  'deferredFeePresentation', 'earlySettlementRebateMethod', 'accrualMethodCode', 'interestRecognitionCode',
  'repaymentMethodCode', 'dayCountCode', 'defaultFrequencyCode', 'holidayHandlingCode', 'partialPrepayOption',
  'overpaymentTreatment', 'oldestInstallmentFirst', 'maxGracePeriods', 'firstPeriodMinDays', 'firstPeriodMaxDays'
];

const pick = (row, fields) => Object.fromEntries(fields.map(f => [f, row[f] === undefined ? null : row[f]]));

const buildSnapshot = ({ product, components, udes, waterfall, rateTiers, dayCount, frequency, currencyRule, terms, schedule, frozenAt }) => ({
  snapshotVersion: SNAPSHOT_VERSION,
  frozenAt,
  product: pick(product, PRODUCT_FIELDS),
  components: components.map(c => pick(c, ['componentId', 'componentCode', 'componentType', 'formulaCode', 'defaultValue', 'minValue', 'maxValue', 'timing', 'isEIRAmortized'])),
  udes: udes.map(u => pick(u, ['udeCode', 'defaultValue', 'minValue', 'maxValue', 'isAmendableAtAccount'])),
  waterfall: waterfall.map(w => pick(w, ['accountStatus', 'priorityOrder', 'componentId', 'componentCode'])),
  rateTiers: rateTiers.map(t => pick(t, ['productComponentId', 'tierBasis', 'fromValue', 'toValue', 'tierRate'])),
  dayCount: pick(dayCount, ['code', 'daysInYear']),
  frequency: pick(frequency, ['code', 'periodsPerYear']),
  currencyRule: pick(currencyRule, ['currencyId', 'decimalPlaces', 'roundingMode', 'effectiveFrom']),
  terms,
  schedule
});

module.exports = { buildSnapshot, SNAPSHOT_VERSION, PRODUCT_FIELDS };
