const parkingService = require('./service');
const logger = require('../api/logger');

const parkingController = {
  // 1. ENTRY
  async entry(req, res) {
    try {
      const result = await parkingService.processEntry({
        ...req.body,
        userId: req.user?.id || 1
      });
      return res.status(201).json({
        success: true,
        message: 'Vehicle entry registered successfully (ບັນທຶກລົດເຂົ້າສຳເລັດ)',
        data: result
      });
    } catch (err) {
      logger.error(`Error in parking entry controller: ${err.message}`);
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // 2. CALCULATE FEE
  async calculateFee(req, res) {
    try {
      const result = await parkingService.calculateExitFee(req.body);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      logger.error(`Error in calculateFee controller: ${err.message}`);
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // 3. EXIT & PAY
  async pay(req, res) {
    try {
      const result = await parkingService.processPaymentAndExit({
        ...req.body,
        cashierId: req.user?.id || 1
      });
      return res.status(200).json({
        success: true,
        message: 'Payment completed and slot released (ຊຳລະເງິນສຳເລັດ ແລະ ປົດລັອກບ່ອນຈອດ)',
        data: result
      });
    } catch (err) {
      logger.error(`Error in parking payment controller: ${err.message}`);
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // 4. TICKETS
  async getTickets(req, res) {
    try {
      const result = await parkingService.getTickets(req.query);
      return res.status(200).json({
        success: true,
        data: result.tickets,
        total: result.total
      });
    } catch (err) {
      logger.error(`Error fetching tickets: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getTicketById(req, res) {
    try {
      const ticket = await parkingService.getTicketById(req.params.id);
      return res.status(200).json({ success: true, data: ticket });
    } catch (err) {
      logger.error(`Error fetching ticket #${req.params.id}: ${err.message}`);
      return res.status(404).json({ success: false, message: err.message });
    }
  },

  async markTicketLost(req, res) {
    try {
      const ticket = await parkingService.markTicketLost(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Ticket marked as lost (ໝາຍປີ້ເສຍສຳເລັດ)',
        data: ticket
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async cancelTicket(req, res) {
    try {
      const { reason } = req.body;
      const ticket = await parkingService.cancelTicket(req.params.id, reason, req.user?.id);
      return res.status(200).json({
        success: true,
        message: 'Ticket cancelled successfully (ຍົກເລີກປີ້ສຳເລັດ)',
        data: ticket
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // 5. ZONES & SLOTS
  async getZones(req, res) {
    try {
      const zones = await parkingService.getZonesWithStats();
      return res.status(200).json({ success: true, data: zones });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async createZone(req, res) {
    try {
      const zone = await parkingService.createZone(req.body, req.user?.id);
      return res.status(201).json({ success: true, data: zone });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async updateZone(req, res) {
    try {
      const zone = await parkingService.updateZone(req.params.id, req.body);
      return res.status(200).json({ success: true, data: zone });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async deleteZone(req, res) {
    try {
      await parkingService.deleteZone(req.params.id);
      return res.status(200).json({ success: true, message: 'Zone deactivated' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async getSlots(req, res) {
    try {
      const slots = await parkingService.getSlots(req.query);
      return res.status(200).json({ success: true, data: slots });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async createSlot(req, res) {
    try {
      const slot = await parkingService.createSlot(req.body);
      return res.status(201).json({ success: true, data: slot });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async updateSlot(req, res) {
    try {
      const slot = await parkingService.updateSlot(req.params.id, req.body);
      return res.status(200).json({ success: true, data: slot });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async updateSlotStatus(req, res) {
    try {
      const { status } = req.body;
      const slot = await parkingService.updateSlotStatus(req.params.id, status);
      return res.status(200).json({ success: true, data: slot });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // 6. PRICING RULES
  async getPricingRules(req, res) {
    try {
      const rules = await parkingService.getPricingRules();
      return res.status(200).json({ success: true, data: rules });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async savePricingRule(req, res) {
    try {
      const rule = await parkingService.savePricingRule(req.body, req.user?.id);
      return res.status(200).json({ success: true, data: rule });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // 7. MONTHLY PASSES
  async getMonthlyPasses(req, res) {
    try {
      const passes = await parkingService.getMonthlyPasses(req.query);
      return res.status(200).json({ success: true, data: passes });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async createMonthlyPass(req, res) {
    try {
      const pass = await parkingService.createMonthlyPass(req.body, req.user?.id);
      return res.status(201).json({ success: true, data: pass });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async renewMonthlyPass(req, res) {
    try {
      const pass = await parkingService.renewMonthlyPass(req.params.id, req.body);
      return res.status(200).json({ success: true, data: pass });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // 8. DASHBOARD & REPORTS
  async getDashboardStats(req, res) {
    try {
      const stats = await parkingService.getDashboardStats();
      return res.status(200).json({ success: true, data: stats });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getParkedVehicles(req, res) {
    try {
      const vehicles = await parkingService.getParkedVehicles();
      return res.status(200).json({ success: true, data: vehicles });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getRevenueReport(req, res) {
    try {
      const report = await parkingService.getRevenueReport(req.query);
      return res.status(200).json({ success: true, data: report });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getPeakHoursReport(req, res) {
    try {
      const report = await parkingService.getPeakHoursReport(req.query);
      return res.status(200).json({ success: true, data: report });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = parkingController;
