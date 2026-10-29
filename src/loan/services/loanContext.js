/**
 * Loads the inputs the pure engines need (src/loan/engine) from the database.
 * Engines never read the database themselves. includePending lets the simulation preview
 * parameters that are not authorized yet; booking always uses AUTHORIZED rows only.
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');

// The DB driver may return DECIMAL columns as JS numbers; engines only accept decimal strings
const DECIMAL_FIELDS = ['defaultValue', 'minValue', 'maxValue', 'fromValue', 'toValue', 'tierRate', 'provisionRate', 'collateralHaircutPct',
  'minAmount', 'maxAmount', 'minInterestRate', 'maxInterestRate', 'minDownPaymentPct', 'maxLtvPct'];
const dec = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, DECIMAL_FIELDS.includes(k) && typeof v === 'number' ? String(v) : v]));

const statusesFor = includePending => (includePending ? ['AUTHORIZED', 'PENDING'] : ['AUTHORIZED']);
const effectiveOn = (rows, date) => rows
  .filter(r => String(r.effectiveFrom) <= date && (!r.effectiveTo || String(r.effectiveTo) >= date))
  .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));

const businessDate = async () => {
  const sd = await db.lnSystemDate.findOne({ order: [['id', 'ASC']] });
  return sd ? String(sd.currentBusinessDate) : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });
};

const currencyRule = async (currencyId, date, includePending) => {
  const rows = (await db.lnCurrencyRule.findAll({ where: { currencyId, authStatus: statusesFor(includePending) } })).map(r => r.get({ plain: true }));
  const rule = effectiveOn(rows, date)[0];
  if (!rule) throw new LoanError(409, `No ${includePending ? '' : 'authorized '}rounding rule (ln_currency_rule) for currency ${currencyId} on ${date}`);
  return rule;
};

// Weekend days from the branch calendar (or the global one), plus authorized holiday dates (read live)
const calendarFor = async (branchId) => {
  const calendars = await db.lnHolidayCalendar.findAll({ where: { authStatus: 'AUTHORIZED' } });
  const cal = calendars.find(c => Number(c.branchId) === Number(branchId)) || calendars.find(c => c.branchId == null);
  if (!cal) return { calendar: E.calendar.makeCalendar({ weekendDays: '' }), calendarCode: null };
  const dates = await db.lnHolidayDate.findAll({ where: { calendarId: cal.id, authStatus: 'AUTHORIZED' }, attributes: ['holidayDate'] });
  return { calendar: E.calendar.makeCalendar({ weekendDays: cal.weekendDays, holidays: dates.map(d => String(d.holidayDate)) }), calendarCode: cal.calendarCode };
};

const productChildren = async (productId) => {
  const [components, udes, waterfall] = await Promise.all([
    db.lnProductComponent.findAll({ where: { productId } }),
    db.lnProductUde.findAll({ where: { productId } }),
    db.lnWaterfallRule.findAll({ where: { productId }, order: [['accountStatus', 'ASC'], ['priorityOrder', 'ASC']] })
  ]);
  const componentRows = await db.lnComponent.findAll();
  const codeOf = Object.fromEntries(componentRows.map(c => [c.id, c]));
  const rateTiers = components.length ? await db.lnRateTier.findAll({ where: { productComponentId: components.map(c => c.id) } }) : [];
  return {
    components: components.map(c => ({ ...dec(c.get({ plain: true })), componentCode: codeOf[c.componentId] && codeOf[c.componentId].componentCode, componentType: codeOf[c.componentId] && codeOf[c.componentId].componentType })),
    udes: udes.map(u => dec(u.get({ plain: true }))),
    waterfall: waterfall.map(w => ({ ...w.get({ plain: true }), componentCode: codeOf[w.componentId] && codeOf[w.componentId].componentCode })),
    rateTiers: rateTiers.map(t => dec(t.get({ plain: true }))),
    componentIdOf: code => (componentRows.find(c => c.componentCode === code) || {}).id
  };
};

const lookups = async (product) => {
  const [dayCount, frequency] = await Promise.all([
    db.lnLookupDayCount.findByPk(product.dayCountCode),
    db.lnLookupFrequency.findByPk(product.defaultFrequencyCode)
  ]);
  if (!dayCount) throw new LoanError(409, `Day count ${product.dayCountCode} not found`);
  if (!frequency) throw new LoanError(409, `Frequency ${product.defaultFrequencyCode} not found`);
  return {
    dayCount: { code: dayCount.code, daysInYear: dayCount.daysInYear },
    frequency: { code: frequency.code, periodsPerYear: String(frequency.periodsPerYear) }
  };
};

// Waterfall order for a status; statuses without rows use the NORMAL order (decision D5)
const waterfallFor = (waterfall, status) => {
  const rows = waterfall.filter(w => w.accountStatus === status);
  const use = rows.length ? rows : waterfall.filter(w => w.accountStatus === 'NORMAL');
  return use.sort((a, b) => a.priorityOrder - b.priorityOrder).map(w => w.componentCode);
};

// Live classification inputs (spec §4.1: read live, effective-dated)
const classification = async (date) => {
  const [statuses, classes, movement, cure] = await Promise.all([
    db.lnStatusMaster.findAll({ where: { authStatus: 'AUTHORIZED' } }),
    db.lnRegulatoryClass.findAll({ where: { authStatus: 'AUTHORIZED' } }),
    db.lnStatusMovementRule.findAll({ where: { authStatus: 'AUTHORIZED' } }),
    db.lnStatusCureRule.findAll({ where: { authStatus: 'AUTHORIZED' } })
  ]);
  const qualifierOf = Object.fromEntries(classes.map(c => [c.classCode, c.glQualifier]));
  return {
    statusMaster: Object.fromEntries(statuses.map(s => [s.statusCode, { interestTreatment: s.interestTreatment, glQualifier: qualifierOf[s.regulatoryClassCode], regulatoryClassCode: s.regulatoryClassCode }])),
    movementRules: effectiveOn(movement.map(m => m.get({ plain: true })), date),
    cureRules: cure.map(c => c.get({ plain: true }))
  };
};

const provisionRuleFor = async (classCode, product, date) => {
  const rows = (await db.lnProvisionRule.findAll({ where: { regulatoryClassCode: classCode, authStatus: 'AUTHORIZED' } })).map(r => dec(r.get({ plain: true })));
  const eff = effectiveOn(rows, date);
  return eff.find(r => Number(r.productId) === Number(product.id))
    || eff.find(r => r.productId == null && Number(r.categoryId) === Number(product.categoryId))
    || eff.find(r => r.productId == null && r.categoryId == null) || null;
};

const udeValue = (udes, code) => {
  const u = udes.find(x => x.udeCode === code);
  return u ? String(u.defaultValue) : null;
};

module.exports = { dec, businessDate, currencyRule, calendarFor, productChildren, lookups, waterfallFor, classification, provisionRuleFor, udeValue, effectiveOn, statusesFor };
