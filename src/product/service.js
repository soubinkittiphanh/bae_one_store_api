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
    updateTimestamp, minStock, barCode, receiveUnitId, stockUnitId, 
    costCurrencyId, saleCurrencyId, isActive, companyId
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
    return new Promise((resolve, reject) => {
        // Get the current date and time
        let date = new Date();
        // Convert the date and time to format
        let mysqlDateTime = date.getFullYear() + '-' +
            ('00' + (date.getMonth() + 1)).slice(-2) + '-' +
            ('00' + date.getDate()).slice(-2) + ' ' +
            ('00' + date.getHours()).slice(-2) + ':' +
            ('00' + date.getMinutes()).slice(-2) + ':' +
            ('00' + date.getSeconds()).slice(-2);
        logger.info("===> sql time " + mysqlDateTime);
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
        const locking_session_id = Date.now();
        const isActive = body.isActive;
        const validateStockOnSale = body.validateStockOnSale;
        const companyId = body.companyId;
        const vendorName = body.vendorName;
        const category = body._category; // 'product' or 'service'
        const durationMinutes = body.duration_minutes || 0;
        
        // ✅ ADD: Extract tax information
        const taxId = body.taxId || null; // Tax ID from frontend
        const calculatedTaxAmount = body.calculatedTaxAmount || 0;
        const totalWithTax = body.totalWithTax || body.pro_price;

        let sqlComImages = 'INSERT INTO image_path(pro_id, img_name, img_path, createdAt, updateTimestamp, productId) VALUES';

        //*****************  QUERY LAST PRODUCT ID SQL  *****************//
        try {
            Db.query('SELECT MAX(pro_id) AS ID FROM product HAVING MAX(pro_id) IS NOT NULL', (er, re) => {
                logger.info("=====> Processing product db");
                if (er) {
                    reject(`productservice create product fail #####0001 ${er}`);
                }

                if (re.length < 1) pro_id = 1000;
                else pro_id = parseInt(re[0]['ID']) + 1;

                // ✅ FIXED: Added taxId field to the INSERT statement
                const sqlCom = `
                    INSERT INTO product (
                        pro_category, pro_id, pro_name, pro_price, pro_desc, pro_status, 
                        retail_cost_percent, cost_price, locking_session_id, createdAt, 
                        updateTimestamp, minStock, barCode, receiveUnitId, stockUnitId,baseUnitId, 
                        costCurrencyId, saleCurrencyId, isActive, validateStockOnSale, 
                        companyId, vendorName, _category, duration_minutes, taxId
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                `;

                // ✅ FIXED: Values array with proper null/undefined handling and added taxId
                const values = [
                    pro_cat || null,
                    pro_id || null,
                    pro_name || '',
                    parseFloat(pro_price) || 0,
                    pro_desc || '',
                    isNaN(pro_status) ? 1 : pro_status,
                    parseFloat(retail_percent) || 0,
                    parseFloat(costPrice) || 0,
                    locking_session_id,
                    mysqlDateTime,
                    mysqlDateTime,
                    parseInt(minStock) || 0,
                    barCode || '',
                    parseInt(receiveUnitId) || null,
                    parseInt(stockUnitId) || null,
                    parseInt(baseUnitId) || null,
                    parseInt(costCurrencyId) || null,
                    parseInt(saleCurrencyId) || null,
                    isActive ? 1 : 0,
                    validateStockOnSale ? 1 : 0,
                    parseInt(companyId) || null,
                    vendorName || '',
                    category || 'product',
                    parseInt(durationMinutes) || 0,
                    parseInt(taxId) || null  // ✅ ADD: Tax ID
                ];

                // ✅ ADD: Log the values for debugging
                logger.info("Values being inserted:", JSON.stringify(values));

                //*****************  INSERT PRODUCT SQL  *****************//
                logger.info("SQL CREATE PRODUCT SERVICE: " + sqlCom);
                Db.query(sqlCom, values, (er, re) => {
                    if (er) {
                        logger.error("Database insertion error:", er);
                        reject(`productservice create product fail #####0002 ${er}`);
                    } else if (re) {
                        const productId = re.insertId;
                        logger.warn(`${productId} create product response ${JSON.stringify(re)}`);
                        logger.warn(`Image len ${image_path.length}`);

                        if (image_path.length > 0) {
                            image_path.forEach((i, idx, element) => {
                                if (idx === element.length - 1)
                                    sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}');`;
                                else
                                    sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}'),`;
                            });
                            //*****************  INSERT IMAGES SQL  *****************//
                            Db.query(sqlComImages, (er, re) => {
                                if (er) reject(`productservice create product fail #####0003 ${er}`);
                                else updateImageProductId();
                            });
                        }

                        // Resolve with the productId
                        resolve(productId);
                    }
                });
            });
        } catch (error) {
            logger.error(`Create product service error ${error}`);
            reject(`productservice create product fail 0001 ${error}`);
        }
    });
}


const updateProd = async (req, imagesObj) => {
    logger.info("*************** UPDATE PRODUCT  ***************");
    logger.info(`*************Payload: *****************`);
    logger.info(req.body.FORM);
    const body = JSON.parse(req.body.FORM);
    const pro_cat = body.pro_category;
    let pro_id = body.pro_id;
    const productId = body.productId;
    const pro_name = body.pro_name;
    const pro_price = body.pro_price;
    const pro_desc = body.pro_desc;
    const pro_status = +body.pro_status;
    const image_path = imagesObj;
    const cost_price = body.pro_cost_price;
    const minStock = body.minStock;
    const barCode = body.barCode;
    const receiveUnitId = body.receiveUnitId;
    const stockUnitId = body.stockUnitId;
    const costCurrencyId = body.costCurrencyId;
    const saleCurrencyId = body.saleCurrencyId;
    const isActive = body.isActive;
    const validateStockOnSale = body.validateStockOnSale;
    const companyId = body.companyId;
    const vendorName = body.vendorName;
    const taxId = body.taxId;
    const timestamps = new Date();
    const mysqlDatetime = timestamps.toISOString().slice(0, 19).replace('T', ' ');
    const retail_percent = body.pro_retail_price || 0.0;
    const category = body._category || 'product'; // 'product' or 'service'
    const durationMinutes = body.duration_minutes || 0; // default to 0 if not provided
    logger.warn(`PRODUCT ${JSON.stringify(body)}`);
    let serverImageIds = []
    if (body.server_images) {
        serverImageIds = body.server_images.map(el => el.id);
    }


    // If there are no images on the server, you can avoid using NOT IN altogether
    let sqlRemoveImages;
    if (serverImageIds.length > 0) {
        logger.warn(`ID IMAGE TO BE DELETED ${serverImageIds} PRODUT ID: ${pro_id}`)
        sqlRemoveImages = `DELETE FROM image_path WHERE pro_id = ? AND id NOT IN (${serverImageIds.map(() => '?').join(', ')})`;

    } else {
        sqlRemoveImages = `DELETE FROM image_path WHERE pro_id = ?`;  // If no images, just remove based on pro_id
    }
    logger.info(`remove image sql statement ${sqlRemoveImages}`);
    // Use parameterized queries for safer handling
    let params = [pro_id, ...serverImageIds];

    // Execute the query using a safe method (e.g., MySQL's connection.query)
    await clearProductImage(sqlRemoveImages, params)


    let sqlComImages = 'INSERT INTO image_path(pro_id, img_name, img_path,createdAt,updateTimestamp,productId)VALUES';
    // const sqlCom = `UPDATE product SET pro_category='${pro_cat}', pro_name="${pro_name}", pro_price='${pro_price}', 
    // pro_desc="${pro_desc}", pro_status='${pro_status}',retail_cost_percent='${retail_percent}',isActive=${isActive},
    // cost_price='${cost_price}',minStock=${minStock},barCode='${barCode}',
    // receiveUnitId=${receiveUnitId},stockUnitId=${stockUnitId},saleCurrencyId=${saleCurrencyId},costCurrencyId=${costCurrencyId},companyId=${companyId}
    //  WHERE pro_id='${pro_id}'`
    const sqlCom = `
    UPDATE product 
    SET 
      pro_category = ?, 
      pro_name = ?, 
      pro_price = ?, 
      pro_desc = ?, 
      pro_status = ?, 
      retail_cost_percent = ?, 
      isActive = ?, 
      validateStockOnSale = ?, 
      cost_price = ?, 
      minStock = ?, 
      barCode = ?, 
      receiveUnitId = ?, 
      stockUnitId = ?, 
      saleCurrencyId = ?, 
      costCurrencyId = ?, 
      companyId = ?,
      vendorName = ?,
      _category = ?,
      duration_minutes = ?,
      taxId = ?
    WHERE pro_id = ?;
  `;


    // Values array for parameterized query
    const values = [
        pro_cat,
        pro_name,
        pro_price,
        pro_desc,
        pro_status,
        retail_percent,
        isActive,
        validateStockOnSale,
        cost_price,
        minStock,
        barCode,
        receiveUnitId,
        stockUnitId,
        saleCurrencyId,
        costCurrencyId,
        companyId,
        vendorName,
        category,
        durationMinutes,
        taxId,
        pro_id
    ];

    logger.info(`************* UPDATE PRODUCT ${sqlCom} *****************`);
    logger.info(`Values array: ${JSON.stringify(values)}` );
    logger.info(`************* COMMAND ${JSON.stringify(sqlComImages)} *****************`);
    logger.info(`*************Payload: ${JSON.stringify(imagesObj)} *****************`);
    logger.info("Final category:", category);

    Db.query(sqlCom, values, (er, re) => {
        if (er) throw new Error(`Cannot update product code ####0001 ${er} `);
        if (image_path.length < 1) return // Nothing to do
        image_path.forEach((i, idx, element) => {
            if (idx === element.length - 1) sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}');`;
            else sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}'),`;

        });
        logger.warn(`IMAGE SQL: ${sqlComImages}`)
        //*****************  INSERT IMAGES SQL  *****************//
        Db.query(sqlComImages, (er, re) => {
            if (er) throw new Error("Cannot update product code ####0002 ");
            updateImageProductId()
        });

    })
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