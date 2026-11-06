const db = require('../models');
const { Op } = require('sequelize');
const feeService = require('./feeService');
const slotService = require('./slotService');
const vehicleTypeService = require('./vehicleTypeService');
const logger = require('../api/logger');

const PRICING_RULE_FIELDS = [
  'name', 'vehicleType', 'gracePeriodMinutes', 'dayStartTime', 'dayEndTime',
  'dayHourlyRate', 'nightHourlyRate', 'nightPricingType', 'dailyCap', 'lostTicketFee',
  'isDefault', 'isActive'
];

const toBool = v => v === true || v === 'true' || v === 1 || v === '1';

/**
 * The single rule used for a vehicle type: active + default.
 * Ordered so the pick is deterministic even if legacy data has several defaults
 * (most recently saved wins).
 */
async function findDefaultPricingRule(vehicleType, transaction) {
  if (!vehicleType) return null;
  return db.parkingPricingRule.findOne({
    where: { vehicleType, isDefault: true, isActive: true },
    order: [['updateTimestamp', 'DESC'], ['id', 'DESC']],
    transaction
  });
}

/**
 * Keeps "exactly one default per vehicle type" true for the given type:
 * if the type has active rules but no active default, the most recently saved active rule becomes default.
 */
async function ensureDefaultPricingRule(vehicleType, transaction) {
  if (!vehicleType) return;
  const existingDefault = await findDefaultPricingRule(vehicleType, transaction);
  if (existingDefault) return;
  const candidate = await db.parkingPricingRule.findOne({
    where: { vehicleType, isActive: true },
    order: [['updateTimestamp', 'DESC'], ['id', 'DESC']],
    transaction
  });
  if (candidate) await candidate.update({ isDefault: true }, { transaction });
}

const NO_RULE_WARNING = code =>
  `No active pricing rule for vehicle type "${code}" — the built-in fallback rate is used. ` +
  `Ask an admin to create one (ບໍ່ມີລາຄາສຳລັບປະເພດລົດນີ້ — ໃຊ້ລາຄາສຳຮອງ, ກະລຸນາແຈ້ງຜູ້ດູແລລະບົບ).`;

const parkingService = {
  NO_RULE_WARNING,
  findDefaultPricingRule,

  // =========================================================================
  // 1. VEHICLE ENTRY
  // =========================================================================
  async processEntry({ plateNumber, vehicleType, driverName, driverPhone, zoneId, slotId, notes, userId }) {
    const normalizedPlate = slotService.normalizePlateNumber(plateNumber);
    if (!normalizedPlate) {
      throw new Error('Plate number is required (ກະລຸນາປ້ອນເລກທະບຽນລົດ).');
    }

    // Resolve vehicle type from the customer-maintained master (default type when omitted)
    vehicleType = vehicleType
      ? await vehicleTypeService.assertActiveCode(vehicleType)
      : await vehicleTypeService.getDefaultCode();

    // 1. Check if vehicle is already actively parked inside
    const existingActiveTicket = await db.parkingTicket.findOne({
      where: {
        plateNumber: normalizedPlate,
        status: 'active'
      },
      include: [
        { model: db.parkingZone, as: 'zone', attributes: ['name', 'code'] },
        { model: db.parkingSlot, as: 'slot', attributes: ['slotNumber'] }
      ]
    });

    if (existingActiveTicket) {
      const slotNum = existingActiveTicket.slot?.slotNumber || 'Unknown';
      const zoneName = existingActiveTicket.zone?.name || 'Unknown';
      throw new Error(`Vehicle ${normalizedPlate} is already parked inside (Slot: ${slotNum}, ${zoneName}) with Ticket #${existingActiveTicket.ticketNumber}.`);
    }

    // 2. Find or create Vehicle master record
    const [vehicle] = await db.parkingVehicle.findOrCreate({
      where: { plateNumber: normalizedPlate },
      defaults: {
        plateNumber: normalizedPlate,
        vehicleType,
        driverName,
        driverPhone,
        notes
      }
    });

    // Update driver info if provided
    if (driverName || driverPhone) {
      await vehicle.update({
        driverName: driverName || vehicle.driverName,
        driverPhone: driverPhone || vehicle.driverPhone,
        vehicleType: vehicleType || vehicle.vehicleType
      });
    }

    // 3. Check for active Monthly Pass
    const today = new Date().toISOString().slice(0, 10);
    const activePass = await db.parkingMonthlyPass.findOne({
      where: {
        plateNumber: normalizedPlate,
        status: 'active',
        startDate: { [Op.lte]: today },
        endDate: { [Op.gte]: today }
      }
    });

    // 4. Find matching default pricing rule (entry is still allowed without one — the
    //    controller returns a warning and the fee engine falls back to its built-in rate)
    const pricingRule = await findDefaultPricingRule(vehicleType);
    if (!pricingRule) {
      logger.warn(`[parking] Entry for ${normalizedPlate}: no active pricing rule for vehicle type "${vehicleType}", fallback rate will be used.`);
    }

    // 5. Transactional slot reservation and ticket creation
    const transaction = await db.sequelize.transaction();
    try {
      // Find and lock available slot
      const targetSlotId = slotId || (activePass && activePass.slotId ? activePass.slotId : null);
      const slot = await slotService.findAndLockAvailableSlot({
        zoneId: zoneId || (slotId ? null : null),
        slotId: targetSlotId,
        vehicleType,
        transaction
      });

      const timestamp = Date.now();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const ticketNumber = `TKT-${timestamp}-${randomSuffix}`;
      const barcode = `PK-${timestamp}-${slot.id}`;

      const ticket = await db.parkingTicket.create({
        ticketNumber,
        barcode,
        vehicleId: vehicle.id,
        plateNumber: normalizedPlate,
        vehicleType,
        zoneId: slot.zoneId,
        slotId: slot.id,
        entryTime: new Date(),
        status: 'active',
        pricingRuleId: pricingRule ? pricingRule.id : null,
        monthlyPassId: activePass ? activePass.id : null,
        isMonthlyPass: !!activePass,
        isLostTicket: false,
        calculatedFee: 0,
        paidFee: 0,
        entryUserId: userId || 1,
        notes
      }, { transaction });

      // Mark slot occupied
      await slotService.occupySlot(slot.id, ticket.id, transaction);

      await transaction.commit();

      // Return populated ticket
      return await db.parkingTicket.findByPk(ticket.id, {
        include: [
          { model: db.parkingZone, as: 'zone' },
          { model: db.parkingSlot, as: 'slot' },
          { model: db.parkingVehicle, as: 'vehicle' },
          { model: db.parkingMonthlyPass, as: 'monthlyPass' },
          { model: db.user, as: 'entryUser', attributes: ['id', 'cus_name', 'cus_tel'] }
        ]
      });
    } catch (err) {
      await transaction.rollback();
      logger.error(`Error processing parking entry: ${err.message}`);
      throw err;
    }
  },

  // =========================================================================
  // 2. FEE CALCULATION
  // =========================================================================
  async calculateExitFee({ ticketId, ticketNumber, barcode, plateNumber, identifier, isLostTicket = false, exitTime = new Date() }) {
    const where = { status: 'active' };
    if (ticketId) {
      where.id = ticketId;
    } else {
      const candidates = [];
      const addCandidate = (field, val) => {
        if (val && typeof val === 'string' && val.trim()) {
          candidates.push({ [field]: val.trim() });
        }
      };

      addCandidate('ticketNumber', ticketNumber);
      addCandidate('barcode', barcode);

      if (plateNumber && typeof plateNumber === 'string' && plateNumber.trim()) {
        const norm = slotService.normalizePlateNumber(plateNumber);
        candidates.push({ plateNumber: norm });
        const noSpace = norm.replace(/\s+/g, '');
        if (noSpace !== norm) {
          candidates.push({ plateNumber: noSpace });
        }
      }

      if (identifier && typeof identifier === 'string' && identifier.trim()) {
        const idTrim = identifier.trim();
        const normId = slotService.normalizePlateNumber(idTrim);
        candidates.push({ ticketNumber: idTrim });
        candidates.push({ barcode: idTrim });
        candidates.push({ plateNumber: normId });
        const noSpace = normId.replace(/\s+/g, '');
        if (noSpace !== normId) {
          candidates.push({ plateNumber: noSpace });
        }
      }

      if (candidates.length === 0) {
        throw new Error('Please provide ticketId, ticketNumber, barcode, or plateNumber.');
      } else if (candidates.length === 1) {
        Object.assign(where, candidates[0]);
      } else {
        where[Op.or] = candidates;
      }
    }

    const ticket = await db.parkingTicket.findOne({
      where,
      include: [
        { model: db.parkingZone, as: 'zone' },
        { model: db.parkingSlot, as: 'slot' },
        { model: db.parkingVehicle, as: 'vehicle' },
        { model: db.parkingPricingRule, as: 'pricingRule' },
        { model: db.parkingMonthlyPass, as: 'monthlyPass' },
        { model: db.user, as: 'entryUser', attributes: ['id', 'cus_name'] }
      ]
    });

    if (!ticket) {
      throw new Error('Active parking ticket not found for the provided identifier.');
    }

    // Determine pricing rule to use
    let pricingRule = ticket.pricingRule;
    if (!pricingRule) {
      pricingRule = await findDefaultPricingRule(ticket.vehicleType);
    }

    // Calculate fee using feeService
    const feeBreakdown = feeService.calculateParkingFee({
      entryTime: ticket.entryTime,
      exitTime,
      pricingRule,
      monthlyPass: ticket.monthlyPass,
      isLostTicket: isLostTicket || ticket.isLostTicket
    });

    return {
      ticket,
      pricingRule,
      exitTime,
      feeBreakdown
    };
  },

  // =========================================================================
  // 3. VEHICLE EXIT & PAYMENT (CHECKOUT)
  // =========================================================================
  async processPaymentAndExit({ ticketId, paymentMethod = 'CASH', amount, referenceNo, isLostTicket = false, notes, cashierId }) {
    const ticket = await db.parkingTicket.findByPk(ticketId, {
      include: [
        { model: db.parkingSlot, as: 'slot' },
        { model: db.parkingPricingRule, as: 'pricingRule' },
        { model: db.parkingMonthlyPass, as: 'monthlyPass' }
      ]
    });

    if (!ticket) {
      throw new Error('Parking ticket not found.');
    }

    if (ticket.status !== 'active') {
      throw new Error(`Ticket is not active (Current status: ${ticket.status}).`);
    }

    const exitTime = new Date();

    // Recalculate fee at time of checkout
    let pricingRule = ticket.pricingRule;
    if (!pricingRule) {
      pricingRule = await findDefaultPricingRule(ticket.vehicleType);
    }

    const feeBreakdown = feeService.calculateParkingFee({
      entryTime: ticket.entryTime,
      exitTime,
      pricingRule,
      monthlyPass: ticket.monthlyPass,
      isLostTicket: isLostTicket || ticket.isLostTicket
    });

    const finalAmount = amount !== undefined ? Number(amount) : feeBreakdown.totalFee;

    const transaction = await db.sequelize.transaction();
    try {
      const timestamp = Date.now();
      const paymentNumber = `PAY-${timestamp}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Record payment
      const payment = await db.parkingPayment.create({
        paymentNumber,
        ticketId: ticket.id,
        amount: finalAmount,
        paymentMethod: feeBreakdown.isMonthlyPass ? 'FREE_PASS' : paymentMethod,
        paymentStatus: 'completed',
        referenceNo,
        paidAt: exitTime,
        cashierId: cashierId || 1,
        notes
      }, { transaction });

      // 2. Update ticket status to completed
      await ticket.update({
        exitTime,
        durationMinutes: feeBreakdown.durationMinutes,
        calculatedFee: feeBreakdown.totalFee,
        paidFee: finalAmount,
        penaltyFee: feeBreakdown.penaltyFee,
        status: 'completed',
        isLostTicket: isLostTicket || ticket.isLostTicket,
        exitUserId: cashierId || 1,
        notes: notes ? `${ticket.notes ? ticket.notes + ' | ' : ''}${notes}` : ticket.notes
      }, { transaction });

      // 3. Free the parking slot
      await slotService.releaseSlot(ticket.slotId, transaction);

      await transaction.commit();

      // Return receipt
      return {
        ticket: await db.parkingTicket.findByPk(ticket.id, {
          include: [
            { model: db.parkingZone, as: 'zone' },
            { model: db.parkingSlot, as: 'slot' },
            { model: db.parkingVehicle, as: 'vehicle' },
            { model: db.user, as: 'entryUser', attributes: ['id', 'cus_name'] },
            { model: db.user, as: 'exitUser', attributes: ['id', 'cus_name'] },
            { model: db.parkingPayment, as: 'payments' }
          ]
        }),
        payment,
        feeBreakdown
      };
    } catch (err) {
      await transaction.rollback();
      logger.error(`Error processing checkout payment: ${err.message}`);
      throw err;
    }
  },

  // =========================================================================
  // 4. TICKETS SEARCH & MANAGEMENT
  // =========================================================================
  async getTickets({ status, plateNumber, ticketNumber, startDate, endDate, zoneId, limit = 50, offset = 0 }) {
    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (plateNumber) {
      const norm = slotService.normalizePlateNumber(plateNumber);
      const noSpace = norm.replace(/\s+/g, '');
      if (norm !== noSpace) {
        where[Op.or] = [
          { plateNumber: { [Op.like]: `%${norm}%` } },
          { plateNumber: { [Op.like]: `%${noSpace}%` } }
        ];
      } else {
        where.plateNumber = { [Op.like]: `%${norm}%` };
      }
    }
    if (ticketNumber) {
      where.ticketNumber = { [Op.like]: `%${ticketNumber.trim()}%` };
    }
    if (zoneId) {
      where.zoneId = zoneId;
    }
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      where.entryTime = { [Op.between]: [s, e] };
    } else if (startDate) {
      where.entryTime = { [Op.gte]: new Date(startDate) };
    }

    const { rows, count } = await db.parkingTicket.findAndCountAll({
      where,
      include: [
        { model: db.parkingZone, as: 'zone', attributes: ['id', 'code', 'name'] },
        { model: db.parkingSlot, as: 'slot', attributes: ['id', 'slotNumber', 'slotType'] },
        { model: db.parkingVehicle, as: 'vehicle' },
        { model: db.parkingPayment, as: 'payments' },
        { model: db.user, as: 'entryUser', attributes: ['id', 'cus_name'] },
        { model: db.user, as: 'exitUser', attributes: ['id', 'cus_name'] }
      ],
      order: [['id', 'DESC']],
      limit: Number(limit),
      offset: Number(offset)
    });

    return { tickets: rows, total: count };
  },

  async getTicketById(id) {
    const ticket = await db.parkingTicket.findByPk(id, {
      include: [
        { model: db.parkingZone, as: 'zone' },
        { model: db.parkingSlot, as: 'slot' },
        { model: db.parkingVehicle, as: 'vehicle' },
        { model: db.parkingPricingRule, as: 'pricingRule' },
        { model: db.parkingMonthlyPass, as: 'monthlyPass' },
        { model: db.parkingPayment, as: 'payments' },
        { model: db.user, as: 'entryUser', attributes: ['id', 'cus_name', 'cus_tel'] },
        { model: db.user, as: 'exitUser', attributes: ['id', 'cus_name', 'cus_tel'] }
      ]
    });
    if (!ticket) throw new Error('Parking ticket not found.');
    return ticket;
  },

  async markTicketLost(id) {
    const ticket = await db.parkingTicket.findByPk(id);
    if (!ticket) throw new Error('Parking ticket not found.');
    await ticket.update({ isLostTicket: true });
    return ticket;
  },

  async cancelTicket(id, reason, userId) {
    const ticket = await db.parkingTicket.findByPk(id);
    if (!ticket) throw new Error('Parking ticket not found.');

    const transaction = await db.sequelize.transaction();
    try {
      await ticket.update({
        status: 'cancelled',
        notes: `Cancelled by user #${userId}: ${reason || 'N/A'}`
      }, { transaction });

      // Release slot if was active
      if (ticket.status === 'active') {
        await slotService.releaseSlot(ticket.slotId, transaction);
      }

      await transaction.commit();
      return ticket;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  // =========================================================================
  // 5. ZONES & SLOTS MANAGEMENT
  // =========================================================================
  async getZonesWithStats() {
    const zones = await db.parkingZone.findAll({
      where: { isActive: true },
      include: [
        {
          model: db.parkingSlot,
          as: 'slots',
          where: { isActive: true },
          required: false
        }
      ],
      order: [['id', 'ASC']]
    });

    return zones.map(z => {
      const slots = z.slots || [];
      const total = slots.length;
      const occupied = slots.filter(s => s.status === 'occupied').length;
      const available = slots.filter(s => s.status === 'available').length;
      const reserved = slots.filter(s => s.status === 'reserved').length;
      const outOfService = slots.filter(s => s.status === 'out_of_service').length;
      const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

      return {
        id: z.id,
        code: z.code,
        name: z.name,
        floor: z.floor,
        description: z.description,
        isActive: z.isActive,
        stats: {
          total,
          occupied,
          available,
          reserved,
          outOfService,
          occupancyRate
        },
        slots
      };
    });
  },

  async createZone(data, userId) {
    return await db.parkingZone.create({
      ...data,
      createdById: userId
    });
  },

  async updateZone(id, data) {
    const zone = await db.parkingZone.findByPk(id);
    if (!zone) throw new Error('Parking zone not found.');
    return await zone.update(data);
  },

  async deleteZone(id) {
    const zone = await db.parkingZone.findByPk(id);
    if (!zone) throw new Error('Parking zone not found.');
    return await zone.update({ isActive: false });
  },

  async getSlots({ zoneId, status, slotType }) {
    const where = { isActive: true };
    if (zoneId) where.zoneId = zoneId;
    if (status && status !== 'ALL') where.status = status;
    if (slotType && slotType !== 'ALL') where.slotType = slotType;

    return await db.parkingSlot.findAll({
      where,
      include: [
        { model: db.parkingZone, as: 'zone', attributes: ['id', 'code', 'name', 'floor'] },
        {
          model: db.parkingTicket,
          as: 'currentTicket',
          include: [{ model: db.parkingVehicle, as: 'vehicle' }]
        }
      ],
      order: [['slotNumber', 'ASC']]
    });
  },

  async createSlot(data) {
    return await db.parkingSlot.create(data);
  },

  async updateSlot(id, data) {
    const slot = await db.parkingSlot.findByPk(id);
    if (!slot) throw new Error('Parking slot not found.');
    return await slot.update(data);
  },

  async updateSlotStatus(id, status) {
    const slot = await db.parkingSlot.findByPk(id);
    if (!slot) throw new Error('Parking slot not found.');
    return await slot.update({ status });
  },

  // =========================================================================
  // 6. PRICING RULES
  // =========================================================================
  async getPricingRules() {
    return await db.parkingPricingRule.findAll({
      where: { isActive: true },
      order: [['vehicleType', 'ASC'], ['isDefault', 'DESC']]
    });
  },

  /**
   * Create / update a pricing rule while keeping exactly one active default per vehicle type:
   *  - saving with isDefault=true un-defaults the other rules of that type;
   *  - the first active rule of a type always becomes its default;
   *  - the only default of a type can't be un-set (make another rule default instead);
   *  - moving a rule to another type (or deactivating it) promotes a new default for the old type.
   */
  async savePricingRule(data = {}, userId) {
    const fields = {};
    for (const f of PRICING_RULE_FIELDS) {
      if (data[f] !== undefined) fields[f] = data[f];
    }
    if (fields.vehicleType !== undefined) fields.vehicleType = vehicleTypeService.normalizeCode(fields.vehicleType);
    if (fields.isDefault !== undefined) fields.isDefault = toBool(fields.isDefault);
    if (fields.isActive !== undefined) fields.isActive = toBool(fields.isActive);

    const transaction = await db.sequelize.transaction();
    try {
      let rule = null;
      let previousType = null;
      if (data.id) {
        rule = await db.parkingPricingRule.findByPk(data.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!rule) throw new Error('Pricing rule not found.');
        previousType = rule.vehicleType;
      }

      const vehicleType = fields.vehicleType || (rule && rule.vehicleType);
      if (!vehicleType) throw new Error('Vehicle type is required.');
      const willBeActive = fields.isActive !== undefined ? fields.isActive : (rule ? !!rule.isActive : true);
      const requestedDefault = fields.isDefault !== undefined ? fields.isDefault : (rule ? !!rule.isDefault : false);

      // Is there another active default for this type?
      const otherDefault = await db.parkingPricingRule.findOne({
        where: {
          vehicleType,
          isDefault: true,
          isActive: true,
          ...(rule ? { id: { [Op.ne]: rule.id } } : {})
        },
        transaction
      });

      // Inactive rules are never default; otherwise default if asked, or if the type has no other default.
      fields.isDefault = willBeActive && (requestedDefault || !otherDefault);

      if (fields.isDefault) {
        await db.parkingPricingRule.update(
          { isDefault: false },
          {
            where: {
              vehicleType,
              isDefault: true,
              ...(rule ? { id: { [Op.ne]: rule.id } } : {})
            },
            transaction
          }
        );
      }

      if (rule) {
        await rule.update(fields, { transaction });
      } else {
        rule = await db.parkingPricingRule.create({ ...fields, createdById: userId }, { transaction });
      }

      // The rule left its old type (or was deactivated): make sure the old type still has a default.
      if (previousType && (previousType !== vehicleType || !willBeActive)) {
        await ensureDefaultPricingRule(previousType, transaction);
      }

      await transaction.commit();
      return rule;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  // =========================================================================
  // 7. MONTHLY PASSES
  // =========================================================================
  async getMonthlyPasses({ search, status }) {
    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      const norm = slotService.normalizePlateNumber(search);
      where[Op.or] = [
        { plateNumber: { [Op.like]: `%${norm}%` } },
        { customerName: { [Op.like]: `%${search.trim()}%` } },
        { customerPhone: { [Op.like]: `%${search.trim()}%` } },
        { passNumber: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    return await db.parkingMonthlyPass.findAll({
      where,
      include: [
        { model: db.parkingSlot, as: 'slot', attributes: ['id', 'slotNumber'] },
        { model: db.user, as: 'createdBy', attributes: ['id', 'cus_name'] }
      ],
      order: [['id', 'DESC']]
    });
  },

  async createMonthlyPass(data, userId) {
    const normalizedPlate = slotService.normalizePlateNumber(data.plateNumber);
    const passNumber = data.passNumber || `MP-${Date.now().toString().slice(-6)}`;

    return await db.parkingMonthlyPass.create({
      ...data,
      plateNumber: normalizedPlate,
      passNumber,
      createdById: userId
    });
  },

  async renewMonthlyPass(id, { newEndDate, feeAmount }) {
    const pass = await db.parkingMonthlyPass.findByPk(id);
    if (!pass) throw new Error('Monthly pass not found.');

    return await pass.update({
      endDate: newEndDate,
      feeAmount: feeAmount || pass.feeAmount,
      status: 'active',
      paymentStatus: 'paid'
    });
  },

  // =========================================================================
  // 8. DASHBOARD STATS & REPORTS
  // =========================================================================
  async getDashboardStats() {
    const slots = await db.parkingSlot.findAll({ where: { isActive: true } });
    const totalSlots = slots.length;
    const occupiedSlots = slots.filter(s => s.status === 'occupied').length;
    const availableSlots = slots.filter(s => s.status === 'available').length;
    const reservedSlots = slots.filter(s => s.status === 'reserved').length;
    const outOfServiceSlots = slots.filter(s => s.status === 'out_of_service').length;
    const occupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

    // Today's range in Asia/Vientiane (UTC+7)
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Today's entries count
    const todayEntriesCount = await db.parkingTicket.count({
      where: {
        entryTime: { [Op.between]: [startOfToday, endOfToday] }
      }
    });

    // Today's exits count
    const todayExitsCount = await db.parkingTicket.count({
      where: {
        exitTime: { [Op.between]: [startOfToday, endOfToday] },
        status: 'completed'
      }
    });

    // Today's total revenue
    const todayPayments = await db.parkingPayment.findAll({
      where: {
        paidAt: { [Op.between]: [startOfToday, endOfToday] },
        paymentStatus: 'completed'
      },
      attributes: ['amount']
    });
    const todayRevenue = todayPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    // Month's total revenue
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
    const monthPayments = await db.parkingPayment.findAll({
      where: {
        paidAt: { [Op.between]: [startOfMonth, endOfToday] },
        paymentStatus: 'completed'
      },
      attributes: ['amount']
    });
    const monthRevenue = monthPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    // Breakdown by vehicle type (all active customer-defined types, plus any code still used by a slot)
    const vehicleTypes = await vehicleTypeService.list();
    const typeCodes = new Set(vehicleTypes.map(t => t.code));
    slots.forEach(s => s.slotType && typeCodes.add(s.slotType));

    const byType = {};
    typeCodes.forEach(code => {
      const typeSlots = slots.filter(s => s.slotType === code);
      byType[code] = {
        total: typeSlots.length,
        occupied: typeSlots.filter(s => s.status === 'occupied').length,
        available: typeSlots.filter(s => s.status === 'available').length
      };
    });

    return {
      totalSlots,
      occupiedSlots,
      availableSlots,
      reservedSlots,
      outOfServiceSlots,
      occupancyRate,
      todayEntriesCount,
      todayExitsCount,
      todayRevenue,
      monthRevenue,
      byType,
      vehicleTypes
    };
  },

  async getParkedVehicles() {
    return await db.parkingTicket.findAll({
      where: { status: 'active' },
      include: [
        { model: db.parkingZone, as: 'zone', attributes: ['id', 'name', 'code'] },
        { model: db.parkingSlot, as: 'slot', attributes: ['id', 'slotNumber', 'slotType'] },
        { model: db.parkingVehicle, as: 'vehicle' },
        { model: db.user, as: 'entryUser', attributes: ['id', 'cus_name'] }
      ],
      order: [['entryTime', 'ASC']]
    });
  },

  async getRevenueReport({ startDate, endDate, groupBy = 'day' }) {
    const s = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const e = endDate ? new Date(endDate) : new Date();
    e.setHours(23, 59, 59, 999);

    const activeTypeCodes = (await vehicleTypeService.list()).map(t => t.code);
    const defaultTypeCode = await vehicleTypeService.getDefaultCode();

    const payments = await db.parkingPayment.findAll({
      where: {
        paidAt: { [Op.between]: [s, e] },
        paymentStatus: 'completed'
      },
      include: [
        {
          model: db.parkingTicket,
          as: 'ticket',
          attributes: ['vehicleType', 'plateNumber', 'ticketNumber']
        }
      ],
      order: [['paidAt', 'ASC']]
    });

    const grouped = {};
    let grandTotal = 0;

    payments.forEach(p => {
      const dateKey = p.paidAt ? p.paidAt.toISOString().slice(0, 10) : 'Unknown';
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
          totalAmount: 0,
          ticketCount: 0,
          byMethod: { CASH: 0, QR: 0, TRANSFER: 0, CARD: 0 },
          byVehicle: Object.fromEntries(activeTypeCodes.map(c => [c, 0]))
        };
      }

      const amt = Number(p.amount) || 0;
      grouped[dateKey].totalAmount += amt;
      grouped[dateKey].ticketCount += 1;
      grandTotal += amt;

      const m = p.paymentMethod || 'CASH';
      grouped[dateKey].byMethod[m] = (grouped[dateKey].byMethod[m] || 0) + amt;

      const v = p.ticket?.vehicleType || defaultTypeCode;
      grouped[dateKey].byVehicle[v] = (grouped[dateKey].byVehicle[v] || 0) + amt;
    });

    return {
      startDate: s.toISOString().slice(0, 10),
      endDate: e.toISOString().slice(0, 10),
      grandTotal,
      records: Object.values(grouped)
    };
  },

  async getPeakHoursReport({ startDate, endDate }) {
    const s = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const e = endDate ? new Date(endDate) : new Date();
    e.setHours(23, 59, 59, 999);

    const tickets = await db.parkingTicket.findAll({
      where: {
        entryTime: { [Op.between]: [s, e] }
      },
      attributes: ['entryTime', 'exitTime', 'vehicleType']
    });

    // 24 hours distribution
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      entries: 0,
      exits: 0
    }));

    // Local offset Vientiane (UTC+7)
    const OFFSET_MS = 7 * 60 * 60 * 1000;

    tickets.forEach(t => {
      if (t.entryTime) {
        const localEntry = new Date(t.entryTime.getTime() + OFFSET_MS);
        const h = localEntry.getUTCHours();
        if (hourly[h]) hourly[h].entries++;
      }
      if (t.exitTime) {
        const localExit = new Date(t.exitTime.getTime() + OFFSET_MS);
        const h = localExit.getUTCHours();
        if (hourly[h]) hourly[h].exits++;
      }
    });

    return {
      startDate: s.toISOString().slice(0, 10),
      endDate: e.toISOString().slice(0, 10),
      hourly
    };
  }
};

module.exports = parkingService;
