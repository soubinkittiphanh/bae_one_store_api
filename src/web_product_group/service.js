const { Op } = require('sequelize');
const logger = require('../api/logger');
const WebGroupProduct = require('../models').webProductGroup
const Product = require('../models').product

const linkProductWebGroup = async (id, productId) => {
    try {
        const dbWebProductGroup = await WebGroupProduct.findByPk(id)
        if (!dbWebProductGroup) {
            logger.error(`Cannot find WebProductGroup id ${id}`)
        }
        await dbWebProductGroup.addProduct(productId)
        return dbWebProductGroup
    } catch (error) {
        logger.error(`Cannot map product to web product group with error ${error}`)
    }
};
const unlinkProductWebGroup = async (id, productId) => {
    try {
        const dbWebProductGroup = await WebGroupProduct.findByPk(id)
        if (!dbWebProductGroup) {
            throw new Error(`WebProductGroup not found ${id}`)
        }
        await dbWebProductGroup.removeProduct(productId)
    } catch (error) {
        logger.error(`Cannot remove product from webProductGroup withe error ${error}`)
    }
};
const setProductWebGroup = async (id, produtList) => {
    try {
        const dbWebProductGroup = await WebGroupProduct.findByPk(id)
        if (!dbWebProductGroup) {
            throw new Error(`WebProductGroup is not found `)
        }
        await dbWebProductGroup.setProducts(produtList.map(el => el.id))
        return dbWebProductGroup
    } catch (error) {
        logger.error(`Operation fail for set WebProductGroup with error ${error}`)
    }
};
const assignGroupsToProduct = async (id, groupList) => {
    try {
        const dbProduct = await Product.findByPk(id)
        if (!dbProduct) {
            throw new Error(`WebProductGroup is not found `)
        }
        await dbProduct.setWebProductGroups(groupList.map(el => el.id))
        return dbProduct
    } catch (error) {
        logger.error(`Operation fail for set group to product with error ${error}`)
    }
};

module.exports = {
    linkProductWebGroup,
    unlinkProductWebGroup,
    setProductWebGroup,
    assignGroupsToProduct
}