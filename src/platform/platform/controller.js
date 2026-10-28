const { Op } = require('sequelize');
const db = require('../../models');
const Platform = db.platform || require('./model')(db.sequelize, db.Sequelize.DataTypes);
const logger = require('../../api/logger');

// Get all platforms with optional search and filters
exports.getAllPlatforms = async (req, res) => {
  try {
    const { category, isActive, search } = req.query;
    const where = {};

    if (category) {
      where.category = category;
    }

    if (isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true' || isActive === '1' || isActive === true;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } }
      ];
    }

    const platforms = await Platform.findAll({
      where,
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });

    return res.status(200).json({
      success: true,
      data: platforms
    });
  } catch (err) {
    logger.error(`[getAllPlatforms] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching platforms', error: err.message });
  }
};

// Get active platforms for merchant selection
exports.getActivePlatforms = async (req, res) => {
  try {
    const platforms = await Platform.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });

    return res.status(200).json({
      success: true,
      data: platforms
    });
  } catch (err) {
    logger.error(`[getActivePlatforms] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching active platforms', error: err.message });
  }
};

// Get single platform by ID
exports.getPlatformById = async (req, res) => {
  try {
    const { id } = req.params;
    const platform = await Platform.findByPk(id);

    if (!platform) {
      return res.status(404).json({ success: false, message: `Platform ID ${id} not found` });
    }

    return res.status(200).json({ success: true, data: platform });
  } catch (err) {
    logger.error(`[getPlatformById] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching platform', error: err.message });
  }
};

// Get single platform by code (e.g. 'facebook', 'tiktok')
exports.getPlatformByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const platform = await Platform.findOne({ where: { code: code.toLowerCase() } });

    if (!platform) {
      return res.status(404).json({ success: false, message: `Platform code ${code} not found` });
    }

    return res.status(200).json({ success: true, data: platform });
  } catch (err) {
    logger.error(`[getPlatformByCode] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching platform', error: err.message });
  }
};

// Create a new platform
exports.createPlatform = async (req, res) => {
  try {
    const {
      code,
      name,
      category,
      logoUrl,
      hasChat,
      hasOrderSync,
      hasInventorySync,
      hasProductSync,
      authType,
      apiBaseUrl,
      oauthAuthUrl,
      oauthTokenUrl,
      defaultMonthlyPrice,
      isActive,
      sortOrder
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Platform code and name are required' });
    }

    const existing = await Platform.findOne({ where: { code: code.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ success: false, message: `Platform with code '${code}' already exists` });
    }

    const newPlatform = await Platform.create({
      code: code.toLowerCase().trim(),
      name: name.trim(),
      category: category || 'SOCIAL_CHAT',
      logoUrl,
      hasChat: hasChat !== undefined ? hasChat : true,
      hasOrderSync: hasOrderSync || false,
      hasInventorySync: hasInventorySync || false,
      hasProductSync: hasProductSync || false,
      authType: authType || 'OAUTH2',
      apiBaseUrl,
      oauthAuthUrl,
      oauthTokenUrl,
      defaultMonthlyPrice: defaultMonthlyPrice || 0,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0
    });

    return res.status(201).json({
      success: true,
      message: 'Platform created successfully',
      data: newPlatform
    });
  } catch (err) {
    logger.error(`[createPlatform] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error creating platform', error: err.message });
  }
};

// Update an existing platform
exports.updatePlatform = async (req, res) => {
  try {
    const { id } = req.params;
    const platform = await Platform.findByPk(id);

    if (!platform) {
      return res.status(404).json({ success: false, message: `Platform ID ${id} not found` });
    }

    const updateFields = [
      'name', 'category', 'logoUrl', 'hasChat', 'hasOrderSync',
      'hasInventorySync', 'hasProductSync', 'authType', 'apiBaseUrl',
      'oauthAuthUrl', 'oauthTokenUrl', 'defaultMonthlyPrice', 'isActive', 'sortOrder'
    ];

    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        platform[field] = req.body[field];
      }
    });

    await platform.save();

    return res.status(200).json({
      success: true,
      message: 'Platform updated successfully',
      data: platform
    });
  } catch (err) {
    logger.error(`[updatePlatform] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating platform', error: err.message });
  }
};

// Toggle platform active status
exports.togglePlatformStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const platform = await Platform.findByPk(id);

    if (!platform) {
      return res.status(404).json({ success: false, message: `Platform ID ${id} not found` });
    }

    platform.isActive = !platform.isActive;
    await platform.save();

    return res.status(200).json({
      success: true,
      message: `Platform status toggled to ${platform.isActive ? 'active' : 'inactive'}`,
      data: platform
    });
  } catch (err) {
    logger.error(`[togglePlatformStatus] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error toggling platform status', error: err.message });
  }
};

// Delete platform
exports.deletePlatform = async (req, res) => {
  try {
    const { id } = req.params;
    const platform = await Platform.findByPk(id);

    if (!platform) {
      return res.status(404).json({ success: false, message: `Platform ID ${id} not found` });
    }

    // Check if any accounts are using this platform
    if (db.platformAccount) {
      const accountCount = await db.platformAccount.count({ where: { platformId: id } });
      if (accountCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete platform. It is currently linked to ${accountCount} connected merchant accounts. Deactivate it instead.`
        });
      }
    }

    await platform.destroy();
    return res.status(200).json({ success: true, message: 'Platform deleted successfully' });
  } catch (err) {
    logger.error(`[deletePlatform] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error deleting platform', error: err.message });
  }
};
