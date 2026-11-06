const db = require('../models');

const CODE_PATTERN = /^[a-z0-9_]{1,30}$/;
const EDITABLE_FIELDS = ['nameLa', 'nameEn', 'icon', 'color', 'sortOrder', 'isDefault'];
const FALLBACK_DEFAULT_CODE = 'car';

function normalizeCode(code) {
  if (code === undefined || code === null) return '';
  return String(code).trim().toLowerCase();
}

function pickEditable(data = {}) {
  const out = {};
  for (const f of EDITABLE_FIELDS) {
    if (data[f] !== undefined) out[f] = data[f];
  }
  if (out.sortOrder !== undefined) out.sortOrder = Number(out.sortOrder) || 0;
  if (out.isDefault !== undefined) out.isDefault = out.isDefault === true || out.isDefault === 'true' || out.isDefault === 1;
  return out;
}

const vehicleTypeService = {
  normalizeCode,

  async list({ includeInactive } = {}) {
    const where = {};
    const showAll = includeInactive === true || includeInactive === 'true' || includeInactive === '1' || includeInactive === 1;
    if (!showAll) where.isActive = true;
    const types = await db.parkingVehicleType.findAll({
      where,
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });

    // Flag types that have no active pricing rule (they'd be charged the fallback rate)
    const ruleRows = await db.parkingPricingRule.findAll({
      where: { isActive: true },
      attributes: ['vehicleType'],
      raw: true
    });
    const typesWithRule = new Set(ruleRows.map(r => r.vehicleType));
    types.forEach(t => t.setDataValue('hasPricingRule', typesWithRule.has(t.code)));
    return types;
  },

  async findByCode(code) {
    const norm = normalizeCode(code);
    if (!norm) return null;
    return db.parkingVehicleType.findOne({ where: { code: norm } });
  },

  /**
   * Throws if the code does not exist or is inactive. Returns the normalized code.
   */
  async assertActiveCode(code) {
    const norm = normalizeCode(code);
    if (!norm) throw new Error('Vehicle type is required (ກະລຸນາເລືອກປະເພດຍານພາຫະນະ).');
    const type = await db.parkingVehicleType.findOne({ where: { code: norm } });
    if (!type) throw new Error(`Unknown vehicle type "${norm}" (ບໍ່ພົບປະເພດຍານພາຫະນະ).`);
    if (!type.isActive) throw new Error(`Vehicle type "${norm}" is inactive (ປະເພດຍານພາຫະນະນີ້ຖືກປິດໃຊ້ງານ).`);
    return norm;
  },

  async getDefaultCode() {
    const def = await db.parkingVehicleType.findOne({
      where: { isDefault: true, isActive: true },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });
    if (def) return def.code;
    const first = await db.parkingVehicleType.findOne({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });
    return first ? first.code : FALLBACK_DEFAULT_CODE;
  },

  async create(data = {}, userId) {
    const code = normalizeCode(data.code);
    if (!CODE_PATTERN.test(code)) {
      throw new Error('Code must be 1-30 characters: lowercase letters, numbers or underscore (e.g. "van", "tuk_tuk").');
    }
    if (!data.nameLa || !String(data.nameLa).trim()) {
      throw new Error('Lao name is required (ກະລຸນາປ້ອນຊື່ພາສາລາວ).');
    }
    const existing = await db.parkingVehicleType.findOne({ where: { code } });
    if (existing) {
      throw new Error(`Vehicle type code "${code}" already exists.`);
    }

    const fields = pickEditable(data);
    const transaction = await db.sequelize.transaction();
    try {
      if (fields.isDefault) {
        await db.parkingVehicleType.update({ isDefault: false }, { where: {}, transaction });
      }
      const created = await db.parkingVehicleType.create({
        ...fields,
        code,
        isActive: true,
        createdById: userId || null
      }, { transaction });
      await transaction.commit();
      return created;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async update(id, data = {}) {
    const type = await db.parkingVehicleType.findByPk(id);
    if (!type) throw new Error('Vehicle type not found.');
    if (data.code !== undefined && normalizeCode(data.code) !== type.code) {
      throw new Error('Vehicle type code cannot be changed after creation.');
    }

    const fields = pickEditable(data);
    if (fields.nameLa !== undefined && !String(fields.nameLa).trim()) {
      throw new Error('Lao name is required (ກະລຸນາປ້ອນຊື່ພາສາລາວ).');
    }
    if (fields.isDefault === false && type.isDefault) {
      throw new Error('Set another vehicle type as default instead of un-setting the current default.');
    }
    if (fields.isDefault && !type.isActive) {
      throw new Error('An inactive vehicle type cannot be the default.');
    }

    const transaction = await db.sequelize.transaction();
    try {
      if (fields.isDefault) {
        await db.parkingVehicleType.update({ isDefault: false }, { where: {}, transaction });
      }
      await type.update(fields, { transaction });
      await transaction.commit();
      return type;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async setActive(id, isActive) {
    const type = await db.parkingVehicleType.findByPk(id);
    if (!type) throw new Error('Vehicle type not found.');
    const active = isActive === true || isActive === 'true' || isActive === 1;

    if (!active) {
      if (type.isDefault) {
        throw new Error('Cannot deactivate the default vehicle type. Set another type as default first.');
      }
      const activeTickets = await db.parkingTicket.count({ where: { vehicleType: type.code, status: 'active' } });
      if (activeTickets > 0) {
        throw new Error(`Cannot deactivate: ${activeTickets} vehicle(s) of this type are currently parked.`);
      }
      const activeSlots = await db.parkingSlot.count({ where: { slotType: type.code, isActive: true } });
      if (activeSlots > 0) {
        throw new Error(`Cannot deactivate: ${activeSlots} active slot(s) use this type. Change or deactivate them first.`);
      }
    }

    return type.update({ isActive: active });
  }
};

module.exports = vehicleTypeService;
