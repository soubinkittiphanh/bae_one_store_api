/**
 * Car Parking Fee Calculation Service
 * 
 * Business Rules:
 * 1. Timestamps evaluated in Asia/Vientiane timezone (+07:00).
 * 2. Exit time cannot be earlier than entry time.
 * 3. Monthly pass: Valid active pass incurs 0 LAK fee (unless lost ticket penalty).
 * 4. Grace period: If total duration <= gracePeriodMinutes, fee is 0 LAK.
 * 5. Partial hours are rounded UP to the next full hour (e.g. 1 hr 5 min = 2 hrs).
 * 6. Day time vs Night time:
 *    - Each hour block is categorized into Day or Night based on dayStartTime and dayEndTime.
 *    - Night pricing supports HOURLY or FLAT overnight surcharge.
 * 7. Daily Cap: Max fee charged per 24-hour cycle.
 * 8. Lost Ticket: Penalty fee added when ticket is lost.
 */

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calculateParkingFee({
  entryTime,
  exitTime = new Date(),
  pricingRule,
  monthlyPass = null,
  isLostTicket = false
}) {
  const start = new Date(entryTime);
  const end = new Date(exitTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid entryTime or exitTime provided.');
  }

  if (end.getTime() < start.getTime()) {
    throw new Error('Exit time cannot be earlier than entry time.');
  }

  const durationMs = end.getTime() - start.getTime();
  const totalMinutes = Math.floor(durationMs / (1000 * 60));

  // Default pricing rule fallback if none provided
  const rule = pricingRule || {
    gracePeriodMinutes: 15,
    dayStartTime: '06:00',
    dayEndTime: '18:00',
    dayHourlyRate: 5000,
    nightHourlyRate: 10000,
    nightPricingType: 'HOURLY',
    dailyCap: 50000,
    lostTicketFee: 100000
  };

  const gracePeriodMinutes = Number(rule.gracePeriodMinutes) || 15;
  const dayStartMinutes = parseTimeToMinutes(rule.dayStartTime || '06:00');
  const dayEndMinutes = parseTimeToMinutes(rule.dayEndTime || '18:00');
  const dayHourlyRate = Number(rule.dayHourlyRate) || 0;
  const nightHourlyRate = Number(rule.nightHourlyRate) || 0;
  const nightPricingType = rule.nightPricingType || 'HOURLY';
  const dailyCap = Number(rule.dailyCap) || 0;
  const lostTicketFee = Number(rule.lostTicketFee) || 0;

  // 1. Check if vehicle holds an active Monthly Pass
  let isPassValid = false;
  if (monthlyPass && monthlyPass.status === 'active') {
    const passStart = new Date(monthlyPass.startDate);
    const passEnd = new Date(monthlyPass.endDate);
    passEnd.setHours(23, 59, 59, 999);
    if (start >= passStart && start <= passEnd) {
      isPassValid = true;
    }
  }

  if (isPassValid && !isLostTicket) {
    return {
      durationMinutes: totalMinutes,
      totalHours: 0,
      dayHours: 0,
      nightHours: 0,
      isGracePeriod: false,
      isMonthlyPass: true,
      isLostTicket: false,
      dayHourlyRate,
      nightHourlyRate,
      baseDayFee: 0,
      baseNightFee: 0,
      subtotalBeforeCap: 0,
      dailyCapApplied: false,
      penaltyFee: 0,
      totalFee: 0
    };
  }

  // 2. Check Grace Period
  if (totalMinutes <= gracePeriodMinutes && !isLostTicket) {
    return {
      durationMinutes: totalMinutes,
      totalHours: 0,
      dayHours: 0,
      nightHours: 0,
      isGracePeriod: true,
      isMonthlyPass: false,
      isLostTicket: false,
      dayHourlyRate,
      nightHourlyRate,
      baseDayFee: 0,
      baseNightFee: 0,
      subtotalBeforeCap: 0,
      dailyCapApplied: false,
      penaltyFee: 0,
      totalFee: 0
    };
  }

  // 3. Hour-by-hour breakdown in Asia/Vientiane (+07:00)
  // Total billable hours (rounded up)
  const totalHours = Math.max(1, Math.ceil(totalMinutes / 60));

  let dayHours = 0;
  let nightHours = 0;

  // Calculate 24-hr cycles for daily cap
  const full24hCycles = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;

  // Step through each hour from start to determine day vs night
  // Vientiane is UTC+7
  const VIENTIANE_OFFSET_MS = 7 * 60 * 60 * 1000;

  for (let i = 0; i < totalHours; i++) {
    // Timestamp at the middle of this hour block
    const blockTime = new Date(start.getTime() + i * 60 * 60 * 1000 + 30 * 60 * 1000);
    // Convert to Vientiane local minutes of day
    const vientianeTime = new Date(blockTime.getTime() + VIENTIANE_OFFSET_MS);
    const hour = vientianeTime.getUTCHours();
    const minute = vientianeTime.getUTCMinutes();
    const minutesOfDay = hour * 60 + minute;

    // Check if within Day window
    const isDay = (dayStartMinutes <= dayEndMinutes)
      ? (minutesOfDay >= dayStartMinutes && minutesOfDay < dayEndMinutes)
      : (minutesOfDay >= dayStartMinutes || minutesOfDay < dayEndMinutes);

    if (isDay) {
      dayHours++;
    } else {
      nightHours++;
    }
  }

  // Calculate base rates
  const baseDayFee = dayHours * dayHourlyRate;
  let baseNightFee = 0;

  if (nightPricingType === 'FLAT') {
    // If flat night surcharge: 1 surcharge per night encountered (or multi-day)
    const nightsEncountered = Math.max(nightHours > 0 ? 1 : 0, full24hCycles + (remainingHours > 12 && nightHours > 0 ? 1 : 0));
    baseNightFee = nightsEncountered * nightHourlyRate;
  } else {
    baseNightFee = nightHours * nightHourlyRate;
  }

  const subtotalBeforeCap = baseDayFee + baseNightFee;

  // 4. Daily Cap evaluation
  let calculatedFee = subtotalBeforeCap;
  let dailyCapApplied = false;

  if (dailyCap > 0) {
    if (full24hCycles > 0) {
      // For multi-day: cap each full 24h cycle
      const fullCycleFee = full24hCycles * dailyCap;
      const remainingDayHoursRatio = totalHours > 0 ? (remainingHours / totalHours) : 0;
      const remainingFeeBeforeCap = subtotalBeforeCap * remainingDayHoursRatio;
      const remainingCappedFee = Math.min(remainingFeeBeforeCap, dailyCap);
      calculatedFee = fullCycleFee + remainingCappedFee;
      dailyCapApplied = calculatedFee < subtotalBeforeCap;
    } else if (subtotalBeforeCap > dailyCap) {
      calculatedFee = dailyCap;
      dailyCapApplied = true;
    }
  }

  // If monthly pass holder has lost ticket, they pay only the lost ticket fee
  if (isPassValid && isLostTicket) {
    calculatedFee = 0;
  }

  // 5. Add Penalty Fee if Lost Ticket
  const penaltyFee = isLostTicket ? lostTicketFee : 0;
  const totalFee = calculatedFee + penaltyFee;

  return {
    durationMinutes: totalMinutes,
    totalHours,
    dayHours,
    nightHours,
    isGracePeriod: false,
    isMonthlyPass: isPassValid,
    isLostTicket,
    dayHourlyRate,
    nightHourlyRate,
    baseDayFee,
    baseNightFee,
    subtotalBeforeCap,
    dailyCapApplied,
    penaltyFee,
    totalFee: Math.round(totalFee)
  };
}

module.exports = {
  calculateParkingFee,
  parseTimeToMinutes
};
