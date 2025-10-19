const logger = require('../api/logger');
const { Op } = require('sequelize');
const Role = require('../models').role;
const User = require('../models').user;
const sequelize = require('../models').sequelize;

const roleController = {
  // Get all roles
  getAllRoles: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        isActive,
        sort = 'level:desc'
      } = req.query;

      // Build where condition
      const whereCondition = {};

      if (search) {
        whereCondition[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      if (isActive !== undefined) {
        whereCondition.isActive = isActive === 'true';
      }

      // Handle sorting
      let orderArray = [['level', 'DESC']]; // default
      if (sort) {
        const [sortField, sortDirection] = sort.split(':');
        if (sortField && sortDirection) {
          orderArray = [[sortField, sortDirection.toUpperCase()]];
        }
      }

      const offset = (page - 1) * limit;

      const roles = await Role.findAndCountAll({
        where: whereCondition,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: orderArray,
        include: [
          {
            model: User,
            as: 'users',
            // attributes: ['id', 'username', 'email', 'firstName', 'lastName'],
            required: false
          }
        ]
      });

      res.status(200).json({
        success: true,
        data: roles.rows,
        pagination: {
          total: roles.count,
          currentPage: parseInt(page),
          totalPages: Math.ceil(roles.count / limit),
          limit: parseInt(limit)
        }
      });

    } catch (error) {
      logger.error(`Error fetching roles: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error fetching roles',
        error: error.message
      });
    }
  },

  // Get role by ID
  getRoleById: async (req, res) => {
    try {
      const { id } = req.params;

      const role = await Role.findByPk(id, {
        include: [
          {
            model: User,
            as: 'users',
            // attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'isActive']
          }
        ]
      });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      res.status(200).json({
        success: true,
        data: role
      });

    } catch (error) {
      logger.error(`Error fetching role: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error fetching role',
        error: error.message
      });
    }
  },

  // Create new role
  createRole: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const {
        name,
        level,
        permissions = [],
        description,
        isActive = true
      } = req.body;

      // Validation
      if (!name || name.trim() === '') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Role name is required'
        });
      }

      if (level === undefined || level === null) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Role level is required'
        });
      }

      // Check if role name already exists
      const existingRole = await Role.findOne({
        where: { name: name.toLowerCase().trim() },
        transaction
      });

      if (existingRole) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Role '${name}' already exists`
        });
      }

      // Create role
      const newRole = await Role.create({
        name: name.toLowerCase().trim(),
        level: parseInt(level),
        permissions: Array.isArray(permissions) ? permissions : [],
        description: description || null,
        isActive
      }, { transaction });

      await transaction.commit();

      logger.info(`Role created: ${newRole.name} (ID: ${newRole.id}) by user ${req.user?.id}`);

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: newRole
      });

    } catch (error) {
      await transaction.rollback();

      logger.error(`Error creating role: ${error.message}`);

      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'Role name must be unique',
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating role',
        error: error.message
      });
    }
  },

  // Update role
  updateRole: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        name,
        level,
        permissions,
        description,
        isActive
      } = req.body;

      const role = await Role.findByPk(id, { transaction });

      if (!role) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent modifying system roles (optional safety check)
      const systemRoles = ['admin', 'superadmin'];
      if (systemRoles.includes(role.name) && name && name.toLowerCase() !== role.name) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: `Cannot rename system role '${role.name}'`
        });
      }

      // Check if new name conflicts with existing role
      if (name && name.toLowerCase() !== role.name) {
        const existingRole = await Role.findOne({
          where: {
            name: name.toLowerCase().trim(),
            id: { [Op.ne]: id }
          },
          transaction
        });

        if (existingRole) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Role name '${name}' already exists`
          });
        }
      }

      // Prepare update data
      const updateData = {};
      if (name !== undefined) updateData.name = name.toLowerCase().trim();
      if (level !== undefined) updateData.level = parseInt(level);
      if (permissions !== undefined) updateData.permissions = Array.isArray(permissions) ? permissions : [];
      if (description !== undefined) updateData.description = description;
      if (isActive !== undefined) updateData.isActive = isActive;

      await role.update(updateData, { transaction });

      await transaction.commit();

      logger.info(`Role updated: ${role.name} (ID: ${role.id}) by user ${req.user?.id}`);

      // Fetch updated role with associations
      const updatedRole = await Role.findByPk(id, {
        include: [
          {
            model: User,
            as: 'users',
            // attributes: ['id', 'username', 'email', 'firstName', 'lastName']
          }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Role updated successfully',
        data: updatedRole
      });

    } catch (error) {
      await transaction.rollback();

      logger.error(`Error updating role: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error updating role',
        error: error.message
      });
    }
  },

  // Delete role
  deleteRole: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;

      const role = await Role.findByPk(id, { transaction });

      if (!role) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent deleting system roles
      const systemRoles = ['admin', 'superadmin', 'manager', 'staff'];
      if (systemRoles.includes(role.name)) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: `Cannot delete system role '${role.name}'`
        });
      }

      // Check if role is assigned to any users
      const usersWithRole = await User.count({
        where: { roleId: id },
        transaction
      });

      if (usersWithRole > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role. Please reassign them first.`,
          usersCount: usersWithRole
        });
      }

      await role.destroy({ transaction });

      await transaction.commit();

      logger.info(`Role deleted: ${role.name} (ID: ${role.id}) by user ${req.user?.id}`);

      res.status(200).json({
        success: true,
        message: 'Role deleted successfully'
      });

    } catch (error) {
      await transaction.rollback();

      logger.error(`Error deleting role: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error deleting role',
        error: error.message
      });
    }
  },

  // Soft delete (deactivate) role
  deactivateRole: async (req, res) => {
    try {
      const { id } = req.params;

      const role = await Role.findByPk(id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent deactivating system roles
      const systemRoles = ['admin', 'superadmin'];
      if (systemRoles.includes(role.name)) {
        return res.status(403).json({
          success: false,
          message: `Cannot deactivate system role '${role.name}'`
        });
      }

      await role.update({ isActive: false });

      logger.info(`Role deactivated: ${role.name} (ID: ${role.id}) by user ${req.user?.id}`);

      res.status(200).json({
        success: true,
        message: 'Role deactivated successfully',
        data: role
      });

    } catch (error) {
      logger.error(`Error deactivating role: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error deactivating role',
        error: error.message
      });
    }
  },

  // Activate role
  activateRole: async (req, res) => {
    try {
      const { id } = req.params;

      const role = await Role.findByPk(id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      await role.update({ isActive: true });

      logger.info(`Role activated: ${role.name} (ID: ${role.id}) by user ${req.user?.id}`);

      res.status(200).json({
        success: true,
        message: 'Role activated successfully',
        data: role
      });

    } catch (error) {
      logger.error(`Error activating role: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error activating role',
        error: error.message
      });
    }
  },

  // Get role statistics
  getRoleStats: async (req, res) => {
    try {
      const stats = await Role.findAll({
        attributes: [
          'id',
          'name',
          'level',
          'isActive',
          [sequelize.fn('COUNT', sequelize.col('users.id')), 'userCount']
        ],
        include: [
          {
            model: User,
            as: 'users',
            attributes: [],
            required: false
          }
        ],
        group: ['role.id'],
        order: [['level', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error(`Error fetching role stats: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error fetching role statistics',
        error: error.message
      });
    }
  },

  // Get all available permissions
  getAvailablePermissions: async (req, res) => {
    try {
      const permissions = {
        ticket: [
          { key: 'ticket.create', label: 'Create Tickets', description: 'Create new tickets' },
          { key: 'ticket.read', label: 'View Tickets', description: 'View ticket details' },
          { key: 'ticket.update', label: 'Update Tickets', description: 'Modify ticket information' },
          { key: 'ticket.delete', label: 'Delete Tickets', description: 'Permanently delete tickets' },
          { key: 'ticket.cancel', label: 'Cancel Tickets', description: 'Cancel tickets and reverse sales' },
          { key: 'ticket.void', label: 'Void Tickets', description: 'Void tickets' }
        ],
        payment: [
          { key: 'payment.process', label: 'Process Payments', description: 'Process customer payments' },
          { key: 'payment.refund', label: 'Refund Payments', description: 'Issue refunds' },
          { key: 'payment.view', label: 'View Payments', description: 'View payment history' }
        ],
        inventory: [
          { key: 'inventory.view', label: 'View Inventory', description: 'View stock levels' },
          { key: 'inventory.manage', label: 'Manage Inventory', description: 'Add/edit inventory items' },
          { key: 'inventory.adjust', label: 'Adjust Stock', description: 'Adjust stock quantities' }
        ],
        report: [
          { key: 'report.view', label: 'View Reports', description: 'Access sales and inventory reports' },
          { key: 'report.export', label: 'Export Reports', description: 'Export reports to file' }
        ],
        user: [
          { key: 'user.view', label: 'View Users', description: 'View user list' },
          { key: 'user.manage', label: 'Manage Users', description: 'Create/edit/delete users' }
        ],
        role: [
          { key: 'role.view', label: 'View Roles', description: 'View role list' },
          { key: 'role.manage', label: 'Manage Roles', description: 'Create/edit/delete roles' }
        ],
        system: [
          { key: 'system.settings', label: 'System Settings', description: 'Configure system parameters' },
          { key: 'system.backup', label: 'Backup/Restore', description: 'Backup and restore data' }
        ]
      };

      res.status(200).json({
        success: true,
        data: permissions
      });

    } catch (error) {
      logger.error(`Error fetching permissions: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error fetching available permissions',
        error: error.message
      });
    }
  },

  // Clone/duplicate role
  cloneRole: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name || name.trim() === '') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'New role name is required'
        });
      }

      const sourceRole = await Role.findByPk(id, { transaction });

      if (!sourceRole) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Source role not found'
        });
      }

      // Check if new name already exists
      const existingRole = await Role.findOne({
        where: { name: name.toLowerCase().trim() },
        transaction
      });

      if (existingRole) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Role '${name}' already exists`
        });
      }

      // Clone the role
      const clonedRole = await Role.create({
        name: name.toLowerCase().trim(),
        level: sourceRole.level,
        permissions: sourceRole.permissions,
        description: `Cloned from ${sourceRole.name}`,
        isActive: true
      }, { transaction });

      await transaction.commit();

      logger.info(`Role cloned: ${clonedRole.name} from ${sourceRole.name} by user ${req.user?.id}`);

      res.status(201).json({
        success: true,
        message: 'Role cloned successfully',
        data: clonedRole
      });

    } catch (error) {
      await transaction.rollback();

      logger.error(`Error cloning role: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error cloning role',
        error: error.message
      });
    }
  },

  // Get users by role
  getUsersByRole: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        page = 1,
        limit = 20,
        isActive
      } = req.query;

      const role = await Role.findByPk(id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      const whereCondition = { roleId: id };
      if (isActive !== undefined) {
        whereCondition.isActive = isActive === 'true';
      }

      const offset = (page - 1) * limit;

      const users = await User.findAndCountAll({
        where: whereCondition,
        // attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'phone', 'isActive', 'lastLogin'],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['username', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: users.rows,
        pagination: {
          total: users.count,
          currentPage: parseInt(page),
          totalPages: Math.ceil(users.count / limit),
          limit: parseInt(limit)
        }
      });

    } catch (error) {
      logger.error(`Error fetching users by role: ${error.message}`);

      res.status(500).json({
        success: false,
        message: 'Error fetching users',
        error: error.message
      });
    }
  }
};

module.exports = roleController;