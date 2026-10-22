const logger = require('../api/logger');
const db = require('../models');
const DashboardMenu = db.dashboardMenu;

// Initial 10 standard dashboard shortcuts
const DEFAULT_SHORTCUTS = [
    { name: 'POS Minimart', llname: 'ຂາຍສິນຄ້າ (POS)', path: '/pos/minimart', icon: 'cashier_2.svg', iconType: 'svg', order: 0, isActive: true },
    { name: 'Invoice', llname: 'ໃບບິນ (Invoice)', path: '/admin/ordersFromPos', icon: 'invoice.svg', iconType: 'svg', order: 1, isActive: true },
    { name: 'Receivables', llname: 'ລູກໜີ້', path: '/admin/ordersFromPosCredit', icon: 'pay-card.svg', iconType: 'svg', order: 2, isActive: true },
    { name: 'Inventory Stock', llname: 'ສາງສິນຄ້າ', path: '/admin/product/productlist', icon: 'stock.svg', iconType: 'svg', order: 3, isActive: true },
    { name: 'Restaurant Menu', llname: 'ເມນູອາຫານ (Menu)', path: '/admin/restaurant/menu', icon: 'coffee.svg', iconType: 'svg', order: 4, isActive: true },
    { name: 'Customers', llname: 'ລູກຄ້າ', path: '/admin/client', icon: 'patient.svg', iconType: 'svg', order: 5, isActive: true },
    { name: 'Sale by Main Category', llname: 'ລາຍງານຕາມໝວດຫຼັກ', path: '/admin/saleByMainCategory', icon: 'invoice.svg', iconType: 'svg', order: 6, isActive: true },
    { name: 'Sale by Category', llname: 'ລາຍງານຕາມປະເພດສິນຄ້າ', path: '/admin/saleByCategory', icon: 'invoice.svg', iconType: 'svg', order: 7, isActive: true },
    { name: 'Daily Sale Summary', llname: 'ສະຫຼຸບຍອດຂາຍລາຍວັນ', path: '/admin/saleReportSummary', icon: 'invoice.svg', iconType: 'svg', order: 8, isActive: true },
    { name: 'Loyalty Points Report', llname: 'ລາຍງານຄະແນນສະສົມ', path: '/admin/report/loyalty', icon: 'overview.svg', iconType: 'svg', order: 9, isActive: true },
];

/**
 * Get context-aware dashboard shortcuts for the active user:
 * 1. Personal shortcuts if defined for this user
 * 2. Role/Group shortcuts if defined for this user's group
 * 3. System default shortcuts (userId IS NULL AND userGroupId IS NULL)
 */
const getDashboardMenus = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userGroupId = req.user?.userGroupId || req.user?.userGroup?.id;

        // 1. Check personal shortcuts
        if (userId) {
            const userShortcuts = await DashboardMenu.findAll({
                where: { userId, isActive: true },
                order: [['order', 'ASC'], ['id', 'ASC']]
            });
            if (userShortcuts && userShortcuts.length > 0) {
                return res.status(200).json({
                    source: 'user',
                    shortcuts: userShortcuts
                });
            }
        }

        // 2. Check group/role shortcuts
        if (userGroupId) {
            const groupShortcuts = await DashboardMenu.findAll({
                where: { userGroupId, userId: null, isActive: true },
                order: [['order', 'ASC'], ['id', 'ASC']]
            });
            if (groupShortcuts && groupShortcuts.length > 0) {
                return res.status(200).json({
                    source: 'group',
                    shortcuts: groupShortcuts
                });
            }
        }

        // 3. Fallback to System defaults
        let defaultShortcuts = await DashboardMenu.findAll({
            where: { userId: null, userGroupId: null, isActive: true },
            order: [['order', 'ASC'], ['id', 'ASC']]
        });

        // If table is completely empty, auto-seed defaults
        if (!defaultShortcuts || defaultShortcuts.length === 0) {
            await DashboardMenu.bulkCreate(DEFAULT_SHORTCUTS);
            defaultShortcuts = await DashboardMenu.findAll({
                where: { userId: null, userGroupId: null, isActive: true },
                order: [['order', 'ASC'], ['id', 'ASC']]
            });
        }

        return res.status(200).json({
            source: 'default',
            shortcuts: defaultShortcuts
        });
    } catch (error) {
        logger.error('Error fetching dashboard shortcuts:', error);
        // Self-healing: If dashboard_menus table does not exist yet on a customer DB,
        // sync the table, seed default shortcuts, and return them without breaking the UI.
        if (error.original?.errno === 1146 || error.message?.includes("doesn't exist") || error.message?.includes("no such table")) {
            try {
                await DashboardMenu.sync({ force: false });
                await DashboardMenu.bulkCreate(DEFAULT_SHORTCUTS);
                logger.info("Auto-created and seeded dashboard_menus table on request.");
            } catch (syncErr) {
                logger.warn("Could not auto-sync dashboard_menus table:", syncErr.message);
            }
            return res.status(200).json({
                source: 'default',
                shortcuts: DEFAULT_SHORTCUTS
            });
        }
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Get all dashboard shortcuts for administrative management screen
 */
const getAllDashboardMenus = async (req, res) => {
    try {
        const { scope, userId, userGroupId } = req.query;
        const whereClause = {};

        if (scope === 'default') {
            whereClause.userId = null;
            whereClause.userGroupId = null;
        } else if (scope === 'user' && userId) {
            whereClause.userId = userId;
        } else if (scope === 'group' && userGroupId) {
            whereClause.userGroupId = userGroupId;
        } else if (scope === 'mine' && req.user?.id) {
            whereClause.userId = req.user.id;
        }

        const shortcuts = await DashboardMenu.findAll({
            where: whereClause,
            order: [
                ['userId', 'ASC'],
                ['userGroupId', 'ASC'],
                ['order', 'ASC'],
                ['id', 'ASC']
            ],
            include: [
                { model: db.user, as: 'user', attributes: ['id', 'cus_name'] },
                { model: db.group, as: 'group', attributes: ['id', 'name'] }
            ]
        });

        return res.status(200).json(shortcuts);
    } catch (error) {
        logger.error('Error fetching all dashboard shortcuts:', error);
        if (error.original?.errno === 1146 || error.message?.includes("doesn't exist") || error.message?.includes("no such table")) {
            try {
                await DashboardMenu.sync({ force: false });
                await DashboardMenu.bulkCreate(DEFAULT_SHORTCUTS);
            } catch (syncErr) { }
            return res.status(200).json(DEFAULT_SHORTCUTS);
        }
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Get single shortcut by ID
 */
const getDashboardMenuById = async (req, res) => {
    try {
        const { id } = req.params;
        const shortcut = await DashboardMenu.findByPk(id, {
            include: [
                { model: db.user, as: 'user', attributes: ['id', 'cus_name'] },
                { model: db.group, as: 'group', attributes: ['id', 'name'] }
            ]
        });

        if (!shortcut) {
            return res.status(404).json({ message: 'Shortcut not found' });
        }

        return res.status(200).json(shortcut);
    } catch (error) {
        logger.error('Error fetching shortcut by ID:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Create new dashboard shortcut
 */
const createDashboardMenu = async (req, res) => {
    try {
        const {
            name,
            llname,
            path,
            icon,
            iconType,
            color,
            badge,
            order,
            target_systems,
            userGroupId,
            userId,
            isActive
        } = req.body;

        if (!name || !path) {
            return res.status(400).json({ message: 'Name and Path are required' });
        }

        // Calculate next order if not provided
        let targetOrder = order;
        if (targetOrder === undefined || targetOrder === null) {
            const maxOrder = await DashboardMenu.max('order', {
                where: {
                    userId: userId || null,
                    userGroupId: userGroupId || null
                }
            });
            targetOrder = (maxOrder !== null && !isNaN(maxOrder)) ? maxOrder + 1 : 0;
        }

        const newShortcut = await DashboardMenu.create({
            name,
            llname: llname || name,
            path,
            icon: icon || 'cashier_2.svg',
            iconType: iconType || (icon && icon.startsWith('mdi-') ? 'mdi' : 'svg'),
            color: color || null,
            badge: badge || null,
            order: targetOrder,
            target_systems: target_systems || 'ALL',
            userGroupId: userGroupId || null,
            userId: userId || null,
            isActive: isActive !== undefined ? isActive : true
        });

        return res.status(201).json(newShortcut);
    } catch (error) {
        logger.error('Error creating dashboard shortcut:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Update dashboard shortcut
 */
const updateDashboardMenu = async (req, res) => {
    try {
        const { id } = req.params;
        const shortcut = await DashboardMenu.findByPk(id);

        if (!shortcut) {
            return res.status(404).json({ message: 'Shortcut not found' });
        }

        const {
            name,
            llname,
            path,
            icon,
            iconType,
            color,
            badge,
            order,
            target_systems,
            userGroupId,
            userId,
            isActive
        } = req.body;

        await shortcut.update({
            name: name !== undefined ? name : shortcut.name,
            llname: llname !== undefined ? llname : shortcut.llname,
            path: path !== undefined ? path : shortcut.path,
            icon: icon !== undefined ? icon : shortcut.icon,
            iconType: iconType !== undefined ? iconType : (icon && icon.startsWith('mdi-') ? 'mdi' : shortcut.iconType),
            color: color !== undefined ? color : shortcut.color,
            badge: badge !== undefined ? badge : shortcut.badge,
            order: order !== undefined ? order : shortcut.order,
            target_systems: target_systems !== undefined ? target_systems : shortcut.target_systems,
            userGroupId: userGroupId !== undefined ? userGroupId : shortcut.userGroupId,
            userId: userId !== undefined ? userId : shortcut.userId,
            isActive: isActive !== undefined ? isActive : shortcut.isActive
        });

        return res.status(200).json(shortcut);
    } catch (error) {
        logger.error('Error updating dashboard shortcut:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Delete dashboard shortcut
 */
const deleteDashboardMenu = async (req, res) => {
    try {
        const { id } = req.params;
        const shortcut = await DashboardMenu.findByPk(id);

        if (!shortcut) {
            return res.status(404).json({ message: 'Shortcut not found' });
        }

        await shortcut.destroy();
        return res.status(200).json({ message: 'Shortcut deleted successfully' });
    } catch (error) {
        logger.error('Error deleting dashboard shortcut:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Bulk reorder dashboard shortcuts
 * Body: { items: [{ id: 1, order: 0 }, { id: 2, order: 1 }] }
 */
const reorderDashboardMenus = async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'Items array is required' });
        }

        const updates = items.map(item =>
            DashboardMenu.update(
                { order: item.order },
                { where: { id: item.id } }
            )
        );

        await Promise.all(updates);
        return res.status(200).json({ message: 'Shortcuts reordered successfully' });
    } catch (error) {
        logger.error('Error reordering dashboard shortcuts:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Seed or reset default shortcuts
 */
const seedDefaultShortcuts = async (req, res) => {
    try {
        const force = req.query.force === 'true';

        if (force) {
            await DashboardMenu.destroy({
                where: { userId: null, userGroupId: null }
            });
        }

        const existingCount = await DashboardMenu.count({
            where: { userId: null, userGroupId: null }
        });

        if (existingCount === 0 || force) {
            await DashboardMenu.bulkCreate(DEFAULT_SHORTCUTS);
            return res.status(201).json({ message: 'Default shortcuts seeded successfully', count: DEFAULT_SHORTCUTS.length });
        }

        return res.status(200).json({ message: 'Default shortcuts already exist', count: existingCount });
    } catch (error) {
        logger.error('Error seeding default shortcuts:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Get available free MDI icons with search & pagination
 */
const getMdiIcons = async (req, res) => {
    try {
        let mdiIconsList = [];
        try {
            mdiIconsList = require('./mdi-icons.json');
        } catch (e) {
            mdiIconsList = [];
        }

        const { search, limit = 120, offset = 0 } = req.query;
        let results = mdiIconsList;

        if (search) {
            const query = search.toLowerCase().trim().replace(/^mdi-/, '');
            results = results.filter(name => name.toLowerCase().includes(query));
        }

        const total = results.length;
        const paged = results.slice(Number(offset), Number(offset) + Number(limit));

        return res.status(200).json({
            total,
            limit: Number(limit),
            offset: Number(offset),
            icons: paged
        });
    } catch (error) {
        logger.error('Error fetching MDI icons:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

/**
 * Get user groups for dashboard shortcut scoping
 */
const getUserGroups = async (req, res) => {
    try {
        const groups = await db.group.findAll({
            where: { isActive: true },
            attributes: ['id', 'name', 'code', 'isActive'],
            order: [['id', 'ASC']]
        });
        const formatted = groups.map(g => ({
            id: g.id,
            name: g.name,
            code: g.code,
            displayName: `${g.code ? g.code + ' - ' : ''}${g.name || ''}`
        }));
        return res.status(200).json(formatted);
    } catch (error) {
        logger.error('Error fetching user groups for dashboard:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

module.exports = {
    getDashboardMenus,
    getAllDashboardMenus,
    getDashboardMenuById,
    createDashboardMenu,
    updateDashboardMenu,
    deleteDashboardMenu,
    reorderDashboardMenus,
    seedDefaultShortcuts,
    getMdiIcons,
    getUserGroups,
    DEFAULT_SHORTCUTS
};
