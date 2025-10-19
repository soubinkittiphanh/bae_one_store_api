const express = require('express');
const router = express.Router();
const { validateToken } = require('../api/jwtApi');
// const { hasPermission, hasMinimumLevel } = require('../middleware/auth');
const roleController = require('./controller');

// Apply authentication to all routes
router.use(validateToken);

// Get available permissions (all authenticated users can see)
router.get('/permissions', roleController.getAvailablePermissions);

// Get role statistics
router.get('/stats',  roleController.getRoleStats);

// Get all roles (Manager+ can view)
router.get('/',  roleController.getAllRoles);

// Get users by role
router.get('/:id/users',  roleController.getUsersByRole);

// Get role by ID (Manager+ can view)
router.get('/:id',  roleController.getRoleById);

// Create new role (Admin only)
router.post('/',  roleController.createRole);

// Clone/duplicate role (Admin only)
router.post('/:id/clone',  roleController.cloneRole);

// Update role (Admin only)
router.put('/:id',  roleController.updateRole);

// Delete role (Admin only)
router.delete('/:id',  roleController.deleteRole);

// Deactivate role (Admin only)
router.patch('/:id/deactivate',  roleController.deactivateRole);

// Activate role (Admin only)
router.patch('/:id/activate',  roleController.activateRole);

module.exports = router;