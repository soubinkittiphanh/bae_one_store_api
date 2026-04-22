const { literal, Op } = require("sequelize");
const logger = require("../api/logger");
const Product = require('../models').product;
const Db = require('../config/dbcon');
const dbAsync = require('../config/dbconAsync');
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

// ======================= for image upload operation ================
const createProd = async (req, imagesObj) => {
    // Get the current date and time
    let date = new Date();
    // Convert the date and time to format
    let mysqlDateTime = date.getFullYear() + '-' +
        ('00' + (date.getMonth() + 1)).slice(-2) + '-' +
        ('00' + date.getDate()).slice(-2) + ' ' +
        ('00' + date.getHours()).slice(-2) + ':' +
        ('00' + date.getMinutes()).slice(-2) + ':' +
        ('00' + date.getSeconds()).slice(-2);
    logger.info("===> sql time " + mysqlDateTime); // Outputs: YYYY-MM-DD HH:MM:SS
    logger.info("*************** CREATE PRODUCT  ***************");
    logger.info(`*************** CREATE PRODUCT SERVICE 1 ${req} ***************`);
    logger.info(`*************** CREATE PRODUCT SERVICE 2 ${JSON.stringify(req.body)} ***************`);
    logger.info(`*************Payload: ${req.body.FORM}*****************`);
    logger.info(req.body.FORM);
    const body = JSON.parse(req.body.FORM);
    const pro_cat = body.pro_category;
    let pro_id = body.pro_id;
    const pro_name = body.pro_name;
    const pro_price = body.pro_price;
    const pro_desc = body.pro_desc;
    const pro_status = +body.pro_status;
    const image_path = imagesObj;
    const costPrice = body.pro_cost_price;
    const timestamps = new Date();
    const mysqlDatetime = timestamps.toISOString().slice(0, 19).replace('T', ' ');
    const barCode = body.barCode;
    const receiveUnitId = body.receiveUnitId;
    const stockUnitId = body.stockUnitId;
    const baseUnitId = body.baseUnitId;
    const minStock = body.minStock;
    const costCurrencyId = body.costCurrencyId;
    const saleCurrencyId = body.saleCurrencyId;
    const retail_percent = body.pro_retail_price || 0.0;
    const locking_session_id = Date.now()
    const isActive = body.isActive;
    const companyId = body.companyId;
    let sqlComImages = 'INSERT INTO image_path(pro_id, img_name, img_path,createdAt,updateTimestamp,productId )VALUES';
    logger.info("************* CREATE PRODUCT *****************");
    logger.info(`*************Payload: ${image_path} *****************`);/// test upload
    //*****************  QUERY LAST PRODUCT ID SQL  *****************//
    try {
        Db.query('SELECT MAX(pro_id) AS ID FROM product HAVING MAX(pro_id) IS NOT NULL', (er, re) => {
            logger.info("=====> Processing product db");
            if (er) {
                throw new Error(`productservice create product fail #####0001 ${er}`);
            }

            if (re.length < 1) pro_id = 1000;
            else pro_id = parseInt(re[0]['ID']) + 1
            //     const sqlCom = `INSERT INTO product(pro_category, pro_id, pro_name, pro_price, pro_desc, pro_status,retail_cost_percent,cost_price,
            //     locking_session_id,createdAt,updateTimestamp,minStock,barCode,receiveUnitId,stockUnitId,costCurrencyId,saleCurrencyId,isActive,companyId)
            // VALUES('${pro_cat}','${pro_id}',"${pro_name}",'${pro_price}',"${pro_desc}",'${pro_status}','${retail_percent}','${costPrice}',${locking_session_id},'${mysqlDateTime}','${mysqlDateTime}',${minStock},'${barCode}',${receiveUnitId},${stockUnitId},${costCurrencyId},${saleCurrencyId},${isActive},${companyId});`

            const sqlCom = `
  INSERT INTO product (
    pro_category, pro_id, pro_name, pro_price, pro_desc, pro_status, 
    retail_cost_percent, cost_price, locking_session_id, createdAt, 
    updateTimestamp, minStock, barCode, receiveUnitId, stockUnitId, baseUnitId,
    costCurrencyId, saleCurrencyId, isActive, companyId
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

            // Values array to pass into the query
            const values = [
                pro_cat,
                pro_id,
                pro_name,
                pro_price,
                pro_desc,
                pro_status,
                retail_percent,
                costPrice,
                locking_session_id,
                mysqlDateTime,
                mysqlDateTime,
                minStock,
                barCode,
                receiveUnitId,
                stockUnitId,
                baseUnitId,
                costCurrencyId,
                saleCurrencyId,
                isActive,
                companyId
            ];
            //*****************  INSERT PRODUCT SQL  *****************//
            logger.info("SQL CREATE PRODUCT SERVICE: " + sqlCom);
            Db.query(sqlCom, values, (er, re) => {
                logger.info("Execute:=>");
                if (er) {
                    throw new Error(`productservice create product fail #####0002 ${er}`);
                } else if (re) {

                    const productId = re.insertId;
                    logger.warn(`${productId} create product response ${JSON.stringify(re)}`)
                    logger.warn(`Image len ${image_path.length}`)
                    if (image_path.length > 0) {
                        image_path.forEach((i, idx, element) => {
                            if (idx === element.length - 1) sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}');`;
                            else sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}'),`;
                        });
                        //*****************  INSERT IMAGES SQL  *****************//
                        Db.query(sqlComImages, (er, re) => {
                            logger.warn(`sql command ${sqlComImages}`)
                            if (er) throw new Error(`productservice create product fail #####0003 ${er}`);
                            updateImageProductId()
                        });
                    }
                }
            })
        })
    } catch (error) {
        logger.error(`Create product service error ${error}`)
        throw new Error(`productservice create product fail 0001 ${error}`);
    }

}

// ======================= for image upload operation ================
const createProdV1 = async (req, imagesObj) => {
    try {
        logger.info("*************** CREATE PRODUCT (Sequelize) ***************");
        const body = JSON.parse(req.body.FORM);
        const userId = req.user ? req.user.id : 1;

        // Query last product pro_id
        let lastId = await Product.max('pro_id');
        let pro_id = lastId ? parseInt(lastId) + 1 : 1000;

        const productData = {
            pro_category: body.pro_category,
            pro_id: pro_id,
            pro_name: body.pro_name || '',
            pro_price: parseFloat(body.pro_price) || 0,
            pro_desc: body.pro_desc || '',
            pro_status: body.pro_status == 1,
            retail_cost_percent: parseFloat(body.pro_retail_price) || 0,
            cost_price: parseFloat(body.pro_cost_price) || 0,
            locking_session_id: String(Date.now()),
            minStock: parseInt(body.minStock) || 0,
            barCode: body.barCode || '',
            receiveUnitId: parseInt(body.receiveUnitId) || null,
            stockUnitId: parseInt(body.stockUnitId) || null,
            baseUnitId: parseInt(body.baseUnitId) || null,
            costCurrencyId: parseInt(body.costCurrencyId) || null,
            saleCurrencyId: parseInt(body.saleCurrencyId) || null,
            isActive: body.isActive == 1,
            validateStockOnSale: body.validateStockOnSale == 1,
            companyId: parseInt(body.companyId) || null,
            vendorName: body.vendorName || '',
            _category: body._category || 'product',
            duration_minutes: parseInt(body.duration_minutes) || 0,
            taxId: parseInt(body.taxId) || null
        };

        const newProduct = await Product.create(productData, {
            context: { userId, reason: 'Product created via Dashboard' }
        });

        if (imagesObj.length > 0) {
            const ImageModel = require('../models').image;
            const images = imagesObj.map(img => ({
                pro_id: pro_id,
                img_name: img.name,
                img_path: img.path,
                productId: newProduct.id
            }));
            await ImageModel.bulkCreate(images);
        }

        return newProduct.id;
    } catch (error) {
        logger.error(`Create product service error ${error}`);
        throw error;
    }
}


const updateProd = async (req, imagesObj) => {
    try {
        logger.info("*************** UPDATE PRODUCT (Sequelize) ***************");
        const body = JSON.parse(req.body.FORM);
        const userId = req.user ? req.user.id : 1;
        const pro_id = body.pro_id;

        // Step 1: Manage Images
        let serverImageIds = [];
        if (body.server_images) {
            serverImageIds = body.server_images.map(el => el.id);
        }

        const ImageModel = require('../models').image;
        if (serverImageIds.length > 0) {
            await ImageModel.destroy({
                where: {
                    pro_id: pro_id,
                    id: { [Op.notIn]: serverImageIds }
                }
            });
        } else {
            await ImageModel.destroy({ where: { pro_id: pro_id } });
        }

        // Step 2: Update Product via Sequelize to trigger hooks
        const product = await Product.findOne({ where: { pro_id: pro_id } });
        if (!product) throw new Error(`Product with pro_id ${pro_id} not found`);

        const updateData = {
            pro_category: body.pro_category,
            pro_name: body.pro_name,
            pro_price: parseFloat(body.pro_price),
            pro_desc: body.pro_desc,
            pro_status: body.pro_status == 1,
            retail_cost_percent: parseFloat(body.pro_retail_price) || 0,
            isActive: body.isActive == 1,
            validateStockOnSale: body.validateStockOnSale == 1,
            cost_price: parseFloat(body.pro_cost_price) || 0,
            minStock: parseInt(body.minStock) || 0,
            barCode: body.barCode,
            receiveUnitId: parseInt(body.receiveUnitId) || null,
            stockUnitId: parseInt(body.stockUnitId) || null,
            baseUnitId: parseInt(body.baseUnitId) || null,
            saleCurrencyId: parseInt(body.saleCurrencyId) || null,
            costCurrencyId: parseInt(body.costCurrencyId) || null,
            companyId: parseInt(body.companyId) || null,
            vendorName: body.vendorName,
            _category: body._category || 'product',
            duration_minutes: parseInt(body.duration_minutes) || 0,
            taxId: parseInt(body.taxId) || null
        };

        await product.update(updateData, {
            context: { userId, reason: 'Product updated via Dashboard' }
        });

        // Step 3: Insert new images
        if (imagesObj.length > 0) {
            const newImages = imagesObj.map(img => ({
                pro_id: pro_id,
                img_name: img.name,
                img_path: img.path,
                productId: product.id
            }));
            await ImageModel.bulkCreate(newImages);
        }

        updateImageProductId();
    } catch (error) {
        logger.error(`Update product service error ${error}`);
        throw error;
    }
}

const updateImageProductId = () => {
    Db.query(`
    UPDATE image_path
    INNER JOIN product ON image_path.pro_id = product.pro_id
    SET image_path.productId = product.id`, (er, re) => {
        if (er) {
            logger.error(`Cannot update image productId field with error ${er}`)
        } else {
            logger.info(`UPDATE image productId completed`)
        }
    })
}

const clearProductImage = async (sqlRemoveImages, params) => {
    try {
        const [rows, fields] = await dbAsync.execute(sqlRemoveImages, params);
        logger.info(`*********** ${new Date()} PROCESSED RECORD: ${rows.affectedRows}`);
        // return res.status(200).send("Transaction completed")
        logger.info(`Delete images completed`)
    } catch (error) {
        logger.error("Cannot get product sale count");
    }
}

module.exports = {
    updateProductCountById,
    updateProductCountGroup,
    findProductCodeFromProductId,
    updateProd,
    createProd,
    createProdV1
}