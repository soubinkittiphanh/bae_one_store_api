// Promotions: CRUD for the admin page, the live list for the POS, and a calculate endpoint.
// Discount rules live in ./engine.js (same code as dc_web/utils/promotionEngine.js, used by the POS).
//
// Fixes over the previous version:
//  - `sequelize` was never imported, so /active and /calculate threw on every request.
//  - Methods were passed to express unbound, so `this.…` was undefined in /calculate and /apply.
//  - fixed_amount and combo_deal had no evaluator (crash), buy X get Y gave the free item too early.
//  - The list returned only 10 promotions (the POS used it, so older promotions never applied).
//  - current_uses was never incremented, so usage limits never worked: usage now comes from the bills.
//  - Create/update accepted any field and returned 500 for a duplicate code.
const { Op, fn, col } = require('sequelize');
const logger = require('../../api/logger');
const { promotion: Promotion, ticketLine: TicketLine, ticket: Ticket } = require('../../models');
const engine = require('./engine');

const TYPES = ['percentage', 'fixed_amount', 'buy_x_get_y', 'combo_deal'];
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

// Bills that used each promotion (cancelled / voided bills do not count) and the discount given
const usageFor = async (promotionIds) => {
  const usage = new Map();
  if (!promotionIds.length) return usage;
  const rows = await TicketLine.findAll({
    attributes: [
      'promotionId',
      [fn('COUNT', fn('DISTINCT', col('ticketLine.ticketId'))), 'uses'],
      [fn('SUM', col('ticketLine.discount_amount')), 'discount'],
    ],
    where: { promotionId: { [Op.in]: promotionIds }, is_promotion_item: true },
    include: [{ model: Ticket, as: 'ticket', attributes: [], where: { status: { [Op.notIn]: ['cancel', 'void'] } } }],
    group: ['ticketLine.promotionId'],
    raw: true,
  });
  rows.forEach((r) => usage.set(Number(r.promotionId), { uses: Number(r.uses) || 0, discount: Number(r.discount) || 0 }));
  return usage;
};

const withUsage = async (promotions) => {
  const usage = await usageFor(promotions.map((p) => p.id));
  return promotions.map((p) => {
    const plain = p.get ? p.get({ plain: true }) : p;
    const u = usage.get(Number(plain.id)) || { uses: 0, discount: 0 };
    return { ...plain, conditions: engine.parseConditions(plain), current_uses: u.uses, total_discount: u.discount };
  });
};

const numOrNull = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const idList = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== '' && x !== undefined) : []);

// Keep only the conditions each type uses, as numbers / id lists
const cleanConditions = (type, c = {}) => {
  const scope = {
    applicable_categories: idList(c.applicable_categories),
    applicable_products: idList(c.applicable_products),
    excluded_categories: idList(c.excluded_categories),
    excluded_products: idList(c.excluded_products),
  };
  switch (type) {
    case 'percentage':
      return { ...scope, discount_percentage: numOrNull(c.discount_percentage), max_discount_amount: numOrNull(c.max_discount_amount), minimum_order: numOrNull(c.minimum_order) };
    case 'fixed_amount':
      return { ...scope, discount_amount: numOrNull(c.discount_amount), minimum_order: numOrNull(c.minimum_order) };
    case 'buy_x_get_y':
      return { ...scope, buy_quantity: numOrNull(c.buy_quantity), get_quantity: numOrNull(c.get_quantity), max_free_items: numOrNull(c.max_free_items) };
    case 'combo_deal':
      return {
        combo_price: numOrNull(c.combo_price),
        required_items: (Array.isArray(c.required_items) ? c.required_items : [])
          .map((r) => ({ product_id: r && r.product_id, quantity: parseInt(r && r.quantity, 10) || 1 }))
          .filter((r) => r.product_id !== null && r.product_id !== undefined && r.product_id !== ''),
      };
    default:
      return {};
  }
};

// Validate and normalise a create/update body; `existing` for partial updates
const readPromotion = (body, existing = null) => {
  const m = { ...(existing ? existing.get({ plain: true }) : {}), ...body };
  if (existing && body.conditions === undefined) m.conditions = engine.parseConditions(existing);
  const d = {};

  d.name = String(m.name || '').trim();
  if (!d.name) return { error: 'ກະລຸນາໃສ່ຊື່ໂປຣໂມຊັ່ນ' };
  d.code = String(m.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,50}$/.test(d.code)) return { error: 'ລະຫັດໃຊ້ໄດ້ສະເພາະ A-Z, 0-9, _ ແລະ - (ບໍ່ເກີນ 50 ຕົວ)' };
  if (!TYPES.includes(m.type)) return { error: 'ປະເພດໂປຣໂມຊັ່ນບໍ່ຖືກຕ້ອງ' };
  d.type = m.type;
  d.description = m.description ? String(m.description) : null;

  d.start_date = new Date(m.start_date);
  d.end_date = new Date(m.end_date);
  if (isNaN(d.start_date) || isNaN(d.end_date)) return { error: 'ກະລຸນາໃສ່ວັນເລີ່ມ ແລະ ວັນສິ້ນສຸດ' };
  if (d.end_date <= d.start_date) return { error: 'ວັນສິ້ນສຸດຕ້ອງຫຼັງວັນເລີ່ມ' };

  d.is_active = m.is_active === undefined ? true : Boolean(m.is_active);
  d.priority = parseInt(m.priority, 10);
  if (!Number.isInteger(d.priority) || d.priority < 1 || d.priority > 100) return { error: 'ລຳດັບຄວາມສຳຄັນຕ້ອງຢູ່ລະຫວ່າງ 1 ຫາ 100' };
  d.max_uses = numOrNull(m.max_uses);
  if (d.max_uses !== null && (!Number.isInteger(d.max_uses) || d.max_uses < 1)) return { error: 'ຈຳນວນໃຊ້ສູງສຸດຕ້ອງເປັນຈຳນວນເຕັມ 1 ຂຶ້ນໄປ' };

  const c = cleanConditions(d.type, engine.parseConditions(m));
  if (d.type === 'percentage' && !(c.discount_percentage > 0 && c.discount_percentage <= 100)) return { error: 'ເປີເຊັນສ່ວນຫຼຸດຕ້ອງຢູ່ລະຫວ່າງ 1 ຫາ 100' };
  if (d.type === 'fixed_amount' && !(c.discount_amount > 0)) return { error: 'ກະລຸນາໃສ່ຈຳນວນເງິນສ່ວນຫຼຸດ' };
  if (d.type === 'buy_x_get_y' && !(Number.isInteger(c.buy_quantity) && c.buy_quantity >= 1 && Number.isInteger(c.get_quantity) && c.get_quantity >= 1)) {
    return { error: 'ຈຳນວນຊື້ ແລະ ຈຳນວນແຖມຕ້ອງເປັນຈຳນວນເຕັມ 1 ຂຶ້ນໄປ' };
  }
  if (d.type === 'combo_deal') {
    if (c.required_items.length < 2 && !(c.required_items[0] && c.required_items[0].quantity >= 2)) return { error: 'ຄອມໂບຕ້ອງມີຢ່າງໜ້ອຍ 2 ລາຍການ' };
    if (!(c.combo_price >= 0)) return { error: 'ກະລຸນາໃສ່ລາຄາຄອມໂບ' };
  }
  d.conditions = c;
  return { data: d };
};

const isDuplicateCode = (err) => err && (err.name === 'SequelizeUniqueConstraintError' || /Duplicate entry/i.test(err.message || ''));

// Accept the old field names (product_id / unit_price / product_category) as well as the engine's
const toEngineLines = (lines) => (Array.isArray(lines) ? lines : []).map((l, i) => ({
  key: l.key ?? l.id ?? i,
  productId: l.productId ?? l.product_id,
  categoryId: l.categoryId ?? l.product_category ?? l.categ_id ?? null,
  unitPrice: Number(l.unitPrice ?? l.unit_price ?? l.price ?? 0),
  quantity: Number(l.quantity ?? 0),
}));

const liveCandidates = async () => {
  const now = new Date();
  const rows = await Promotion.findAll({
    where: { is_active: true, start_date: { [Op.lte]: now }, end_date: { [Op.gte]: now } },
    order: [['priority', 'DESC'], ['id', 'ASC']],
  });
  return (await withUsage(rows)).filter((p) => engine.isPromotionLive(p, now));
};

const promotionController = {
  // GET /active — promotions the POS can apply right now (usage limit included)
  getActivePromotions: async (req, res) => {
    try {
      res.json({ success: true, data: await liveCandidates() });
    } catch (error) {
      logger.error(`Promotions: active list failed: ${error.message}`);
      fail(res, 500, 'Failed to fetch promotions', { error: error.message });
    }
  },

  // POST /calculate { ticketLines } — what the engine would give for these lines
  calculatePromotions: async (req, res) => {
    try {
      const { ticketLines } = req.body || {};
      if (!Array.isArray(ticketLines)) return fail(res, 400, 'Invalid ticket lines provided');
      const result = engine.calculatePromotions(toEngineLines(ticketLines), await liveCandidates());
      res.json({
        success: true,
        data: result.applied.map((a) => ({
          promotion_id: a.promotion.id,
          promotion_name: a.promotion.name,
          discount_amount: a.amount,
          description: a.description,
          free_items: a.freeItems,
          allocations: a.allocations,
        })),
        total: result.total,
      });
    } catch (error) {
      logger.error(`Promotions: calculate failed: ${error.message}`);
      fail(res, 500, 'Failed to calculate promotions', { error: error.message });
    }
  },

  // GET / — every promotion with its real usage (bills) and the discount given
  getAllPromotions: async (req, res) => {
    try {
      const where = {};
      if (req.query.status) where.is_active = req.query.status === 'active';
      const rows = await Promotion.findAll({ where, order: [['created_at', 'DESC']] });
      const data = await withUsage(rows);
      res.json({ success: true, data, pagination: { total: data.length, page: 1, pages: 1, limit: data.length } });
    } catch (error) {
      logger.error(`Promotions: list failed: ${error.message}`);
      fail(res, 500, 'Failed to fetch promotions', { error: error.message });
    }
  },

  createPromotion: async (req, res) => {
    const { data, error } = readPromotion(req.body || {});
    if (error) return fail(res, 400, error);
    try {
      const row = await Promotion.create({ ...data, current_uses: 0, created_by: req.user?.id || null });
      res.status(201).json({ success: true, data: (await withUsage([row]))[0], message: 'Promotion created successfully' });
    } catch (err) {
      if (isDuplicateCode(err)) return fail(res, 409, `ລະຫັດ ${data.code} ມີແລ້ວ, ກະລຸນາໃຊ້ລະຫັດອື່ນ`);
      logger.error(`Promotions: create failed: ${err.message}`);
      fail(res, 500, 'Failed to create promotion', { error: err.message });
    }
  },

  updatePromotion: async (req, res) => {
    try {
      const row = await Promotion.findByPk(req.params.id);
      if (!row) return fail(res, 404, 'Promotion not found');
      const { data, error } = readPromotion(req.body || {}, row);
      if (error) return fail(res, 400, error);
      try {
        await row.update(data);
      } catch (err) {
        if (isDuplicateCode(err)) return fail(res, 409, `ລະຫັດ ${data.code} ມີແລ້ວ, ກະລຸນາໃຊ້ລະຫັດອື່ນ`);
        throw err;
      }
      res.json({ success: true, data: (await withUsage([row]))[0], message: 'Promotion updated successfully' });
    } catch (err) {
      logger.error(`Promotions: update failed: ${err.message}`);
      fail(res, 500, 'Failed to update promotion', { error: err.message });
    }
  },

  // A promotion already on bills is kept for the sales history: deactivate it instead
  deletePromotion: async (req, res) => {
    try {
      const row = await Promotion.findByPk(req.params.id);
      if (!row) return fail(res, 404, 'Promotion not found');
      const used = await TicketLine.count({ where: { promotionId: row.id } });
      if (used > 0) {
        return fail(res, 409, `ໂປຣໂມຊັ່ນນີ້ຖືກໃຊ້ໃນບິນແລ້ວ ${used} ລາຍການ, ລຶບບໍ່ໄດ້. ກະລຸນາປິດການໃຊ້ງານແທນ`, { used });
      }
      await row.destroy();
      res.json({ success: true, message: 'Promotion deleted successfully' });
    } catch (error) {
      logger.error(`Promotions: delete failed: ${error.message}`);
      fail(res, 500, 'Failed to delete promotion', { error: error.message });
    }
  },
};

module.exports = promotionController;
module.exports._internal = { readPromotion, cleanConditions, toEngineLines };
