// Restaurant table reservations.
// Rules:
//  - Active bookings (booked / confirmed / seated) on the same table may not overlap in time.
//  - "Hold" puts the table in status 'reserved' (shown on the floor plan) while the guests are on their way.
//  - "Seat" turns the table 'occupied' (same state as opening a table on the floor plan without an order),
//    so the waiter continues on the floor plan as usual.
//  - Cancel / no-show give a held table back ('available').
const { Op } = require('sequelize');
const logger = require('../../api/logger');
const db = require('../../models');

const TableReservation = db.tableReservation;
const Table = db.table;
const sequelize = db.sequelize;

const ACTIVE = ['booked', 'confirmed', 'seated'];
const MAX_DURATION_MINUTES = 720;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const safeRollback = async (t) => {
    if (t && !t.finished) {
        try { await t.rollback(); } catch (e) { /* already rolled back */ }
    }
};

const endOf = (r) => new Date(new Date(r.reservedAt).getTime() + (Number(r.durationMinutes) || 90) * 60000);

// Active bookings on `tableId` overlapping [start, end), other than `excludeId`
const findConflicts = async (tableId, start, end, excludeId, transaction) => {
    if (!tableId) return [];
    const candidates = await TableReservation.findAll({
        where: {
            tableId,
            status: { [Op.in]: ACTIVE },
            // a booking that starts before `end` and not more than the max duration before `start`
            reservedAt: {
                [Op.lt]: end,
                [Op.gt]: new Date(start.getTime() - MAX_DURATION_MINUTES * 60000),
            },
            ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
        },
        transaction,
    });
    return candidates.filter((r) => endOf(r) > start);
};

const conflictMessage = (conflicts) => {
    const c = conflicts[0];
    // Shown to staff in Laos; the server itself may run in UTC
    const hhmm = new Date(c.reservedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Vientiane' });
    return `ໂຕະນີ້ມີການຈອງແລ້ວ: ${c.customerName} ເວລາ ${hhmm}`;
};

// Pull and validate the editable fields; returns { data } or { error }
const readBody = (body, existing = null) => {
    const merged = { ...(existing ? existing.get({ plain: true }) : {}), ...body };
    const data = {};

    data.customerName = String(merged.customerName || '').trim();
    if (!data.customerName) return { error: 'ກະລຸນາໃສ່ຊື່ລູກຄ້າ' };
    if (data.customerName.length > 100) return { error: 'ຊື່ລູກຄ້າຍາວເກີນໄປ' };

    data.phone = merged.phone ? String(merged.phone).trim().slice(0, 30) : null;

    data.partySize = parseInt(merged.partySize, 10);
    if (!Number.isInteger(data.partySize) || data.partySize < 1 || data.partySize > 200) {
        return { error: 'ຈຳນວນຄົນຕ້ອງຢູ່ລະຫວ່າງ 1 ຫາ 200' };
    }

    const at = new Date(merged.reservedAt);
    if (!merged.reservedAt || isNaN(at.getTime())) return { error: 'ກະລຸນາເລືອກວັນ ແລະ ເວລາຈອງ' };
    data.reservedAt = at;

    data.durationMinutes = parseInt(merged.durationMinutes || 90, 10);
    if (!Number.isInteger(data.durationMinutes) || data.durationMinutes < 15 || data.durationMinutes > MAX_DURATION_MINUTES) {
        return { error: 'ໄລຍະເວລາຕ້ອງຢູ່ລະຫວ່າງ 15 ນາທີ ຫາ 12 ຊົ່ວໂມງ' };
    }

    data.tableId = merged.tableId ? parseInt(merged.tableId, 10) : null;
    if (merged.tableId && !Number.isInteger(data.tableId)) return { error: 'ໂຕະບໍ່ຖືກຕ້ອງ' };

    const deposit = Number(merged.depositAmount || 0);
    if (!isFinite(deposit) || deposit < 0) return { error: 'ເງິນມັດຈຳບໍ່ຖືກຕ້ອງ' };
    data.depositAmount = deposit;

    data.notes = merged.notes ? String(merged.notes).trim() : null;
    return { data };
};

// Give a held table back when the booking no longer needs it
const releaseHeldTable = async (reservation, transaction) => {
    if (!reservation.tableHeld || !reservation.tableId) return;
    const table = await Table.findByPk(reservation.tableId, { transaction });
    if (table && table.status === 'reserved') {
        await table.update({ status: 'available', customerName: null, timeOccupied: null, currentOrderId: null }, { transaction });
    }
    reservation.tableHeld = false;
};

const withTable = { model: Table, as: 'table', attributes: ['id', 'number', 'name', 'capacity', 'status'] };

const tableReservationController = {
    // GET /?from=ISO&to=ISO&status=a,b&tableId=
    list: async (req, res) => {
        try {
            const { from, to, status, tableId } = req.query;
            const where = {};
            if (from || to) {
                where.reservedAt = {};
                if (from) where.reservedAt[Op.gte] = new Date(from);
                if (to) where.reservedAt[Op.lt] = new Date(to);
            }
            if (status) where.status = { [Op.in]: String(status).split(',') };
            if (tableId) where.tableId = tableId;

            const rows = await TableReservation.findAll({
                where,
                include: [withTable],
                order: [['reservedAt', 'ASC']],
                limit: 1000,
            });
            res.json({ success: true, data: rows });
        } catch (error) {
            logger.error(`Table reservations: list failed: ${error.message}`);
            fail(res, 500, 'ດຶງຂໍ້ມູນການຈອງບໍ່ສຳເລັດ', { error: error.message });
        }
    },

    getById: async (req, res) => {
        try {
            const row = await TableReservation.findByPk(req.params.id, { include: [withTable] });
            if (!row) return fail(res, 404, 'ບໍ່ພົບການຈອງ');
            res.json({ success: true, data: row });
        } catch (error) {
            fail(res, 500, 'ດຶງຂໍ້ມູນການຈອງບໍ່ສຳເລັດ', { error: error.message });
        }
    },

    create: async (req, res) => {
        const { data, error } = readBody(req.body);
        if (error) return fail(res, 400, error);
        if (data.reservedAt.getTime() < Date.now() - 60 * 60000) {
            return fail(res, 400, 'ເວລາຈອງຜ່ານໄປແລ້ວ');
        }

        const transaction = await sequelize.transaction();
        try {
            if (data.tableId) {
                const table = await Table.findByPk(data.tableId, { transaction });
                if (!table) { await safeRollback(transaction); return fail(res, 404, 'ບໍ່ພົບໂຕະ'); }
                const conflicts = await findConflicts(data.tableId, data.reservedAt, endOf(data), null, transaction);
                if (conflicts.length) { await safeRollback(transaction); return fail(res, 409, conflictMessage(conflicts)); }
            }
            const row = await TableReservation.create({
                ...data,
                status: 'booked',
                createUserId: req.user?.id || null,
            }, { transaction });
            await transaction.commit();
            const full = await TableReservation.findByPk(row.id, { include: [withTable] });
            res.status(201).json({ success: true, data: full });
        } catch (err) {
            await safeRollback(transaction);
            logger.error(`Table reservations: create failed: ${err.message}`);
            fail(res, 500, 'ບັນທຶກການຈອງບໍ່ສຳເລັດ', { error: err.message });
        }
    },

    update: async (req, res) => {
        const transaction = await sequelize.transaction();
        try {
            const row = await TableReservation.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!row) { await safeRollback(transaction); return fail(res, 404, 'ບໍ່ພົບການຈອງ'); }
            if (!['booked', 'confirmed'].includes(row.status)) {
                await safeRollback(transaction);
                return fail(res, 400, 'ແກ້ໄຂໄດ້ສະເພາະການຈອງທີ່ຍັງບໍ່ທັນມາ');
            }

            const { data, error } = readBody(req.body, row);
            if (error) { await safeRollback(transaction); return fail(res, 400, error); }

            if (data.tableId) {
                const table = await Table.findByPk(data.tableId, { transaction });
                if (!table) { await safeRollback(transaction); return fail(res, 404, 'ບໍ່ພົບໂຕະ'); }
                const conflicts = await findConflicts(data.tableId, data.reservedAt, endOf(data), row.id, transaction);
                if (conflicts.length) { await safeRollback(transaction); return fail(res, 409, conflictMessage(conflicts)); }
            }

            // Moved to another table (or no table): the old hold no longer applies
            if (row.tableHeld && row.tableId !== data.tableId) await releaseHeldTable(row, transaction);

            await row.update({ ...data, tableHeld: row.tableHeld, updateUserId: req.user?.id || null }, { transaction });
            await transaction.commit();
            const full = await TableReservation.findByPk(row.id, { include: [withTable] });
            res.json({ success: true, data: full });
        } catch (err) {
            await safeRollback(transaction);
            logger.error(`Table reservations: update failed: ${err.message}`);
            fail(res, 500, 'ບັນທຶກການຈອງບໍ່ສຳເລັດ', { error: err.message });
        }
    },

    // PATCH /:id/status { status: confirmed | seated | cancelled | no_show | booked, cancelReason? }
    changeStatus: async (req, res) => {
        const { status, cancelReason } = req.body || {};
        const allowedFrom = {
            confirmed: ['booked'],
            booked: ['confirmed', 'cancelled', 'no_show'], // undo a mistaken confirm / cancel / no-show
            seated: ['booked', 'confirmed'],
            cancelled: ['booked', 'confirmed'],
            no_show: ['booked', 'confirmed'],
        };
        if (!allowedFrom[status]) return fail(res, 400, 'ສະຖານະບໍ່ຖືກຕ້ອງ');

        const transaction = await sequelize.transaction();
        try {
            const row = await TableReservation.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!row) { await safeRollback(transaction); return fail(res, 404, 'ບໍ່ພົບການຈອງ'); }
            if (!allowedFrom[status].includes(row.status)) {
                await safeRollback(transaction);
                return fail(res, 400, `ປ່ຽນຈາກ ${row.status} ເປັນ ${status} ບໍ່ໄດ້`);
            }

            const update = { status, updateUserId: req.user?.id || null };

            if (status === 'booked' && ['cancelled', 'no_show'].includes(row.status) && row.tableId) {
                // Re-opening a booking: its table may have been booked by someone else since
                const conflicts = await findConflicts(row.tableId, new Date(row.reservedAt), endOf(row), row.id, transaction);
                if (conflicts.length) { await safeRollback(transaction); return fail(res, 409, conflictMessage(conflicts)); }
                update.cancelReason = null;
            }

            if (status === 'seated') {
                const tableId = req.body.tableId ? parseInt(req.body.tableId, 10) : row.tableId;
                if (!tableId) { await safeRollback(transaction); return fail(res, 400, 'ກະລຸນາເລືອກໂຕະກ່ອນໃຫ້ລູກຄ້ານັ່ງ'); }
                const table = await Table.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
                if (!table) { await safeRollback(transaction); return fail(res, 404, 'ບໍ່ພົບໂຕະ'); }

                const heldByThis = table.status === 'reserved' && row.tableHeld && row.tableId === tableId;
                if (table.status !== 'available' && !heldByThis) {
                    await safeRollback(transaction);
                    const label = { occupied: 'ມີລູກຄ້າ', cleaning: 'ລໍຖ້າອະນາໄມ', reserved: 'ຖືກຈອງໂດຍຄົນອື່ນ' }[table.status] || table.status;
                    return fail(res, 409, `ໂຕະ ${table.number} ຕອນນີ້${label}, ກະລຸນາເລືອກໂຕະອື່ນ`);
                }
                if (row.tableHeld && row.tableId !== tableId) await releaseHeldTable(row, transaction);

                // Same state as "open table only" on the floor plan: occupied, no order yet
                await table.update({
                    status: 'occupied',
                    customerName: row.customerName,
                    timeOccupied: new Date(),
                    currentOrderId: null,
                }, { transaction });
                update.tableId = tableId;
                update.tableHeld = false;
                update.seatedAt = new Date();
            }

            if (status === 'cancelled' || status === 'no_show') {
                await releaseHeldTable(row, transaction);
                update.tableHeld = false;
                if (status === 'cancelled') update.cancelReason = cancelReason ? String(cancelReason).slice(0, 255) : null;
            }

            await row.update(update, { transaction });
            await transaction.commit();
            const full = await TableReservation.findByPk(row.id, { include: [withTable] });
            res.json({ success: true, data: full });
        } catch (err) {
            await safeRollback(transaction);
            logger.error(`Table reservations: status change failed: ${err.message}`);
            fail(res, 500, 'ປ່ຽນສະຖານະບໍ່ສຳເລັດ', { error: err.message });
        }
    },

    // PATCH /:id/hold  { hold: true|false } — show the table as reserved on the floor plan
    hold: async (req, res) => {
        const hold = req.body?.hold !== false;
        const transaction = await sequelize.transaction();
        try {
            const row = await TableReservation.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!row) { await safeRollback(transaction); return fail(res, 404, 'ບໍ່ພົບການຈອງ'); }

            if (!hold) {
                await releaseHeldTable(row, transaction);
                await row.update({ tableHeld: false }, { transaction });
            } else {
                if (!['booked', 'confirmed'].includes(row.status)) {
                    await safeRollback(transaction);
                    return fail(res, 400, 'ກັນໂຕະໄດ້ສະເພາະການຈອງທີ່ຍັງບໍ່ທັນມາ');
                }
                if (!row.tableId) { await safeRollback(transaction); return fail(res, 400, 'ກະລຸນາເລືອກໂຕະໃຫ້ການຈອງນີ້ກ່ອນ'); }
                const table = await Table.findByPk(row.tableId, { transaction, lock: transaction.LOCK.UPDATE });
                if (!table) { await safeRollback(transaction); return fail(res, 404, 'ບໍ່ພົບໂຕະ'); }
                if (table.status !== 'available' && !(table.status === 'reserved' && row.tableHeld)) {
                    await safeRollback(transaction);
                    return fail(res, 409, `ໂຕະ ${table.number} ຍັງບໍ່ວ່າງ (${table.status})`);
                }
                await table.update({ status: 'reserved', customerName: row.customerName, timeOccupied: null, currentOrderId: null }, { transaction });
                await row.update({ tableHeld: true }, { transaction });
            }

            await transaction.commit();
            const full = await TableReservation.findByPk(row.id, { include: [withTable] });
            res.json({ success: true, data: full });
        } catch (err) {
            await safeRollback(transaction);
            logger.error(`Table reservations: hold failed: ${err.message}`);
            fail(res, 500, 'ກັນໂຕະບໍ່ສຳເລັດ', { error: err.message });
        }
    },
};

module.exports = tableReservationController;
module.exports._internal = { findConflicts, readBody, endOf };
