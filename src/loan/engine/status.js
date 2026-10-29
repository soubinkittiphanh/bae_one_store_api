/**
 * DPD / status engine (pure). Bands come live from ln_status_movement_rule; upgrades need a cure
 * rule (ln_status_cure_rule). REPOSSESSED, WRITTEN_OFF and CLOSED are never set or left by DPD.
 * Output: STCH (OUT_PRIN, plus UNCOL_INT when leaving accrual) or STCH_CURE (OUT_PRIN, SUSP_REV),
 * with PREVIOUS / NEW GL qualifiers from status -> regulatory class -> glQualifier.
 */
const N = require('./num');
const { clean } = require('./prepayment');
const { LoanError } = require('../errors');

const TERMINAL = ['REPOSSESSED', 'WRITTEN_OFF', 'CLOSED'];

// Rank statuses along the DPD chain: base (lowest band's fromStatus) = 0, then by minDpd
const chainOf = (rules) => {
  const sorted = [...rules].sort((a, b) => a.minDpd - b.minDpd);
  if (!sorted.length) throw new LoanError(409, 'No authorized DPD movement rules');
  const rank = { [sorted[0].fromStatus]: 0 };
  sorted.forEach((r, i) => { rank[r.toStatus] = i + 1; });
  return { sorted, rank, base: sorted[0].fromStatus };
};

const targetFor = (dpd, chain) => {
  let target = chain.base;
  for (const r of chain.sorted) if (dpd >= r.minDpd && dpd <= r.maxDpd) target = r.toStatus;
  return target;
};

/**
 * input: { currentStatus, dpd, movementRules, cureRules, statusMaster: { CODE: { interestTreatment, glQualifier } },
 *          onTimeStreak, monthsInStatus, outstandingPrincipal, bookedUnpaidInterest, suspendedInterest, rounder }
 */
const evaluateStatus = (input) => {
  const { currentStatus, dpd, statusMaster, rounder } = input;
  const base = { dpd, previousStatus: currentStatus, newStatus: currentStatus, changed: false, events: [] };
  if (TERMINAL.includes(currentStatus)) return { ...base, reason: `${currentStatus} is not changed by DPD` };
  const chain = chainOf(input.movementRules);
  if (!(currentStatus in chain.rank)) throw new LoanError(409, `Status ${currentStatus} is not on the DPD chain`);
  const target = targetFor(dpd, chain);
  let next = currentStatus;
  let reason;
  if (chain.rank[target] > chain.rank[currentStatus]) {
    next = target;
    reason = `DPD ${dpd} falls in the ${target} band`;
  } else if (chain.rank[target] < chain.rank[currentStatus]) {
    const cure = (input.cureRules || []).find(c => c.fromStatus === currentStatus);
    if (!cure) return { ...base, reason: `No cure rule for ${currentStatus}; stays until one is authorized` };
    const needStreak = Number(cure.consecutiveOnTimeInstallmentsRequired || 0);
    const needMonths = Number(cure.observationMonthsRequired || 0);
    if (Number(input.onTimeStreak || 0) < needStreak || Number(input.monthsInStatus || 0) < needMonths) {
      return { ...base, reason: `Cure needs ${needStreak} on-time installment(s) and ${needMonths} month(s) in ${currentStatus}` };
    }
    next = chain.rank[cure.toStatus] >= chain.rank[target] ? cure.toStatus : target;
    reason = `Cured: ${needStreak} on-time installment(s)`;
  } else {
    return { ...base, reason: `DPD ${dpd} keeps ${currentStatus}` };
  }

  const from = statusMaster[currentStatus];
  const to = statusMaster[next];
  if (!from || !to) throw new LoanError(409, `Status master missing for ${currentStatus} or ${next}`);
  const accruing = s => s.interestTreatment === 'CONTINUE_ACCRUAL';
  const qualifiers = { PREVIOUS: from.glQualifier, NEW: to.glQualifier };
  const tags = { OUT_PRIN: input.outstandingPrincipal };
  let event = 'STCH';
  if (accruing(from) && !accruing(to)) tags.UNCOL_INT = input.bookedUnpaidInterest || 0;
  if (!accruing(from) && accruing(to)) { event = 'STCH_CURE'; tags.SUSP_REV = input.suspendedInterest || 0; }
  return { dpd, previousStatus: currentStatus, newStatus: next, changed: true, reason, qualifiers, events: [{ event, tags: clean(tags, rounder), qualifiers }] };
};

module.exports = { evaluateStatus, chainOf, targetFor, TERMINAL };
