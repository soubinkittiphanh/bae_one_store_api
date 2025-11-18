const { recipe: Recipe, product: Product, unit: Unit } = require('../models');
const { Op, ValidationError } = require('sequelize');

class RecipeController {
  /**
   * Get all recipes with optional filtering
   * GET /api/recipes
   */
  async getAllRecipes(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        productId,
        ingredientId,
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build where conditions
      const whereConditions = {};
      if (productId) whereConditions.productId = productId;
      if (ingredientId) whereConditions.ingredientId = ingredientId;
      if (search) {
        whereConditions.name = {
          [Op.iLike]: `%${search}%`
        };
      }

      // Build include for associations
      const include = [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
        },
        {
          model: Product,
          as: 'ingredient',
          attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
        },
        {
          model: Unit,
          as: 'unit',
          attributes: ['id', 'name']
        }
      ];

      const { count, rows: recipes } = await Recipe.findAndCountAll({
        where: whereConditions,
        include,
        limit: parseInt(limit),
        offset,
        order: [[sortBy, sortOrder.toUpperCase()]],
        distinct: true
      });

      const totalPages = Math.ceil(count / parseInt(limit));

      res.status(200).json({
        success: true,
        data: {
          recipes,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: count,
            itemsPerPage: parseInt(limit),
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1
          }
        },
        message: 'Recipes retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching recipes:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recipes',
        error: error.message
      });
    }
  }

  /**
   * Get recipe by ID
   * GET /api/recipes/:id
   */
  async getRecipeById(req, res) {
    try {
      const { id } = req.params;

      const recipe = await Recipe.findByPk(id, {
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Product,
            as: 'ingredient',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Unit,
            as: 'unit',
            attributes: ['id', 'name',]
          }
        ]
      });

      if (!recipe) {
        return res.status(404).json({
          success: false,
          message: 'Recipe not found'
        });
      }

      res.status(200).json({
        success: true,
        data: recipe,
        message: 'Recipe retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching recipe:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recipe',
        error: error.message
      });
    }
  }

  /**
   * Get all recipes for a specific product
   * GET /api/recipes/product/:productId
   */
  async getRecipesByProduct(req, res) {
    try {
      const { productId } = req.params;

      // Check if product exists
      const product = await Product.findByPk(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      const recipes = await Recipe.findAll({
        where: { productId },
        include: [
          {
            model: Product,
            as: 'ingredient',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Unit,
            as: 'unit',
            attributes: ['id', 'name']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: {
          product,
          recipes,
          totalIngredients: recipes.length
        },
        message: 'Product recipes retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching product recipes:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching product recipes',
        error: error.message
      });
    }
  }

  /**
   * Create a new recipe
   * POST /api/recipes
   */
  async createRecipe(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const {
        name,
        productId,
        description,
        prepTime,
        instructions,
        ingredients
      } = req.body;

      // Validation
      if (!name || !productId || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Name, productId, and ingredients array are required'
        });
      }

      // Check if product exists
      const product = await Product.findByPk(productId);
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check if recipe already exists for this product
      const existingRecipe = await Recipe.findOne({
        where: { productId }
      });

      if (existingRecipe) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'Recipe for this product already exists. Use update instead.'
        });
      }

      // Validate ingredients
      const ingredientErrors = [];
      const validatedIngredients = [];

      for (let i = 0; i < ingredients.length; i++) {
        const { ingredientId, quantity, unitId, customName, notes } = ingredients[i];

        if (!ingredientId || !quantity) {
          ingredientErrors.push(`Ingredient ${i + 1}: ingredientId and quantity are required`);
          continue;
        }

        if (productId === ingredientId) {
          ingredientErrors.push(`Ingredient ${i + 1}: Product cannot be an ingredient of itself`);
          continue;
        }

        // Check if ingredient (product) exists
        const ingredient = await Product.findByPk(ingredientId);
        if (!ingredient) {
          ingredientErrors.push(`Ingredient ${i + 1}: Ingredient product not found`);
          continue;
        }

        // Check if unit exists (if provided)
        if (unitId) {
          const unit = await Unit.findByPk(unitId);
          if (!unit) {
            ingredientErrors.push(`Ingredient ${i + 1}: Unit not found`);
            continue;
          }
        }

        validatedIngredients.push({
          ingredientId,
          quantity: parseFloat(quantity),
          unitId: unitId || null,
          customName: customName || null,
          notes: notes || null
        });
      }

      if (ingredientErrors.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Validation errors in ingredients',
          errors: ingredientErrors
        });
      }

      // Check for duplicate ingredients in the same recipe
      const ingredientIds = validatedIngredients.map(ing => ing.ingredientId);
      const uniqueIngredientIds = [...new Set(ingredientIds)];
      if (ingredientIds.length !== uniqueIngredientIds.length) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Duplicate ingredients are not allowed in the same recipe'
        });
      }

      // Calculate total cost
      let totalCost = 0;
      for (const ingredient of validatedIngredients) {
        const ingredientProduct = await Product.findByPk(ingredient.ingredientId);
        totalCost += (ingredientProduct.pro_price || 0) * ingredient.quantity;
      }

      // Create recipe
      const recipe = await Recipe.create({
        name,
        productId,
        description: description || null,
        prepTime: prepTime || null,
        instructions: instructions || null,
        totalCost: totalCost.toFixed(2)
      }, { transaction });

      // Create recipe ingredients
      const ingredientsToCreate = validatedIngredients.map(ingredient => ({
        ...ingredient,
        recipeId: recipe.id
      }));

      await RecipeIngredient.bulkCreate(ingredientsToCreate, { transaction });

      await transaction.commit();

      // Fetch created recipe with all associations
      const createdRecipe = await Recipe.findByPk(recipe.id, {
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price', 'pro_cost_price']
          },
          {
            model: RecipeIngredient,
            as: 'ingredients',
            include: [
              {
                model: Product,
                as: 'ingredient',
                attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
              },
              {
                model: Unit,
                as: 'unit',
                attributes: ['id', 'name', 'symbol'],
                required: false
              }
            ]
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdRecipe,
        message: 'Recipe created successfully'
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error creating recipe:', error);

      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating recipe',
        error: error.message
      });
    }
  }



  /**
   * Update recipe
   * PUT /api/recipes/:id
   */
  async updateRecipe(req, res) {
    try {
      const { id } = req.params;
      const { name, productId, ingredientId, quantity, unitId } = req.body;

      const recipe = await Recipe.findByPk(id);
      if (!recipe) {
        return res.status(404).json({
          success: false,
          message: 'Recipe not found'
        });
      }

      // Prevent self-referencing if updating productId or ingredientId
      if (productId && ingredientId && productId === ingredientId) {
        return res.status(400).json({
          success: false,
          message: 'A product cannot be an ingredient of itself'
        });
      }

      // Check if product exists (if updating)
      if (productId && productId !== recipe.productId) {
        const product = await Product.findByPk(productId);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: 'Product not found'
          });
        }
      }

      // Check if ingredient exists (if updating)
      if (ingredientId && ingredientId !== recipe.ingredientId) {
        const ingredient = await Product.findByPk(ingredientId);
        if (!ingredient) {
          return res.status(404).json({
            success: false,
            message: 'Ingredient not found'
          });
        }
      }

      // Check if unit exists (if updating)
      if (unitId) {
        const unit = await Unit.findByPk(unitId);
        if (!unit) {
          return res.status(404).json({
            success: false,
            message: 'Unit not found'
          });
        }
      }

      // Check for duplicate recipe if productId or ingredientId is being changed
      if ((productId && productId !== recipe.productId) ||
        (ingredientId && ingredientId !== recipe.ingredientId)) {
        const checkProductId = productId || recipe.productId;
        const checkIngredientId = ingredientId || recipe.ingredientId;

        const existingRecipe = await Recipe.findOne({
          where: {
            productId: checkProductId,
            ingredientId: checkIngredientId,
            id: { [Op.ne]: id }
          }
        });

        if (existingRecipe) {
          return res.status(409).json({
            success: false,
            message: 'Recipe with this product and ingredient combination already exists'
          });
        }
      }

      // Update recipe
      await recipe.update({
        ...(name && { name }),
        ...(productId && { productId }),
        ...(ingredientId && { ingredientId }),
        ...(quantity !== undefined && { quantity: parseFloat(quantity) }),
        ...(unitId !== undefined && { unitId })
      });

      // Fetch updated recipe with associations
      const updatedRecipe = await Recipe.findByPk(id, {
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Product,
            as: 'ingredient',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Unit,
            as: 'unit',
            attributes: ['id', 'name']
          }
        ]
      });

      res.status(200).json({
        success: true,
        data: updatedRecipe,
        message: 'Recipe updated successfully'
      });
    } catch (error) {
      console.error('Error updating recipe:', error);

      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating recipe',
        error: error.message
      });
    }
  }

  /**
   * Delete recipe
   * DELETE /api/recipes/:id
   */
  async deleteRecipe(req, res) {
    try {
      const { id } = req.params;

      const recipe = await Recipe.findByPk(id);
      if (!recipe) {
        return res.status(404).json({
          success: false,
          message: 'Recipe not found'
        });
      }

      await recipe.destroy();

      res.status(200).json({
        success: true,
        message: 'Recipe deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting recipe:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting recipe',
        error: error.message
      });
    }
  }

  /**
   * Bulk create recipes for a product
   * POST /api/recipes/bulk
   */
  async bulkCreateRecipes(req, res) {
    try {
      const { productId, recipes } = req.body;

      if (!productId || !recipes || !Array.isArray(recipes)) {
        return res.status(400).json({
          success: false,
          message: 'ProductId and recipes array are required'
        });
      }

      // Check if product exists
      const product = await Product.findByPk(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check if any recipes already exist for this product
      const existingRecipes = await Recipe.findAll({
        where: { productId },
        include: [
          {
            model: Product,
            as: 'ingredient',
            attributes: ['id', 'pro_name']
          }
        ]
      });

      if (existingRecipes.length > 0) {
        const existingIngredients = existingRecipes.map(recipe =>
          `${recipe.ingredient.pro_name} (ID: ${recipe.ingredient.id})`
        ).join(', ');

        return res.status(409).json({
          success: false,
          message: `Recipes already exist for this product. Existing ingredients: ${existingIngredients}`,
          data: {
            existingRecipesCount: existingRecipes.length,
            existingRecipes: existingRecipes.map(recipe => ({
              id: recipe.id,
              name: recipe.name,
              ingredientName: recipe.ingredient.pro_name,
              quantity: recipe.quantity
            }))
          }
        });
      }

      // Validate and prepare recipes
      const recipesToCreate = [];
      const errors = [];

      // Track ingredient IDs to prevent duplicates within this bulk request
      const ingredientIds = new Set();

      for (let i = 0; i < recipes.length; i++) {
        const { name, ingredientId, quantity, unitId } = recipes[i];

        if (!name || !ingredientId || !quantity) {
          errors.push(`Recipe ${i + 1}: Name, ingredientId, and quantity are required`);
          continue;
        }

        if (productId === ingredientId) {
          errors.push(`Recipe ${i + 1}: Product cannot be an ingredient of itself`);
          continue;
        }

        // Check for duplicate ingredients within this bulk request
        if (ingredientIds.has(ingredientId)) {
          errors.push(`Recipe ${i + 1}: Duplicate ingredient in this request. Ingredient ID ${ingredientId} is already included.`);
          continue;
        }

        // Check if ingredient exists
        const ingredient = await Product.findByPk(ingredientId);
        if (!ingredient) {
          errors.push(`Recipe ${i + 1}: Ingredient with ID ${ingredientId} not found`);
          continue;
        }

        // Check if unit exists (if provided)
        if (unitId) {
          const unit = await Unit.findByPk(unitId);
          if (!unit) {
            errors.push(`Recipe ${i + 1}: Unit with ID ${unitId} not found`);
            continue;
          }
        }

        // Add to set to track duplicates
        ingredientIds.add(ingredientId);

        recipesToCreate.push({
          name,
          productId,
          ingredientId,
          quantity: parseFloat(quantity),
          unitId: unitId || null
        });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors
        });
      }

      if (recipesToCreate.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid recipes to create'
        });
      }

      // Create recipes
      const createdRecipes = await Recipe.bulkCreate(recipesToCreate, {
        validate: true
      });

      // Fetch created recipes with full associations
      const fullCreatedRecipes = await Recipe.findAll({
        where: {
          id: createdRecipes.map(recipe => recipe.id)
        },
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Product,
            as: 'ingredient',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Unit,
            as: 'unit',
            attributes: ['id', 'name'],
            required: false
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: {
          createdCount: fullCreatedRecipes.length,
          recipes: fullCreatedRecipes
        },
        message: `Successfully created ${fullCreatedRecipes.length} recipes for ${product.pro_name}`
      });

    } catch (error) {
      console.error('Error bulk creating recipes:', error);

      // Handle specific database errors
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
          success: false,
          message: 'Some recipes already exist for this product and ingredient combination',
          error: 'Duplicate recipe detected'
        });
      }

      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error bulk creating recipes',
        error: error.message
      });
    }
  }

  /**
   * Calculate total cost of a product based on its recipe
   * GET /api/recipes/product/:productId/cost
   */
  async calculateProductCost(req, res) {
    try {
      const { productId } = req.params;
      const { quantity = 1 } = req.query;

      const recipes = await Recipe.findAll({
        where: { productId },
        include: [
          {
            model: Product,
            as: 'ingredient',
            attributes: ['id', 'pro_name', 'pro_desc', 'pro_price']
          },
          {
            model: Unit,
            as: 'unit',
            attributes: ['id', 'name',]
          }
        ]
      });

      if (recipes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No recipes found for this product'
        });
      }

      let totalCost = 0;
      const costBreakdown = [];

      for (const recipe of recipes) {
        const ingredientCost = (recipe.ingredient.price || 0) * recipe.quantity * parseFloat(quantity);
        totalCost += ingredientCost;

        costBreakdown.push({
          ingredientId: recipe.ingredient.id,
          ingredientName: recipe.ingredient.name,
          quantity: recipe.quantity,
          unitPrice: recipe.ingredient.price || 0,
          totalCost: ingredientCost,
          unit: recipe.unit
        });
      }

      res.status(200).json({
        success: true,
        data: {
          productId,
          productionQuantity: parseFloat(quantity),
          totalCost,
          costBreakdown,
          costPerUnit: totalCost / parseFloat(quantity)
        },
        message: 'Product cost calculated successfully'
      });
    } catch (error) {
      console.error('Error calculating product cost:', error);
      res.status(500).json({
        success: false,
        message: 'Error calculating product cost',
        error: error.message
      });
    }
  }

  /**
   * Get recipe statistics
   * GET /api/recipes/stats
   */
  async getRecipeStats(req, res) {
    try {
      const [
        totalRecipes,
        totalProducts,
        totalIngredients,
        avgIngredientsPerProduct
      ] = await Promise.all([
        Recipe.count(),
        Recipe.count({ distinct: true, col: 'productId' }),
        Recipe.count({ distinct: true, col: 'ingredientId' }),
        Recipe.findAll({
          attributes: [
            'productId',
            [Recipe.sequelize.fn('COUNT', Recipe.sequelize.col('ingredientId')), 'ingredientCount']
          ],
          group: ['productId']
        })
      ]);

      const avgIngredients = avgIngredientsPerProduct.length > 0
        ? avgIngredientsPerProduct.reduce((sum, item) => sum + parseInt(item.dataValues.ingredientCount), 0) / avgIngredientsPerProduct.length
        : 0;

      res.status(200).json({
        success: true,
        data: {
          totalRecipes,
          totalProducts,
          totalIngredients,
          averageIngredientsPerProduct: Math.round(avgIngredients * 100) / 100
        },
        message: 'Recipe statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting recipe stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting recipe statistics',
        error: error.message
      });
    }
  }
}

module.exports = new RecipeController();