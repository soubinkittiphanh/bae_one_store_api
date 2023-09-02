const logger = require('../../api/logger');
const Db = require('../../config/dbcon');
const createProd = async (req, res) => {



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
    logger.info(`*************Payload: *****************`);
    logger.info(req.body.FORM);
    const body = JSON.parse(req.body.FORM);
    const pro_cat = body.pro_category;
    let pro_id = body.pro_id;
    const pro_name = body.pro_name;
    const pro_price = body.pro_price;
    const pro_desc = body.pro_desc;
    const pro_status = +body.pro_status;
    const image_path = req.body.imagesObj;
    const outlet = body.outlet
    const costPrice = body.pro_cost_price;
    const createdAt = body.createdAt;
    const barCode = body.barCode;
    const receiveUnitId = body.receiveUnitId;
    const stockUnitId = body.stockUnitId;
    const minStock = body.minStock;
    const retail_percent = body.pro_retail_price || 0.0;
    const locking_session_id = Date.now()
    logger.info(" outlet: ", outlet);
    // return res.send("Okay")
    let sqlComImages = 'INSERT INTO image_path(pro_id, img_name, img_path)VALUES';
    logger.info("************* CREATE PRODUCT *****************");
    logger.info(`*************Payload: ${image_path} *****************`);/// test upload
    //*****************  QUERY LAST PRODUCT ID SQL  *****************//
    Db.query('SELECT MAX(pro_id) AS ID FROM product HAVING MAX(pro_id) IS NOT NULL', (er, re) => {
        logger.info("=====> Processing product db");
        if (er) return res.send("Error: " + er)
        if (re.length < 1) pro_id = 1000;
        else pro_id = parseInt(re[0]['ID']) + 1
        image_path.forEach((i, idx, element) => {
            logger.info("Element len: " + element.length);
            logger.info("Element name: " + i.name);
            logger.info("Element i: " + i);
            logger.info("Element idx: " + idx);
            if (idx === element.length - 1) sqlComImages += `(${pro_id},'${i.name}','${i.path}');`;
            else sqlComImages += `(${pro_id},'${i.name}','${i.path}'),`;

        });
        const sqlCom = `INSERT INTO product(pro_category, pro_id, pro_name, pro_price, pro_desc, pro_status,retail_cost_percent,outlet,cost_price,
            locking_session_id,createdAt,updateTimestamp,minStock,barCode,receiveUnitId,stockUnitId)
        VALUES('${pro_cat}','${pro_id}','${pro_name}','${pro_price}','${pro_desc}','${pro_status}','${retail_percent}','${outlet}','${costPrice}',${locking_session_id},'${mysqlDateTime}','${mysqlDateTime}',${minStock},'${barCode}',${receiveUnitId},${stockUnitId});`
        //*****************  INSERT PRODUCT SQL  *****************//
        logger.info("SQL CREATE PRODUCT: " + sqlCom);
        Db.query(sqlCom, (er, re) => {
            logger.info("Execute:=>");
            if (er) {
                // res.status(503).({"Error":er});
                res.status(201).send('Error ' + er);
            } else if (re) {
                //*****************  INSERT IMAGES SQL  *****************//
                Db.query(sqlComImages, (er, re) => {
                    if (er) return res.status(201).send("Error: " + er);
                    res.status(200).send("Transaction completed");
                });
            }
        })
    })

}
const updateProd = async (req, res) => {
    logger.info("*************** UPDATE PRODUCT  ***************");
    logger.info(`*************Payload: *****************`);
    logger.info(req.body.FORM);
    const body = JSON.parse(req.body.FORM);
    const pro_cat = body.pro_category;
    let pro_id = body.pro_id;
    const pro_name = body.pro_name;
    const pro_price = body.pro_price;
    const pro_desc = body.pro_desc;
    const pro_status = +body.pro_status;
    const image_path = req.body.imagesObj;
    const cost_price = body.pro_cost_price;
    const outlet = body.outlet;
    const minStock = body.minStock;
    const barCode = body.barCode;
    const receiveUnitId = body.receiveUnitId;
    const stockUnitId = body.stockUnitId;
    logger.info('cost ' + cost_price);
    logger.info('outlet ' + outlet);
    const retail_percent = body.pro_retail_price || 0.0;
    let sqlComImages = 'INSERT INTO image_path(pro_id, img_name, img_path)VALUES';
    const sqlCom = `UPDATE product SET pro_category='${pro_cat}', pro_name='${pro_name}', pro_price='${pro_price}', pro_desc='${pro_desc}', pro_status='${pro_status}',retail_cost_percent='${retail_percent}',cost_price='${cost_price}',outlet='${outlet}',minStock=${minStock},barCode='${barCode}',receiveUnitId=${receiveUnitId},stockUnitId=${stockUnitId} WHERE pro_id='${pro_id}'`
    logger.info("************* UPDATE PRODUCT *****************");
    logger.info(`*************Payload: ${req.body.imagesObj} *****************`);
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send('Error: ' + er)

        if (image_path.length < 1) return res.send('Transaction completed');
        image_path.forEach((i, idx, element) => {
            logger.info("Element len: " + element.length);
            logger.info("Element name: " + i.name);
            logger.info("Element i: " + i);
            logger.info("Element idx: " + idx);
            if (idx === element.length - 1) sqlComImages += `(${pro_id},'${i.name}','${i.path}');`;
            else sqlComImages += `(${pro_id},'${i.name}','${i.path}'),`;

        });
        //*****************  INSERT IMAGES SQL  *****************//
        Db.query(sqlComImages, (er, re) => {
            if (er) return res.send("Error: naja :-) ໂປແກມເມີ ກາກ.... " + er);
            res.send("Transaction completed");
        });

    })
}

const fetchProd = async (req, res) => {
    logger.info("*************** FETCH PRODUCT ***************");
    logger.info(`*************Payload: *****************ss`);

    const sqlCom = `
    SELECT DISTINCT p.id,p.pro_id,p.minStock,p.barCode,p.receiveUnitId,p.stockUnitId,p.pro_name,p.pro_category,
    p.pro_price,p.pro_status,p.cost_price,c.categ_name,IFNULL(i.img_name,'No image') AS img_name,i.img_path,
    p.stock_count AS card_count ,IFNULL(s.cnt,0) AS sale_count, o.name AS outlet_name
    FROM product p 
    LEFT JOIN category c ON c.categ_id=p.pro_category
    LEFT JOIN outlet o ON o.id = p.outlet
    LEFT JOIN image_path i ON i.pro_id=p.pro_id
    LEFT JOIN  (SELECT IFNULL(COUNT(pro_id),0) AS cnt,pro_id FROM card_sale GROUP BY pro_id ) s ON s.pro_id=p.pro_id 
    GROUP BY p.pro_id
    ORDER BY p.pro_price;`
    // const sqlCom = `SELECT DISTINCT p.*,c.categ_name,IFNULL(i.img_name,'No image') AS img_name,i.img_path,
    // p.stock_count AS card_count ,IFNULL(s.cnt,0) AS sale_count, o.name AS outlet_name
    // FROM product p 
    // LEFT JOIN category c ON c.categ_id=p.pro_category
    // LEFT JOIN outlet o ON o.id = p.outlet
    // LEFT JOIN image_path i ON i.pro_id=p.pro_id
    // LEFT JOIN  (SELECT IFNULL(COUNT(pro_id),0) AS cnt,pro_id FROM card_sale GROUP BY pro_id ) s ON s.pro_id=p.pro_id ORDER BY p.pro_price;`
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send('SQL ' + er)
        res.send(re)
    })
}
const fetchProductFromLocation = async (req, res) => {
    const {locationId} = req.params
    const sqlCom = `SELECT DISTINCT
    p.id,
    p.pro_id,
    p.minStock,
    p.barCode,
    p.receiveUnitId,
    p.stockUnitId,
    p.pro_name,
    p.pro_category,
    p.pro_price,
    p.pro_status,
    p.cost_price,
    c.categ_name,
    IFNULL(i.img_name, 'No image') AS img_name,
    i.img_path,
    IFNULL(c.stock, 0) AS card_count,
    o.name AS outlet_name
FROM
    product p
LEFT JOIN(
    SELECT
        COUNT(c.card_number) AS stock,
        c.productId
    FROM
        card c
    WHERE
        c.card_isused = 0 AND c.locationId = ${locationId}
    GROUP BY
        c.productId
) c
ON
    c.productId = p.id
LEFT JOIN category c ON
    c.categ_id = p.pro_category
LEFT JOIN outlet o ON
    o.id = p.outlet
LEFT JOIN image_path i ON
    i.pro_id = p.pro_id
GROUP BY
    p.pro_id
ORDER BY
    p.pro_price;`
    Db.query(sqlCom,(er,re)=>{
        if(er) return res.send('SQL '+er)
        res.send(re)
    })

}
const fetchProdMobile = async (req, res) => {
    logger.info("*************** FETCH PRODUCT ***************");
    logger.info(`*************Payload: *****************ss`);
    const sqlCom = `SELECT p.*,c.categ_name,IFNULL(i.img_name,'No image') AS img_name,i.img_path,
    p.stock_count AS card_count ,IFNULL(s.cnt,0) AS sale_count, o.name AS outlet_name
    FROM product p 
    LEFT JOIN category c ON c.categ_id=p.pro_category
    LEFT JOIN outlet o ON o.id = p.outlet
    LEFT JOIN image_path i ON i.pro_id=p.pro_id
    LEFT JOIN  (SELECT IFNULL(COUNT(pro_id),0) AS cnt,pro_id FROM card_sale GROUP BY pro_id ) s ON s.pro_id=p.pro_id 
    GROUP BY p.pro_id
    ORDER BY p.pro_price;`;
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send('SQL ' + er)
        res.send(re)
    })
}
const fetchProdId = async (req, res) => {
    logger.info("*************** FETCH PRODUCT BY ID  ***************");
    logger.info(`*************Payload: *****************`);
    const pro_id = req.body.proid;
    Db.query(`SELECT p.*,i.img_name,i.img_path FROM product p 
    LEFT JOIN image_path i ON i.pro_id=p.pro_id 
    WHERE p.pro_id=${pro_id}`, (er, re) => {
        if (er) return res.send('SQL ' + er)
        res.send(re)
    })
    //1635062891981300
}

module.exports = {
    createProd,
    updateProd,
    fetchProd,
    fetchProdId,
    fetchProdMobile,
    fetchProductFromLocation,
}