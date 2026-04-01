
const MainCategory = require('../models').mainCategory;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');


// Get all categories
const getAllCategories = async (req, res) => {
  try {
    const categories = await MainCategory.findAll();
    res.status(200).json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
// Get all categories
const getAllActiveCategories = async (req, res) => {
  try {
    const categories = await MainCategory.findAll({where: {isActive:true}});
    res.status(200).json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a single category by ID
const getCategoryById = async (req, res) => {
  const { id } = req.params;
  try {
    const category = await MainCategory.findOne({ where: { id } });
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

  const { categoryName, categoryDesc, isActive } = req.body;
  try {
    const newCategory = await MainCategory.create({
      categoryName,
      categoryDesc,
      isActive,
    });
    res.status(200).json(newCategory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
// Create a new category
const generate = async (req, res) => {

  const categoryList =
    [
      {
        "categoryName": "ກາເຟ",
        "isActive": true
      },
      {
        "categoryName": "ເຄື່ອງຫອມ",
        "isActive": true
      },
      {
        "categoryName": "ເຄື່ອງຝາກ",
        "isActive": true
      },
      {
        "categoryName": "ຜ້າ",
        "isActive": true
      },
      {
        "categoryName": "ໄມ້",
        "isActive": true
      },
      {
        "categoryName": "ເຂົ້າ",
        "isActive": true
      },
      {
        "categoryName": "ນ້ຳເຜິ້ງ",
        "isActive": true
      }
    ]


  try {
    const newCategory = await MainCategory.bulkCreate(categoryList);
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

  const { id } = req.params;
  const { categoryName, categoryDesc, isActive } = req.body;
  try {
    const category = await MainCategory.findOne({ where: { id } });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    await MainCategory.update(
      {
        categoryName,
        categoryDesc,
        isActive,
      },
      { where: { id } }
    );
    res.status(200).json({ message: 'Category updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete a category by ID
const deleteCategoryById = async (req, res) => {
  const { id } = req.params;
  try {
    const category = await MainCategory.findOne({ where: { id } });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    await MainCategory.destroy({ where: { id } });
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
  generate,
  getAllActiveCategories
};