const ProductOptionGroup = require('../models').ProductOptionGroup;
const ProductOption = require('../models').ProductOption;
const logger = require('../api/logger');

const ProductOptionGroupController = {
  // Create a new option group for a product
  createGroup: async (req, res) => {
    try {
      const { productId, groupName, isRequired, minSelections, maxSelections } = req.body;

      if (!productId || !groupName) {
        return res.status(400).json({ success: false, message: "productId and groupName are required" });
      }

      const group = await ProductOptionGroup.create({
        productId,
        groupName,
        isRequired: !!isRequired,
        minSelections: minSelections !== undefined ? parseInt(minSelections) : 0,
        maxSelections: maxSelections !== undefined ? parseInt(maxSelections) : 1
      });

      res.status(201).json({ success: true, data: group });
    } catch (error) {
      logger.error("Error creating product option group:", error);
      res.status(500).json({ success: false, message: error.message || "Error creating option group" });
    }
  },

  // Get all option groups for a product, including options
  getGroupsByProduct: async (req, res) => {
    try {
      const { productId } = req.params;

      if (!productId) {
        return res.status(400).json({ success: false, message: "productId is required" });
      }

      const groups = await ProductOptionGroup.findAll({
        where: { productId },
        include: [{
          model: ProductOption,
          as: 'options'
        }],
        order: [['createdAt', 'ASC']]
      });

      res.status(200).json({ success: true, data: groups });
    } catch (error) {
      logger.error("Error fetching product option groups:", error);
      res.status(500).json({ success: false, message: error.message || "Error fetching option groups" });
    }
  },

  // Update option group details
  updateGroup: async (req, res) => {
    try {
      const { id } = req.params;
      const { groupName, isRequired, minSelections, maxSelections } = req.body;

      const group = await ProductOptionGroup.findByPk(id);
      if (!group) {
        return res.status(404).json({ success: false, message: "Option group not found" });
      }

      await group.update({
        groupName: groupName !== undefined ? groupName : group.groupName,
        isRequired: isRequired !== undefined ? !!isRequired : group.isRequired,
        minSelections: minSelections !== undefined ? parseInt(minSelections) : group.minSelections,
        maxSelections: maxSelections !== undefined ? parseInt(maxSelections) : group.maxSelections
      });

      res.status(200).json({ success: true, data: group });
    } catch (error) {
      logger.error("Error updating product option group:", error);
      res.status(500).json({ success: false, message: error.message || "Error updating option group" });
    }
  },

  // Delete option group
  deleteGroup: async (req, res) => {
    try {
      const { id } = req.params;

      const group = await ProductOptionGroup.findByPk(id);
      if (!group) {
        return res.status(404).json({ success: false, message: "Option group not found" });
      }

      await group.destroy();

      res.status(200).json({ success: true, message: "Option group deleted successfully" });
    } catch (error) {
      logger.error("Error deleting product option group:", error);
      res.status(500).json({ success: false, message: error.message || "Error deleting option group" });
    }
  }
};

module.exports = ProductOptionGroupController;
