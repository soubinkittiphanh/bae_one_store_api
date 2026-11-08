const db = require('../models');

/**
 * Normalizes vehicle license plate number
 * (Uppercase, trims whitespace, standardizes single space between characters/numbers)
 */
function normalizePlateNumber(plate) {
  if (!plate || typeof plate !== 'string') return '';
  return plate
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Transactionally finds and locks an available parking slot
 */
async function findAndLockAvailableSlot({ zoneId, slotId, vehicleType = 'car', transaction }) {
  if (slotId) {
    // Specific slot requested
    const slot = await db.parkingSlot.findOne({
      where: {
        id: slotId,
        status: 'available',
        isActive: true
      },
      lock: transaction ? transaction.LOCK.UPDATE : false,
      transaction
    });

    if (!slot) {
      throw new Error(`Selected slot #${slotId} is no longer available or does not exist.`);
    }

    return slot;
  }

  // Auto-assignment query criteria
  const where = {
    status: 'available',
    isActive: true
  };

  // If vehicleType specified, try to match slotType (or car slots for cars)
  if (vehicleType) {
    where.slotType = vehicleType;
  }

  if (zoneId) {
    where.zoneId = zoneId;
  }

  let slot = await db.parkingSlot.findOne({
    where,
    order: [['id', 'ASC']],
    lock: transaction ? transaction.LOCK.UPDATE : false,
    transaction
  });

  // If no slot found in specific zone or slotType, fallback to any available compatible slot
  if (!slot && zoneId) {
    delete where.zoneId;
    slot = await db.parkingSlot.findOne({
      where,
      order: [['id', 'ASC']],
      lock: transaction ? transaction.LOCK.UPDATE : false,
      transaction
    });
  }

  if (!slot) {
    // Distinguish "no slots configured for this type" from "all slots of this type are taken"
    const configured = vehicleType
      ? await db.parkingSlot.count({ where: { slotType: vehicleType, isActive: true }, transaction })
      : 1;
    if (!configured) {
      throw new Error(`No parking slots are configured for vehicle type "${vehicleType}". Please create slots with this type or change existing slots to it (ບໍ່ມີບ່ອນຈອດສຳລັບປະເພດຍານພາຫະນະ "${vehicleType}").`);
    }
    throw new Error(`Parking lot is full for vehicle type "${vehicleType}" (ສະຖານທີ່ຈອດລົດເຕັມແລ້ວ).`);
  }

  return slot;
}

/**
 * Marks slot as occupied and links to ticket
 */
async function occupySlot(slotId, ticketId, transaction) {
  await db.parkingSlot.update(
    {
      status: 'occupied',
      currentTicketId: ticketId
    },
    {
      where: { id: slotId },
      transaction
    }
  );
}

/**
 * Frees a slot after vehicle exit / checkout
 */
async function releaseSlot(slotId, transaction) {
  if (!slotId) return;
  await db.parkingSlot.update(
    {
      status: 'available',
      currentTicketId: null
    },
    {
      where: { id: slotId },
      transaction
    }
  );
}

module.exports = {
  normalizePlateNumber,
  findAndLockAvailableSlot,
  occupySlot,
  releaseSlot
};
