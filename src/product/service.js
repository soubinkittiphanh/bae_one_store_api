const { literal, Op } = require("sequelize");
const logger = require("../api/logger");
const Product = require('../models').product;
const updateProductCountById = async (id) => {
    try {
        const product = await Product.findByPk(id)
        if (!product) {
            logger.error(`Product stock count update fail, the productId is ${id} is not found`)
        } else {
            logger.info(`product found for update stock count ${JSON.stringify(product)}`)
            product.update({
                stock_count: literal(`(
            SELECT COUNT(card.card_number)
            FROM card
            WHERE card.productId =${id} AND card.saleLineId IS NULL
          )`)
            })
        }
    } catch (error) {
        logger.error(`Error updating product count for productId: ${id} ` + error);
    }

    // Product.update({
    //     stock_count: literal(`(
    //     SELECT COUNT(card.card_number)
    //     FROM card
    //     WHERE card.productId =${id} AND card.saleLineId IS NULL
    //   )`)
    // }).then(() => {
    //     logger.info('Product count updated successfully');
    // }).catch((error) => {
    //     logger.error(`Error updating product count for productId: ${id} ` + error);
    // });
};

const updateProductCountGroup = async (productIdList) => {
    try {
        const products = await Product.findAll({
            where: {
                id: {
                    [Op.in]: productIdList
                }
            }
        })
        logger.info(`All product count ${products.length} to be update stock count`)
        for (const iterator of products) {
            iterator.update({
                stock_count: literal(`(
            SELECT COUNT(card.card_number)
            FROM card
            WHERE card.productId =${iterator.id} AND card.saleLineId IS NULL
          )`)
            })
        }
    } catch (error) {
        logger.error(`Cannot find all product with error ${error}`)
    }
};

const findProductCodeFromProductId = async (productIdList) => {
    try {
        const productCodeList = await Product.findAll({
            attributes: ['id', 'pro_id'],
            where: {
                id: { [Op.in]: productIdList }
            }
        })
        logger.info(`Product list found ${productCodeList.length} \n ${JSON.stringify(productCodeList)}`)
        return productCodeList;
    } catch (error) {
        logger.log(`An error occured during find product_code ${error}`)
    }
}
module.exports = {
    updateProductCountById,
    updateProductCountGroup,
    findProductCodeFromProductId
}