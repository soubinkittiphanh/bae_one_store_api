// routes/recipes.js
const express = require('express');
const router = express.Router();
const RecipeController = require('./controller');

// Basic CRUD
router.get('/', RecipeController.getAllRecipes);
router.get('/stats', RecipeController.getRecipeStats);
router.get('/product/:productId', RecipeController.getRecipesByProduct);
router.get('/product/:productId/cost', RecipeController.calculateProductCost);
router.get('/:id', RecipeController.getRecipeById);
router.post('/', RecipeController.createRecipe);
router.post('/bulk', RecipeController.bulkCreateRecipes);
router.put('/:id', RecipeController.updateRecipe);
router.delete('/:id', RecipeController.deleteRecipe);

module.exports = router;