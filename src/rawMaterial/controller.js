const db = require('../models');
const logger = require('../api/logger');
const { createRawMaterialService } = require('./service');
const { sendError } = require('./errors');

const service = createRawMaterialService(db);

const userIdOf = req => (req.user && req.user.id) || null;

const handle = (fn, status = 200) => async (req, res) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data });
  } catch (error) {
    sendError(res, error, logger);
  }
};

module.exports = {
  // GET /api/raw-materials?locationId=&lowOnly=1
  listStock: handle(req => service.listStock({
    locationId: req.query.locationId,
    lowOnly: req.query.lowOnly === '1' || req.query.lowOnly === 'true'
  })),

  // GET /api/raw-materials/:productId/ledger?locationId=&from=&to=&page=&limit=
  ledger: handle(req => service.ledgerFor(req.params.productId, req.query)),

  // POST /api/raw-materials/:productId/convert
  convert: handle(req => service.convertToQuantity(req.params.productId, { userId: userIdOf(req) })),

  // POST /api/raw-materials/:productId/receive  { locationId, quantity, unitId?, unitCost? | totalCost?, notes? }
  receive: handle(req => service.receive({ ...req.body, productId: req.params.productId, userId: userIdOf(req) }), 201),

  // POST /api/raw-materials/:productId/adjust   { locationId, quantity (signed), unitId?, reason }
  adjust: handle(req => service.adjust({ ...req.body, productId: req.params.productId, userId: userIdOf(req) }), 201),

  // POST /api/raw-materials/:productId/count    { locationId, countedQuantity, unitId?, notes? }
  count: handle(req => service.count({ ...req.body, productId: req.params.productId, userId: userIdOf(req) }), 201),

  // GET /api/recipes/product/:productId/bom
  getRecipe: handle(req => service.getRecipe(req.params.productId)),

  // PUT /api/recipes/product/:productId  { items: [{ ingredientId, quantity, unitId? }] }
  replaceRecipe: handle(req => service.replaceRecipe(req.params.productId, req.body && req.body.items))
};
