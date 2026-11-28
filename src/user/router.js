

const {validateToken} = require("../api/jwtApi")
const { requirePosGrant } = require("../security/middleware")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
router.use(validateToken)

// USER EDIT guards changes to other people's accounts. Users may still change their own name, phone, e-mail
// and password, but not their own group, sales points or active flag (that would let them raise their rights).
const isMe = (id, me) => id !== undefined && id !== null && (Number(id) === Number(me.id));
const selfUpdateKeepsRights = async (req, me) => {
  if (!isMe(req.params.id, me)) return false;
  const b = req.body || {};
  if (b.groupId !== undefined && b.groupId !== null && Number(b.groupId) !== Number(me.groupId)) return false;
  if (b.cus_active === false || b.isActive === false) return false;
  if (b.terminals !== undefined) {
    const current = await require('../models').user.findByPk(me.id, { include: [{ model: require('../models').terminal, through: { attributes: [] } }] });
    const have = new Set(((current && current.terminals) || []).map(t => Number(t.id)));
    const want = (Array.isArray(b.terminals) ? b.terminals : []).map(t => Number(t && typeof t === 'object' ? t.id : t));
    if (want.length !== have.size || want.some(id => !have.has(id))) return false;
  }
  return true;
};

router
.post("/create", requirePosGrant("USER", "EDIT"), controller.createCustomer)
.post("/change-password", controller.changePassword)
.post("/reset-password", requirePosGrant("USER", "EDIT", { self: (req, me) => isMe(req.body && req.body.userId, me) }), controller.resetPassword)
.post("/linkterminal/:id", requirePosGrant("USER", "EDIT"), controller.linkTerminal)
.post("/unlinkterminal/:id", requirePosGrant("USER", "EDIT"), controller.unlinkTerminal)
.put("/update/:id", requirePosGrant("USER", "EDIT", { self: selfUpdateKeepsRights }), controller.updateCustomer)
.put("/deactivate/:id", requirePosGrant("USER", "EDIT"), controller.deactivateCustomer)
.post("/deactivate-account", controller.deactivateOwnAccount)
.put("/deactivate-account", controller.deactivateOwnAccount)
.delete("/delete-account", controller.deleteOwnAccount)
.delete("/find/:id", requirePosGrant("USER", "EDIT"), controller.deleteCustomer)
.get("/find", controller.getCustomers)
.get("/find/:id", controller.getCustomerById)

module.exports = router