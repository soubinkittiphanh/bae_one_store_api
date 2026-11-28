// routes/recipes.js
const express = require('express');
const router = express.Router();
const RecipeController = require('./controller');
const { validateToken } = require('../api/jwtApi');
const { requirePosGrant } = require('../security/middleware');
const rawMaterialController = require('../rawMaterial/controller');

// Basic CRUD
router.get('/', RecipeController.getAllRecipes);
router.get('/stats', RecipeController.getRecipeStats);
router.get('/product/:productId', RecipeController.getRecipesByProduct);
router.get('/product/:productId/cost', RecipeController.calculateProductCost);
// Whole-recipe read/replace with unit validation and costing (src/rawMaterial/service.js)
router.get('/product/:productId/bom', validateToken, rawMaterialController.getRecipe);
router.put('/product/:productId', validateToken, requirePosGrant('PRODUCT', 'EDIT'), rawMaterialController.replaceRecipe);
router.get('/:id', RecipeController.getRecipeById);
// Writes need a login and PRODUCT EDIT (they had no token check before)
router.post('/', validateToken, requirePosGrant('PRODUCT', 'EDIT'), RecipeController.createRecipe);
router.post('/bulk', validateToken, requirePosGrant('PRODUCT', 'EDIT'), RecipeController.bulkCreateRecipes);
router.put('/:id', validateToken, requirePosGrant('PRODUCT', 'EDIT'), RecipeController.updateRecipe);
router.delete('/:id', validateToken, requirePosGrant('PRODUCT', 'EDIT'), RecipeController.deleteRecipe);

module.exports = router;