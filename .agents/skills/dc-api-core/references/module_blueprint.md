# Module Blueprint & Boilerplate Guide

This guide provides end-to-end boilerplate code and conventions for building a new production module in `dc_api`.

---

## 1. Directory Structure

For a new domain feature named `feature_name`, create the folder `src/feature_name/`:

```text
src/feature_name/
├── model.js           # (or models/ for multi-table features)
├── service.js         # Business logic & Sequelize queries
├── controller.js      # Express HTTP request handlers
├── validation.js      # Parameter sanitization & validation
└── router.js          # Express route definitions & middleware
```

---

## 2. Component Boilerplates

### A. Sequelize Model (`src/feature_name/model.js`)

```javascript
module.exports = (sequelize, DataTypes) => {
  const FeatureModel = sequelize.define(
    'feature_name',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'archived'),
        defaultValue: 'active'
      },
      remark: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'feature_names',
      timestamps: true,
      indexes: [
        { fields: ['companyId'] },
        { fields: ['code'] },
        { fields: ['status'] }
      ]
    }
  );

  return FeatureModel;
};
```

---

### B. Business Service (`src/feature_name/service.js`)

```javascript
const db = require('../models');
const { sequelize } = require('../models/database');
const logger = require('../api/logger');

const featureService = {
  async getAll({ companyId, status, search, page = 1, limit = 20 }) {
    const where = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;
    if (search) {
      where.name = { [db.Sequelize.Op.like]: `%${search}%` };
    }

    const offset = (page - 1) * limit;
    const { rows, count } = await db.featureModel.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['createdAt', 'DESC']]
    });

    return {
      items: rows,
      total: count,
      page: parseInt(page, 10),
      totalPages: Math.ceil(count / limit)
    };
  },

  async getById(id, companyId) {
    const item = await db.featureModel.findOne({
      where: { id, ...(companyId ? { companyId } : {}) }
    });
    if (!item) {
      throw new Error(`Record with ID ${id} not found`);
    }
    return item;
  },

  async create(data, userId) {
    return await sequelize.transaction(async (t) => {
      const newItem = await db.featureModel.create(
        {
          ...data,
          createdBy: userId
        },
        { transaction: t }
      );

      logger.info(`[Feature] Created record ID ${newItem.id} by user ${userId}`);
      return newItem;
    });
  },

  async update(id, data, companyId) {
    const item = await this.getById(id, companyId);
    return await item.update(data);
  },

  async delete(id, companyId) {
    const item = await this.getById(id, companyId);
    return await item.destroy();
  }
};

module.exports = featureService;
```

---

### C. Controller (`src/feature_name/controller.js`)

```javascript
const featureService = require('./service');
const logger = require('../api/logger');

const featureController = {
  async getAll(req, res) {
    try {
      const companyId = req.query.companyId || req.user?.companyId;
      const result = await featureService.getAll({ ...req.query, companyId });
      return res.status(200).json({ success: true, data: result.items, total: result.total });
    } catch (err) {
      logger.error(`[Feature] Error in getAll: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getById(req, res) {
    try {
      const companyId = req.user?.companyId;
      const item = await featureService.getById(req.params.id, companyId);
      return res.status(200).json({ success: true, data: item });
    } catch (err) {
      logger.error(`[Feature] Error in getById: ${err.message}`);
      return res.status(404).json({ success: false, message: err.message });
    }
  },

  async create(req, res) {
    try {
      const userId = req.user?.id || 1;
      const companyId = req.body.companyId || req.user?.companyId;
      const item = await featureService.create({ ...req.body, companyId }, userId);
      return res.status(201).json({
        success: true,
        message: 'Record created successfully (ສ້າງຂໍ້ມູນສຳເລັດ)',
        data: item
      });
    } catch (err) {
      logger.error(`[Feature] Error in create: ${err.message}`);
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async update(req, res) {
    try {
      const companyId = req.user?.companyId;
      const updated = await featureService.update(req.params.id, req.body, companyId);
      return res.status(200).json({
        success: true,
        message: 'Record updated successfully (ແກ້ໄຂຂໍ້ມູນສຳເລັດ)',
        data: updated
      });
    } catch (err) {
      logger.error(`[Feature] Error in update: ${err.message}`);
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async delete(req, res) {
    try {
      const companyId = req.user?.companyId;
      await featureService.delete(req.params.id, companyId);
      return res.status(200).json({
        success: true,
        message: 'Record deleted successfully (ລຶບຂໍ້ມູນສຳເລັດ)'
      });
    } catch (err) {
      logger.error(`[Feature] Error in delete: ${err.message}`);
      return res.status(400).json({ success: false, message: err.message });
    }
  }
};

module.exports = featureController;
```

---

### D. Validation (`src/feature_name/validation.js`)

```javascript
const validateCreate = (req, res, next) => {
  const { name, code } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Name is required (ກະລຸນາປ້ອນຊື່)' });
  }
  if (!code || code.trim() === '') {
    return res.status(400).json({ success: false, message: 'Code is required (ກະລຸນາປ້ອນລະຫັດ)' });
  }
  next();
};

module.exports = {
  validateCreate
};
```

---

### E. Router (`src/feature_name/router.js`)

```javascript
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../api/jwtApi');
const { validateCreate } = require('./validation');

// Require authentication for all endpoints
router.use(validateToken);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', validateCreate, controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
```

---

## 3. Registration in Central Registry

### 1. In `src/models/index.js`
```javascript
// Inside initializeModels()
featureModel: require("../feature_name/model")(sequelize, DataTypes),
```

### 2. In `src/router/index.js`
```javascript
const featureName = require("../feature_name/router");
// ...
module.exports = {
  // ...
  featureName
};
```

### 3. In `src/app.js`
```javascript
app.use('/api/feature-names', myRouter.featureName);
```

---

## 4. Menu Seeding Template (`seed_feature_name_menus.js`)

```javascript
const db = require('./src/models');

async function seedFeatureMenus() {
  try {
    console.log("Seeding menus for Feature Name...");

    // 1. Header (code <= 10 characters)
    const [header] = await db.menuHeader.findOrCreate({
      where: { code: 'FEATURE' },
      defaults: {
        code: 'FEATURE',
        icon: 'mdi-view-grid-plus-outline',
        name: 'Feature Name',
        llname: 'ຊື່ລະບົບພາສາລາວ',
        remark: 'Feature module navigation',
        expand: true,
        isActive: true
      }
    });

    // 2. Lines
    const lines = [
      {
        name: 'Feature Dashboard',
        llname: 'ໜ້າຫຼັກລະບົບ',
        icon: 'mdi-monitor-dashboard',
        path: '/admin/feature-names',
        target_systems: 'ALL',
        isActive: true
      }
    ];

    for (const item of lines) {
      await db.menuLine.findOrCreate({
        where: { path: item.path },
        defaults: item
      });
    }

    console.log("✅ Menu seeding completed.");
  } catch (err) {
    console.error("❌ Failed to seed menus:", err);
  } finally {
    process.exit(0);
  }
}

seedFeatureMenus();
```
