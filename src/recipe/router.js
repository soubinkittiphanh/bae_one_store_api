// routes/recipes.js
const express = require('express');
const router = express.Router();
const RecipeController = require('./controller');
const { validateToken } = require('../api/jwtApi');
const rawMaterialController = require('../rawMaterial/controller');

// Basic CRUD
router.get('/', RecipeController.getAllRecipes);
router.get('/stats', RecipeController.getRecipeStats);
router.get('/product/:productId', RecipeController.getRecipesByProduct);
router.get('/product/:productId/cost', RecipeController.calculateProductCost);
// Whole-recipe read/replace with unit validation and costing (src/rawMaterial/service.js)
router.get('/product/:productId/bom', validateToken, rawMaterialController.getRecipe);
router.put('/product/:productId', validateToken, rawMaterialController.replaceRecipe);
router.get('/:id', RecipeController.getRecipeById);
router.post('/', RecipeController.createRecipe);
router.post('/bulk', RecipeController.bulkCreateRecipes);
router.put('/:id', RecipeController.updateRecipe);
router.delete('/:id', RecipeController.deleteRecipe);

module.exports = router;