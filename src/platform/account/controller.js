const { Op } = require('sequelize');
const db = require('../../models');
const PlatformAccount = db.platformAccount || require('./model')(db.sequelize, db.Sequelize.DataTypes);
const Platform = db.platform || require('../platform/model')(db.sequelize, db.Sequelize.DataTypes);
const Company = db.company;
const logger = require('../../api/logger');
const { encryptToken, decryptToken } = require('../tokenHelper');

// Helper to resolve companyId safely from user token or request
const resolveCompanyId = (req) => {
  if (req.query && req.query.companyId) return parseInt(req.query.companyId, 10);
  if (req.body && req.body.companyId) return parseInt(req.body.companyId, 10);
  if (req.user && req.user.companyId) return parseInt(req.user.companyId, 10);
  if (req.user && req.user.company_id) return parseInt(req.user.company_id, 10);
  if (req.headers && req.headers['companyid']) return parseInt(req.headers['companyid'], 10);
  return null;
};

// Mask token for safe UI display
const maskToken = (token) => {
  if (!token) return null;
  const decrypted = decryptToken(token);
  if (!decrypted || decrypted.length <= 8) return '****';
  return `...${decrypted.slice(-6)}`;
};

// 1. Get all connected accounts for a company
exports.getAccountsByCompany = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'companyId is required' });
    }

    const { platformId, status } = req.query;
    const where = { companyId };

    if (platformId) {
      where.platformId = platformId;
    }
    if (status) {
      where.status = status;
    }

    const accounts = await PlatformAccount.findAll({
      where,
      include: [
        {
          model: Platform,
          as: 'platform',
          attributes: ['id', 'code', 'name', 'category', 'logoUrl', 'hasChat', 'hasOrderSync', 'hasInventorySync']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Safely format response without exposing full raw secret tokens
    const formatted = accounts.map(acc => {
      const plain = acc.toJSON();
      plain.tokenMasked = maskToken(plain.accessToken);
      plain.hasAccessToken = !!plain.accessToken;
      plain.hasRefreshToken = !!plain.refreshToken;
      delete plain.accessToken;
      delete plain.refreshToken;
      return plain;
    });

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (err) {
    logger.error(`[getAccountsByCompany] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching connected accounts', error: err.message });
  }
};

// 2. Get single account by ID
exports.getAccountById = async (req, res) => {
  try {
    const { id } = req.params;
    const account = await PlatformAccount.findByPk(id, {
      include: [{ model: Platform, as: 'platform' }]
    });

    if (!account) {
      return res.status(404).json({ success: false, message: `Account ID ${id} not found` });
    }

    const plain = account.toJSON();
    plain.tokenMasked = maskToken(plain.accessToken);
    plain.hasAccessToken = !!plain.accessToken;
    plain.hasRefreshToken = !!plain.refreshToken;
    delete plain.accessToken;
    delete plain.refreshToken;

    return res.status(200).json({ success: true, data: plain });
  } catch (err) {
    logger.error(`[getAccountById] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching account', error: err.message });
  }
};

// 3. Connect a new platform account/page (Enforces Page Quota Limit)
exports.connectAccount = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const {
      platformId,
      externalAccountId,
      accountName,
      avatarUrl,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      extraCredentials,
      isChatEnabled,
      isOrderSyncEnabled,
      isInventorySyncEnabled
    } = req.body;

    if (!companyId || !platformId || !externalAccountId || !accountName) {
      return res.status(400).json({
        success: false,
        message: 'companyId, platformId, externalAccountId, and accountName are required'
      });
    }

    // Verify Platform exists and is active
    const platform = await Platform.findByPk(platformId);
    if (!platform || !platform.isActive) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive platform selected' });
    }

    // Fetch Company & Verify Page Quota
    let maxAllowed = 2; // Default fallback
    let planName = 'FREE';
    if (Company) {
      const company = await Company.findByPk(companyId);
      if (company) {
        maxAllowed = company.max_social_pages !== undefined ? company.max_social_pages : 2;
        planName = company.social_plan_name || 'FREE';
      }
    }

    // Check if account already exists for this merchant
    const existing = await PlatformAccount.findOne({
      where: {
        companyId,
        platformId,
        externalAccountId: externalAccountId.toString()
      }
    });

    // Count currently active accounts
    const activeCount = await PlatformAccount.count({
      where: {
        companyId,
        status: 'ACTIVE',
        ...(existing ? { id: { [Op.ne]: existing.id } } : {})
      }
    });

    // Enforce Quota Rule
    if (activeCount >= maxAllowed) {
      return res.status(403).json({
        success: false,
        code: 'PAGE_LIMIT_REACHED',
        message: `Connection limit reached (${activeCount}/${maxAllowed} pages). Please upgrade your plan to connect more accounts.`,
        currentCount: activeCount,
        maxAllowed,
        planName
      });
    }

    // Encrypt sensitive access and refresh tokens
    const encryptedAccessToken = accessToken ? encryptToken(accessToken) : null;
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    let account;
    if (existing) {
      // Reconnecting / updating existing account
      existing.accountName = accountName;
      existing.avatarUrl = avatarUrl || existing.avatarUrl;
      if (encryptedAccessToken) existing.accessToken = encryptedAccessToken;
      if (encryptedRefreshToken) existing.refreshToken = encryptedRefreshToken;
      if (tokenExpiresAt) existing.tokenExpiresAt = tokenExpiresAt;
      if (extraCredentials) existing.extraCredentials = extraCredentials;
      existing.isChatEnabled = isChatEnabled !== undefined ? isChatEnabled : existing.isChatEnabled;
      existing.isOrderSyncEnabled = isOrderSyncEnabled !== undefined ? isOrderSyncEnabled : existing.isOrderSyncEnabled;
      existing.isInventorySyncEnabled = isInventorySyncEnabled !== undefined ? isInventorySyncEnabled : existing.isInventorySyncEnabled;
      existing.status = 'ACTIVE';
      await existing.save();
      account = existing;
    } else {
      // Create new connected account
      account = await PlatformAccount.create({
        companyId,
        platformId,
        externalAccountId: externalAccountId.toString(),
        accountName,
        avatarUrl,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokenExpiresAt || null,
        extraCredentials: extraCredentials || null,
        isChatEnabled: isChatEnabled !== undefined ? isChatEnabled : true,
        isOrderSyncEnabled: isOrderSyncEnabled !== undefined ? isOrderSyncEnabled : false,
        isInventorySyncEnabled: isInventorySyncEnabled !== undefined ? isInventorySyncEnabled : false,
        status: 'ACTIVE'
      });
    }

    const plain = account.toJSON();
    plain.tokenMasked = maskToken(plain.accessToken);
    delete plain.accessToken;
    delete plain.refreshToken;

    return res.status(201).json({
      success: true,
      message: `Account '${accountName}' successfully connected to ${platform.name}!`,
      data: plain,
      quota: {
        activeCount: activeCount + 1,
        maxAllowed,
        remainingSlots: maxAllowed - (activeCount + 1)
      }
    });
  } catch (err) {
    logger.error(`[connectAccount] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error connecting account', error: err.message });
  }
};

// 4. Update connected account settings
exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = resolveCompanyId(req);

    const where = { id };
    if (companyId) where.companyId = companyId;

    const account = await PlatformAccount.findOne({ where });
    if (!account) {
      return res.status(404).json({ success: false, message: `Account ID ${id} not found` });
    }

    const {
      accountName,
      avatarUrl,
      isChatEnabled,
      isOrderSyncEnabled,
      isInventorySyncEnabled,
      extraCredentials,
      accessToken,
      refreshToken,
      tokenExpiresAt
    } = req.body;

    if (accountName !== undefined) account.accountName = accountName;
    if (avatarUrl !== undefined) account.avatarUrl = avatarUrl;
    if (isChatEnabled !== undefined) account.isChatEnabled = isChatEnabled;
    if (isOrderSyncEnabled !== undefined) account.isOrderSyncEnabled = isOrderSyncEnabled;
    if (isInventorySyncEnabled !== undefined) account.isInventorySyncEnabled = isInventorySyncEnabled;
    if (extraCredentials !== undefined) account.extraCredentials = extraCredentials;
    if (accessToken) account.accessToken = encryptToken(accessToken);
    if (refreshToken) account.refreshToken = encryptToken(refreshToken);
    if (tokenExpiresAt) account.tokenExpiresAt = tokenExpiresAt;

    await account.save();

    const plain = account.toJSON();
    plain.tokenMasked = maskToken(plain.accessToken);
    delete plain.accessToken;
    delete plain.refreshToken;

    return res.status(200).json({
      success: true,
      message: 'Account settings updated successfully',
      data: plain
    });
  } catch (err) {
    logger.error(`[updateAccount] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating account', error: err.message });
  }
};

// 5. Disconnect account
exports.disconnectAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = resolveCompanyId(req);

    const where = { id };
    if (companyId) where.companyId = companyId;

    const account = await PlatformAccount.findOne({ where });
    if (!account) {
      return res.status(404).json({ success: false, message: `Account ID ${id} not found` });
    }

    account.status = 'DISCONNECTED';
    await account.save();

    return res.status(200).json({
      success: true,
      message: `Account '${account.accountName}' has been disconnected.`,
      data: { id: account.id, status: account.status }
    });
  } catch (err) {
    logger.error(`[disconnectAccount] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error disconnecting account', error: err.message });
  }
};

// 6. Delete account permanently
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = resolveCompanyId(req);

    const where = { id };
    if (companyId) where.companyId = companyId;

    const account = await PlatformAccount.findOne({ where });
    if (!account) {
      return res.status(404).json({ success: false, message: `Account ID ${id} not found` });
    }

    const accountName = account.accountName;
    await account.destroy();

    return res.status(200).json({
      success: true,
      message: `Account '${accountName}' deleted successfully.`
    });
  } catch (err) {
    logger.error(`[deleteAccount] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error deleting account', error: err.message });
  }
};

// 7. Check company page connection quota
exports.checkCompanyQuota = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'companyId is required' });
    }

    let maxAllowed = 2;
    let planName = 'FREE';
    let expiresAt = null;

    if (Company) {
      const company = await Company.findByPk(companyId);
      if (company) {
        maxAllowed = company.max_social_pages !== undefined ? company.max_social_pages : 2;
        planName = company.social_plan_name || 'FREE';
        expiresAt = company.social_plan_expires_at;
      }
    }

    const activeCount = await PlatformAccount.count({
      where: { companyId, status: 'ACTIVE' }
    });

    const isLimitReached = activeCount >= maxAllowed;
    const remainingSlots = Math.max(0, maxAllowed - activeCount);

    return res.status(200).json({
      success: true,
      data: {
        companyId,
        planName,
        maxAllowed,
        activeCount,
        remainingSlots,
        isLimitReached,
        expiresAt
      }
    });
  } catch (err) {
    logger.error(`[checkCompanyQuota] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error checking quota', error: err.message });
  }
};

// 8. Admin endpoint: Update company social quota
exports.updateCompanyQuota = async (req, res) => {
  try {
    const { companyId, maxSocialPages, socialPlanName, expiresAt } = req.body;

    if (!companyId || maxSocialPages === undefined) {
      return res.status(400).json({ success: false, message: 'companyId and maxSocialPages are required' });
    }

    if (!Company) {
      return res.status(500).json({ success: false, message: 'Company model not initialized' });
    }

    const company = await Company.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: `Company ID ${companyId} not found` });
    }

    company.max_social_pages = parseInt(maxSocialPages, 10);
    if (socialPlanName) company.social_plan_name = socialPlanName;
    if (expiresAt) company.social_plan_expires_at = expiresAt;

    await company.save();

    return res.status(200).json({
      success: true,
      message: `Quota updated: Company '${company.name}' can now connect up to ${company.max_social_pages} pages.`,
      data: {
        companyId: company.id,
        maxSocialPages: company.max_social_pages,
        socialPlanName: company.social_plan_name,
        expiresAt: company.social_plan_expires_at
      }
    });
  } catch (err) {
    logger.error(`[updateCompanyQuota] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating company quota', error: err.message });
  }
};

// 9. Internal helper to retrieve decrypted token for Webhook / Send API handlers
exports.getDecryptedToken = async (platformId, externalAccountId) => {
  try {
    const account = await PlatformAccount.findOne({
      where: {
        platformId,
        externalAccountId: externalAccountId.toString(),
        status: 'ACTIVE'
      }
    });

    if (!account || !account.accessToken) return null;
    return {
      companyId: account.companyId,
      accountId: account.id,
      accountName: account.accountName,
      accessToken: decryptToken(account.accessToken),
      refreshToken: decryptToken(account.refreshToken),
      extraCredentials: account.extraCredentials
    };
  } catch (err) {
    logger.error(`[getDecryptedToken] Error: ${err.message}`);
    return null;
  }
};
