
const express = require("express")
// === routes/serviceRoutes.js ===
const router = express.Router();
const serviceController = require("./controller");
const { validateToken } = require('../api').jwtApi
const { body } = require('express-validator');
router.use(validateToken);



router.post("/services", serviceController.createService);
router.get("/services", serviceController.getAllServices);
router.get("/services/:id", serviceController.getServiceById);
router.put("/services/:id", serviceController.updateService);
router.delete("/services/:id", serviceController.deleteService);

module.exports = router