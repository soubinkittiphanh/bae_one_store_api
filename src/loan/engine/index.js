/**
 * Loan calculation engines (Phase 3). Pure functions only: no database access, no GL posting,
 * no floats. Each engine returns amount tags that the Phase 2B entry rules turn into journals.
 */
module.exports = {
  num: require('./num'),
  dates: require('./dates'),
  dayCount: require('./dayCount'),
  calendar: require('./calendar'),
  rounding: require('./rounding'),
  state: require('./state'),
  schedule: require('./schedule'),
  interest: require('./interest'),
  prepayment: require('./prepayment'),
  allocation: require('./allocation'),
  status: require('./status'),
  provision: require('./provision'),
  fees: require('./fees'),
  snapshot: require('./snapshot'),
  events: require('./events')
};
