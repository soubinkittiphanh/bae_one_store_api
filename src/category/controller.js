
const Category = require('../models').category;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');


// Get all categories
const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.findAll();
    res.status(200).json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a single category by ID
const getCategoryById = async (req, res) => {
  const { categ_id } = req.params;
  try {
    const category = await Category.findOne({ where: { categ_id } });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.status(200).json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create a new category
const createCategory = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { categ_id, categ_name, categ_desc, isActive } = req.body;
  try {
    const newCategory = await Category.create({
      categ_id,
      categ_name,
      categ_desc,
      isActive,
    });
    res.status(200).json(newCategory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update an existing category by ID
const updateCategoryById = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { categ_id } = req.params;
  const { categ_name, categ_desc, isActive } = req.body;
  try {
    const category = await Category.findOne({ where: { categ_id } });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    await Category.update(
      {
        categ_name,
        categ_desc,
        isActive,
      },
      { where: { categ_id } }
    );
    res.status(200).json({ message: 'Category updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete a category by ID
const deleteCategoryById = async (req, res) => {
  const { categ_id } = req.params;
  try {
    const category = await Category.findOne({ where: { categ_id } });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    await Category.destroy({ where: { categ_id } });
    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategoryById,
  deleteCategoryById,
};