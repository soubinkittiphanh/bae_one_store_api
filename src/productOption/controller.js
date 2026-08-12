const ProductOption = require('../models').ProductOption;
const logger = require('../api/logger');

const ProductOptionController = {
  // Create a new option item under a group
  createOption: async (req, res) => {
    try {
      const { groupId, optionName, priceAdjustment, costAdjustment, ingredientProductId } = req.body;

      if (!groupId || !optionName) {
        return res.status(400).json({ success: false, message: "groupId and optionName are required" });
      }

      const option = await ProductOption.create({
        groupId,
        optionName,
        priceAdjustment: priceAdjustment !== undefined ? parseFloat(priceAdjustment) : 0,
        costAdjustment: costAdjustment !== undefined ? parseFloat(costAdjustment) : 0,
        ingredientProductId: ingredientProductId || null
      });

      res.status(201).json({ success: true, data: option });
    } catch (error) {
      logger.error("Error creating product option choice:", error);
      res.status(500).json({ success: false, message: error.message || "Error creating option choice" });
    }
  },

  // Update option choice details
  updateOption: async (req, res) => {
    try {
      const { id } = req.params;
      const { optionName, priceAdjustment, costAdjustment, ingredientProductId } = req.body;

      const option = await ProductOption.findByPk(id);
      if (!option) {
        return res.status(404).json({ success: false, message: "Option choice not found" });
      }

      await option.update({
        optionName: optionName !== undefined ? optionName : option.optionName,
        priceAdjustment: priceAdjustment !== undefined ? parseFloat(priceAdjustment) : option.priceAdjustment,
        costAdjustment: costAdjustment !== undefined ? parseFloat(costAdjustment) : option.costAdjustment,
        ingredientProductId: ingredientProductId !== undefined ? (ingredientProductId || null) : option.ingredientProductId
      });

      res.status(200).json({ success: true, data: option });
    } catch (error) {
      logger.error("Error updating product option choice:", error);
      res.status(500).json({ success: false, message: error.message || "Error updating option choice" });
    }
  },

  // Delete option choice
  deleteOption: async (req, res) => {
    try {
      const { id } = req.params;

      const option = await ProductOption.findByPk(id);
      if (!option) {
        return res.status(404).json({ success: false, message: "Option choice not found" });
      }

      await option.destroy();

      res.status(200).json({ success: true, message: "Option choice deleted successfully" });
    } catch (error) {
      logger.error("Error deleting product option choice:", error);
      res.status(500).json({ success: false, message: error.message || "Error deleting option choice" });
    }
  }
};

module.exports = ProductOptionController;
