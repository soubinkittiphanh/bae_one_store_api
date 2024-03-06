
const logger = require('../api/logger');
const { Op } = require('sequelize');
const WebProductGroup = require('../models').webProductGroup; // Adjust the path as necessary
const service = require('./service'); // Adjust the path as necessary
// const webProductService = require(`./service`);
const Product = require('../models').product;
const WebProductGroupController = {
  async create(req, res) {
    try {
      const { name, g_name, order_level, remark, isActive, productList } = req.body;
      let newProductGroup = await WebProductGroup.create({
        name,
        g_name,
        order_level,
        remark,
        isActive,
      });
      if (productList) await newProductGroup.setProducts(productList.map(el => el.id))
      // await webProductService.setProductWebGroup(newProductGroup.id, productList.map(el => el.id))
      // }
      res.status(201).send(newProductGroup);
      logger.info('Created a new product group:', newProductGroup);
    } catch (error) {
      res.status(400).send(error);
      logger.error('Error creating a new product group:', error);
    }
  },

  async findAll(req, res) {
    try {
      const productGroups = await WebProductGroup.findAll({
        include: [{
          model: Product,
          as: 'products'
        }]
      });
      res.status(200).send(productGroups);
      logger.info('Retrieved all product groups:', productGroups);
    } catch (error) {
      res.status(500).send(error);
      logger.error('Error retrieving all product groups:', error);
    }
  },
  async findActive(req, res) {
    try {
      const productGroups = await WebProductGroup.findAll({
        where: { isActive: true },
        include: [{
          model: Product,
          as: 'products',
          include: ['images'],
        }]
      });
      res.status(200).send(productGroups);
      logger.info('Retrieved all product groups:', productGroups);
    } catch (error) {
      res.status(500).send(error);
      logger.error('Error retrieving all product groups:', error);
    }
  },

  async findOne(req, res) {
    try {
      const { id } = req.params;
      const productGroup = await WebProductGroup.findByPk(id, {
        include: [{
          model: Product,
          as: 'products',   
          include: ['images'],
        }]
      });
      if (productGroup) {
        res.status(200).send(productGroup);
        logger.info('Retrieved a product group by id:', productGroup);
      } else {
        res.status(404).send({ message: 'Product Group not found.' });
        logger.warn('Product Group not found with id:', id);
      }
    } catch (error) {
      res.status(500).send(error);
      logger.error('Error retrieving a product group by id:', error);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, g_name, order_level, remark, isActive, productList } = req.body;

      const updatedProductGroup = await WebProductGroup.findByPk(id);
      await updatedProductGroup.update({
        name,
        g_name,
        order_level,
        remark,
        isActive,
      })
      if (productList) await updatedProductGroup.setProducts(productList.map(el => el.id))
      res.status(200).send(updatedProductGroup);
      logger.info('Updated a product group by id: ', updatedProductGroup);
    } catch (error) {
      res.status(500).send(error);
      logger.error('Error updating a product group by id:', error);
    }
  },
  async assingGroups(req, res) {
    try {
      const { id } = req.params;
      const { groupList } = req.body;

      const updatedProductGroup = await service.assignGroupsToProduct(id, groupList);
      res.status(200).send(updatedProductGroup);
      logger.info('Updated a product group by id: ', updatedProductGroup);
    } catch (error) {
      res.status(500).send(error);
      logger.error('Error assign groups to a product with error:', error);
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      const deleted = await WebProductGroup.destroy({
        where: { id },
      });
      if (deleted) {
        res.status(204).send({ message: 'Product Group deleted.' });
        logger.info('Deleted a product group by id:', id);
      } else {
        res.status(404).send({ message: 'Product Group not found.' });
        logger.warn('Product Group not found for deletion with id:', id);
      }
    } catch (error) {
      res.status(500).send(error);
      logger.error('Error deleting a product group by id:', error);
    }
  },
};

module.exports = WebProductGroupController;
