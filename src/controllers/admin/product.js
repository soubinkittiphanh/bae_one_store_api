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
  const baseUnitId = body.baseUnitId;
  // return res.send("Okay")
  // const timestamps = new Date();
  let sqlComImages = 'INSERT INTO image_path(pro_id, img_name, img_path,createdAt,updateTimestamp,productId )VALUES';
  logger.info("************* CREATE PRODUCT *****************");
  logger.info(`*************Payload: ${image_path} *****************`);/// test upload
  //*****************  QUERY LAST PRODUCT ID SQL  *****************//
  Db.query('SELECT MAX(pro_id) AS ID FROM product HAVING MAX(pro_id) IS NOT NULL', (er, re) => {
    logger.info("=====> Processing product db");
    if (er) return res.send("Error: " + er)
    if (re.length < 1) pro_id = 1000;
    else pro_id = parseInt(re[0]['ID']) + 1
    const sqlCom = `INSERT INTO product(pro_category, pro_id, pro_name, pro_price, pro_desc, pro_status,retail_cost_percent,cost_price,
            locking_session_id,createdAt,updateTimestamp,minStock,barCode,receiveUnitId,stockUnitId,baseUnitId,costCurrencyId,saleCurrencyId,isActive,companyId)
        VALUES('${pro_cat}','${pro_id}','${pro_name}','${pro_price}','${pro_desc}','${pro_status}','${retail_percent}','${costPrice}',${locking_session_id},'${mysqlDateTime}','${mysqlDateTime}',${minStock},'${barCode}',${receiveUnitId},${stockUnitId},${baseUnitId},${costCurrencyId},${saleCurrencyId},${isActive},${companyId});`
    //*****************  INSERT PRODUCT SQL  *****************//
    logger.info("SQL CREATE PRODUCT CONTROLLER: " + sqlCom);
    Db.query(sqlCom, (er, re) => {
      logger.info("Execute:=>");
      if (er) {
        // res.status(503).({"Error":er});
        res.status(201).send('Error ' + er);
      } else if (re) {
        const productId = re.insertId;
        image_path.forEach((i, idx, element) => {
          if (idx === element.length - 1) sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}');`;
          else sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}'),`;
        });
        //*****************  INSERT IMAGES SQL  *****************//
        Db.query(sqlComImages, (er, re) => {
          if (er) return res.status(201).send("Error: " + er);
          res.status(200).send("Transaction completed");
          //-------- update image producId ----
          updateImageProductId()
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
  const productId = body.productId;
  const pro_name = body.pro_name;
  const pro_price = body.pro_price;
  const pro_desc = body.pro_desc;
  const pro_status = +body.pro_status;
  const image_path = req.body.imagesObj;
  const cost_price = body.pro_cost_price;
  const minStock = body.minStock;
  const barCode = body.barCode;
  const receiveUnitId = body.receiveUnitId;
  const stockUnitId = body.stockUnitId;
  const costCurrencyId = body.costCurrencyId;
  const saleCurrencyId = body.saleCurrencyId;
  const isActive = body.isActive;
  const companyId = body.companyId;
  const baseUnitId = body.baseUnitId;
  logger.info('cost ' + cost_price);
  const timestamps = new Date();
  const mysqlDatetime = timestamps.toISOString().slice(0, 19).replace('T', ' ');
  console.log(mysqlDatetime);

  const retail_percent = body.pro_retail_price || 0.0;
  let sqlComImages = 'INSERT INTO image_path(pro_id, img_name, img_path,createdAt,updateTimestamp,productId)VALUES';
  const sqlCom = `UPDATE product SET pro_category='${pro_cat}', pro_name='${pro_name}', pro_price='${pro_price}', 
    pro_desc='${pro_desc}', pro_status='${pro_status}',retail_cost_percent='${retail_percent}',isActive=${isActive},
    cost_price='${cost_price}',minStock=${minStock},barCode='${barCode}',
    receiveUnitId=${receiveUnitId},stockUnitId=${stockUnitId},baseUnitId=${baseUnitId},saleCurrencyId=${saleCurrencyId},costCurrencyId=${costCurrencyId},companyId=${companyId}
     WHERE pro_id='${pro_id}'`
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
      if (idx === element.length - 1) sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}');`;
      else sqlComImages += `(${pro_id},'${i.name}','${i.path}','${mysqlDatetime}','${mysqlDatetime}','${productId}'),`;

    });
    logger.warn(`IMAGE SQL: ${sqlComImages}`)
    //*****************  INSERT IMAGES SQL  *****************//
    Db.query(sqlComImages, (er, re) => {
      if (er) return res.send("Error: naja :-) ໂປແກມເມີ ກາກ.... " + er);
      res.send("Transaction completed");
      //-------- update image producId ----
      updateImageProductId()
    });

  })
}

const fetchProd = async (req, res) => {
  logger.info("*************** FETCH PRODUCT ***************");
  logger.info(`*************Payload: *****************ss`);

  const sqlCom = `
    SELECT DISTINCT p.id,p.pro_id,p.minStock,p.barCode,p.receiveUnitId,p.stockUnitId,p.pro_name,p.pro_category,
    p.pro_price,p.pro_status,p.cost_price,c.categ_name,IFNULL(i.img_name,'No image') AS img_name,i.img_path,
    p.stock_count AS card_count ,IFNULL(s.cnt,0) AS sale_count
    FROM product p 
    LEFT JOIN category c ON c.categ_id=p.pro_category
    LEFT JOIN image_path i ON i.pro_id=p.pro_id
    LEFT JOIN  (SELECT IFNULL(COUNT(pro_id),0) AS cnt,pro_id FROM card_sale GROUP BY pro_id ) s ON s.pro_id=p.pro_id 
    GROUP BY p.pro_id
    ORDER BY p.pro_price;`
  // const sqlCom = `SELECT DISTINCT p.*,c.categ_name,IFNULL(i.img_name,'No image') AS img_name,i.img_path,
  // p.stock_count AS card_count ,IFNULL(s.cnt,0) AS sale_count
  // FROM product p 
  // LEFT JOIN category c ON c.categ_id=p.pro_category

  // LEFT JOIN image_path i ON i.pro_id=p.pro_id
  // LEFT JOIN  (SELECT IFNULL(COUNT(pro_id),0) AS cnt,pro_id FROM card_sale GROUP BY pro_id ) s ON s.pro_id=p.pro_id ORDER BY p.pro_price;`
  Db.query(sqlCom, (er, re) => {
    if (er) return res.send('SQL ' + er)
    res.send(re)
  })
}

const fetchProductFromLocation = async (req, res) => {
  const { locationId } = req.params;
  const { include, companyId, grade, isActive = true } = req.query;

  // Base SQL for products (without priceList join to avoid duplication)
  let sqlCom = `SELECT DISTINCT
    p.id,
    p.pro_id,
    p.minStock,
    p.barCode,
    p.receiveUnitId,
    p.stockUnitId,
    p.pro_name,
    p._category,
    p.vendorName,
    p.pro_category,
    p.pro_price,
    p.pro_status,
    p.cost_price,
    p.saleCurrencyId,
    p.costCurrencyId,
    p.validateStockOnSale,
    p.taxId,
    p.pro_desc,
    p.duration_minutes,
    p.retail_cost_percent,
    p.locking_session_id,
    p.isActive,
    t.categ_name,
    co.name as co_name,
    co.id as companyId,
    IFNULL(i.img_name, 'No image') AS img_name,
    i.img_path,
    IFNULL(c.stock, 0) AS card_count`;

  // Add tax fields if tax is included
  if (include && include.includes('tax')) {
    sqlCom += `,
    tax.id as tax_id,
    tax.name as tax_name,
    tax.rate as tax_rate,
    tax.taxType as tax_type,
    tax.code as tax_code,
    tax.description as tax_description,
    tax.isActive as tax_isActive,
    tax.isDefault as tax_isDefault`;
  }

  sqlCom += `
  FROM
    product p
  LEFT JOIN company co ON co.id = p.companyId
  LEFT JOIN(
    SELECT
      COUNT(c.card_number) AS stock,
      c.productId
    FROM
      card c
    WHERE
      c.card_isused = 0 AND c.locationId = ${locationId} AND c.isActive = 1
    GROUP BY
      c.productId
  ) c ON c.productId = p.id
  LEFT JOIN category t ON t.categ_id = p.pro_category
  LEFT JOIN image_path i ON i.pro_id = p.pro_id`;

  // Add tax join if tax is included
  if (include && include.includes('tax')) {
    sqlCom += `
  LEFT JOIN tax ON tax.id = p.taxId 
    AND tax.isActive = true 
    AND tax.effectiveFrom <= CURDATE()
    AND (tax.effectiveTo IS NULL OR tax.effectiveTo >= CURDATE())`;
  }

  if (isActive) {
    sqlCom += `
    WHERE p.isActive = true`;
  }

  // Add companyId filter if provided
  if (companyId) {
    sqlCom += ` AND p.companyId = ${parseInt(companyId)}`;
  }

  sqlCom += `
  GROUP BY p.pro_id
  ORDER BY p.id`;

  // Separate SQL for price lists (to handle multiple price lists per product)
  let priceListSql = '';
  if (include && include.includes('priceList')) {
    priceListSql = `SELECT 
      pl.productId,
      pl.id as priceList_id,
      pl.name as priceList_name,
      pl.grade as priceList_grade,
      pl.amount as priceList_amount,
      pl.type as priceList_type,
      pl.isActive as priceList_isActive,
      pl.currencyId as priceList_currencyId,
      pl.createdAt as priceList_createdAt,
      pl.updateTimestamp as priceList_updateTimestamp
    FROM priceList pl
    INNER JOIN product p ON p.id = pl.productId
    WHERE pl.isActive = true 
      AND p.isActive = true`;

    // Add companyId filter for price lists
    if (companyId) {
      priceListSql += ` AND p.companyId = ${parseInt(companyId)}`;
    }

    // Add grade filter if specified
    if (grade) {
      priceListSql += ` AND pl.grade = '${grade}'`;
    }

    priceListSql += ` ORDER BY pl.productId, pl.grade, pl.createdAt DESC`;
  }

  try {
    // Execute main product query
    Db.query(sqlCom, async (er, productResults) => {
      if (er) {
        console.error('SQL Error:', er);
        return res.status(500).json({
          success: false,
          message: 'Database error',
          error: er.message
        });
      }

      let priceListData = {};

      // Execute price list query if needed
      if (include && include.includes('priceList') && priceListSql) {
        try {
          const priceListResults = await new Promise((resolve, reject) => {
            Db.query(priceListSql, (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          // Group price lists by productId
          priceListData = priceListResults.reduce((acc, priceList) => {
            const productId = priceList.productId;
            if (!acc[productId]) {
              acc[productId] = [];
            }

            acc[productId].push({
              id: priceList.priceList_id,
              name: priceList.priceList_name,
              grade: priceList.priceList_grade,
              amount: priceList.priceList_amount,
              type: priceList.priceList_type,
              isActive: priceList.priceList_isActive,
              currencyId: priceList.priceList_currencyId,
              createdAt: priceList.priceList_createdAt,
              updateTimestamp: priceList.priceList_updateTimestamp
            });

            return acc;
          }, {});

        } catch (priceListError) {
          console.error('Price List Query Error:', priceListError);
          // Continue without price lists if there's an error
        }
      }

      // Transform results to include tax and priceList arrays
      const transformedResults = productResults.map(product => {
        const transformedProduct = {
          id: product.id,
          pro_id: product.pro_id,
          pro_name: product.pro_name,
          pro_price: product.pro_price,
          duration_minutes: product.duration_minutes || 0,
          pro_desc: product.pro_desc || '',
          pro_status: product.pro_status,
          img_path: product.img_path,
          retail_cost_percent: product.retail_cost_percent || 0,
          cost_price: product.cost_price,
          card_count: product.card_count || 0,
          minStock: product.minStock || 0,
          locking_session_id: product.locking_session_id,
          barCode: product.barCode,
          vendorName: product.vendorName,
          categ_name: product.categ_name,
          co_name: product.co_name,
          companyId: product.companyId,
          img_name: product.img_name,
          receiveUnitId: product.receiveUnitId,
          stockUnitId: product.stockUnitId,
          pro_category: product.pro_category,
          validateStockOnSale: product.validateStockOnSale,
          saleCurrencyId: product.saleCurrencyId,
          costCurrencyId: product.costCurrencyId,
          taxId: product.taxId,
          isActive: product.isActive,
          createdAt: null,
          updatedAt: null
        };

        // Add tax object if tax data is present
        if (include && include.includes('tax') && product.tax_id) {
          transformedProduct.tax = {
            id: product.tax_id,
            name: product.tax_name,
            rate: product.tax_rate,
            taxType: product.tax_type,
            code: product.tax_code,
            description: product.tax_description,
            isActive: product.tax_isActive,
            isDefault: product.tax_isDefault
          };
        } else {
          transformedProduct.tax = null;
        }

        // Add priceList array if priceList data is requested
        if (include && include.includes('priceList')) {
          transformedProduct.priceLists = priceListData[product.id] || [];

          // Calculate effective price based on the best applicable price list
          transformedProduct.effectivePrice = calculateEffectivePrice(
            product.pro_price,
            transformedProduct.priceLists,
            grade
          );

          // For backward compatibility, also include the first/best priceList as single object
          transformedProduct.priceList = transformedProduct.priceLists.length > 0
            ? transformedProduct.priceLists[0]
            : null;
        } else {
          transformedProduct.priceLists = [];
          transformedProduct.priceList = null;
          transformedProduct.effectivePrice = product.pro_price;
        }

        return transformedProduct;
      });

      res.status(200).json({
        success: true,
        data: transformedResults,
        count: transformedResults.length,
        filters: {
          locationId: parseInt(locationId),
          companyId: companyId ? parseInt(companyId) : null,
          grade: grade || null,
          include: include ? include.split(',') : []
        }
      });
    });
  } catch (error) {
    console.error('Error in fetchProductFromLocation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const fetchProductFromLocationV1 = async (req, res) => {
  const { locationId } = req.params;
  const { companyId, include, grade } = req.query;

  // Main product query - Updated to include tax fields
  const sqlCom = `
    SELECT DISTINCT
      p.id,
      p.pro_id,
      p.barCode,
      p.pro_name,
      p.pro_price,
      p.cost_price,
      p.pro_status,
      p.validateStockOnSale,
      p.saleCurrencyId,
      p.costCurrencyId,
      p.receiveUnitId,
      p.stockUnitId,
      p.baseUnitId,
      p.isActive,
      p.pro_category,
      p.taxId,
      t.name AS tax_name,
      t.rate AS tax_rate,
      t.code AS tax_code,
      t.taxType AS tax_type,
      co.id as companyId,
      IFNULL(i.img_name, 'No image') AS img_name,
      i.img_path,
      IFNULL(c.stock, 0) AS card_count
    FROM product p
    LEFT JOIN tax t ON p.taxId = t.id
    LEFT JOIN company co ON co.id = p.companyId
    LEFT JOIN (
      SELECT 
        COUNT(c.card_number) AS stock,
        c.productId
      FROM card c
      WHERE c.card_isused = 0 AND c.locationId = ? AND c.isActive = 1
      GROUP BY c.productId
    ) c ON c.productId = p.id
    LEFT JOIN image_path i ON i.pro_id = p.pro_id
    WHERE p.isActive = true
    ${companyId ? 'AND p.companyId = ?' : ''}
    GROUP BY p.pro_id
    ORDER BY p.id
  `;

  // Separate price list query (remains unchanged)
  let priceListSql = '';
  if (include && include.includes('priceList')) {
    priceListSql = `
      SELECT 
        pl.productId,
        pl.id as priceList_id,
        pl.name as priceList_name,
        pl.grade as priceList_grade,
        pl.amount as priceList_amount,
        pl.type as priceList_type,
        pl.isActive as priceList_isActive,
        pl.currencyId as priceList_currencyId,
        pl.createdAt as priceList_createdAt,
        pl.updateTimestamp as priceList_updateTimestamp
      FROM priceList pl
      INNER JOIN product p ON p.id = pl.productId
      WHERE pl.isActive = true 
        AND p.isActive = true
        ${companyId ? 'AND p.companyId = ?' : ''}
        ${grade ? 'AND pl.grade = ?' : ''}
      ORDER BY pl.productId, pl.grade, pl.createdAt DESC
    `;
  }

  try {
    const params = [locationId];
    if (companyId) params.push(parseInt(companyId));

    const productResults = await new Promise((resolve, reject) => {
      Db.query(sqlCom, params, (er, results) => {
        if (er) reject(er);
        else resolve(results);
      });
    });

    let priceListData = {};

    if (include && include.includes('priceList') && priceListSql) {
      try {
        const priceListParams = [];
        if (companyId) priceListParams.push(parseInt(companyId));
        if (grade) priceListParams.push(grade);

        const priceListResults = await new Promise((resolve, reject) => {
          Db.query(priceListSql, priceListParams, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

        priceListData = priceListResults.reduce((acc, priceList) => {
          const productId = priceList.productId;
          if (!acc[productId]) acc[productId] = [];
          acc[productId].push({
            id: priceList.priceList_id,
            name: priceList.priceList_name,
            grade: priceList.priceList_grade,
            amount: priceList.priceList_amount,
            type: priceList.priceList_type,
            isActive: priceList.priceList_isActive,
            currencyId: priceList.priceList_currencyId,
            createdAt: priceList.priceList_createdAt,
            updateTimestamp: priceList.priceList_updateTimestamp
          });
          return acc;
        }, {});
      } catch (priceListError) {
        console.error('Price List Query Error:', priceListError);
      }
    }

    // Transform results to include nested tax object and priceLists
    const finalResults = productResults.map(product => {
      const p = {
        ...product,
        // Create nested tax object
        tax: product.taxId ? {
          id: product.taxId,
          name: product.tax_name,
          rate: product.tax_rate,
          code: product.tax_code,
          taxType: product.tax_type
        } : null,
        // Add price lists if requested
        priceLists: (include && include.includes('priceList')) ? (priceListData[product.id] || []) : undefined,
        priceList: (include && include.includes('priceList'))
          ? (priceListData[product.id] && priceListData[product.id].length > 0 ? priceListData[product.id][0] : null)
          : undefined
      };

      // Remove flat tax fields from the root to keep it clean
      delete p.tax_name;
      delete p.tax_rate;
      delete p.tax_code;
      delete p.tax_type;

      return p;
    });

    res.status(200).json({
      success: true,
      data: finalResults,
      count: finalResults.length,
      filters: {
        locationId: parseInt(locationId),
        companyId: companyId ? parseInt(companyId) : null,
        grade: grade || null,
        include: include ? include.split(',') : []
      }
    });

  } catch (error) {
    console.error('Error in fetchProductFromLocationV1:', error);
    res.status(500).json({ success: false, message: 'Database error', error: error.message });
  }
};


// Helper function to calculate effective price based on price lists
function calculateEffectivePrice(basePrice, priceLists, requestedGrade = null) {
  if (!priceLists || priceLists.length === 0) {
    return basePrice;
  }

  // Filter price lists by requested grade if specified
  let applicablePriceLists = priceLists;
  if (requestedGrade) {
    applicablePriceLists = priceLists.filter(pl => pl.grade === requestedGrade);
  }

  // If no price lists match the requested grade, fall back to all price lists
  if (applicablePriceLists.length === 0) {
    applicablePriceLists = priceLists;
  }

  // Sort by priority: Direct price overrides first, then percentage adjustments
  // Also prioritize by creation date (newer first)
  applicablePriceLists.sort((a, b) => {
    // Priority order: Price type first, then Percent type
    if (a.type === 'Price' && b.type !== 'Price') return -1;
    if (a.type !== 'Price' && b.type === 'Price') return 1;

    // If same type, sort by creation date (newer first)
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Use the first (highest priority) price list
  const bestPriceList = applicablePriceLists[0];

  if (bestPriceList.type === 'Price') {
    // Direct price override
    return bestPriceList.amount;
  } else if (bestPriceList.type === 'Percent') {
    // Percentage adjustment
    return basePrice * (1 + bestPriceList.amount / 100);
  }

  return basePrice;
}


// Also create a separate Tax API controller
const fetchTaxes = async (req, res) => {
  const sqlCom = `SELECT 
    id,
    name,
    rate,
    taxType,
    code,
    description,
    isActive,
    isDefault,
    effectiveFrom,
    effectiveTo,
    createdAt,
    updatedAt
  FROM tax 
  WHERE isActive = true 
    AND effectiveFrom <= CURDATE()
    AND (effectiveTo IS NULL OR effectiveTo >= CURDATE())
  ORDER BY isDefault DESC, name ASC`;

  try {
    Db.query(sqlCom, (er, results) => {
      if (er) {
        console.error('SQL Error:', er);
        return res.status(500).json({
          success: false,
          message: 'Database error',
          error: er.message
        });
      }

      res.status(200).json({
        success: true,
        data: results,
        count: results.length
      });
    });
  } catch (error) {
    console.error('Error in fetchTaxes:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const fetchProdMobileV0 = async (req, res) => {
  logger.info("*************** FETCH PRODUCT ***************");
  logger.info(`*************Payload: *****************ss`);
  const sqlCom = `SELECT p.*,c.categ_name,IFNULL(i.img_name,'No image') AS img_name,i.img_path,
    p.stock_count AS card_count ,IFNULL(s.cnt,0) AS sale_count,
    p.cost_price,
    p._category,
    p.duration_minutes
    FROM product p 
    LEFT JOIN category c ON c.categ_id=p.pro_category
    LEFT JOIN image_path i ON i.pro_id=p.pro_id
    LEFT JOIN  (SELECT IFNULL(COUNT(pro_id),0) AS cnt,pro_id FROM card_sale GROUP BY pro_id ) s ON s.pro_id=p.pro_id 
    where p.isActive=true
    GROUP BY p.pro_id
    ORDER BY p.pro_price;`;
  Db.query(sqlCom, (er, re) => {
    if (er) return res.send('SQL ' + er)
    res.send(re)
  })
}
const fetchProdMobile = async (req, res) => {
  logger.info("*************** FETCH PRODUCT ***************");
  logger.info(`*************Payload: *****************ss`);
  const { locationId } = req.query;

  let cardCountSelect = 'p.stock_count AS card_count';
  let cardJoin = '';

  if (locationId) {
    const locId = parseInt(locationId);
    if (!isNaN(locId)) {
      cardCountSelect = 'IFNULL(c.stock, 0) AS card_count';
      cardJoin = `LEFT JOIN (
        SELECT COUNT(card.card_number) AS stock, card.productId
        FROM card
        WHERE card.card_isused = 0 AND card.locationId = ${locId} AND card.isActive = 1
        GROUP BY card.productId
      ) c ON c.productId = p.id`;
    }
  }

  const sqlCom = `
   SELECT 
  p.*,
  c.categ_name,
  IFNULL(i.img_name, 'No image') AS img_name,
  i.img_path,
  ${cardCountSelect},
  IFNULL(s.cnt, 0) AS sale_count,
  p.cost_price,
  p._category,
  p.duration_minutes,

  -- Final priceList with fallback
  IFNULL((
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'id', pl.id,
        'name', pl.name,
        'grade', pl.grade,
        'amount', pl.amount,
        'type', pl.type,
        'isActive', pl.isActive
      )
    )
    FROM priceList pl
    WHERE pl.productId = p.id AND pl.isActive = TRUE
  ),
  -- Default priceList when none exists
  JSON_ARRAY(
    JSON_OBJECT(
      'id', 0,
      'name', p.pro_name,
      'grade', 'Default',
      'amount', p.pro_price,
      'type', 'Price',
      'isActive', TRUE
    )
  )) AS priceList

FROM product p
LEFT JOIN category c ON c.categ_id = p.pro_category
LEFT JOIN image_path i ON i.pro_id = p.pro_id
${cardJoin}
LEFT JOIN (
  SELECT IFNULL(COUNT(pro_id),0) AS cnt, pro_id FROM card_sale GROUP BY pro_id
) s ON s.pro_id = p.pro_id

WHERE p.isActive = TRUE
GROUP BY p.pro_id
ORDER BY p.pro_price;
`;
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
    LEFT JOIN image_path i ON i.productId=p.id 
    WHERE p.pro_id=${pro_id}`, (er, re) => {
    if (er) return res.send('SQL ' + er)
    res.send(re)
  })
  //1635062891981300
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

module.exports = {
  createProd,
  updateProd,
  fetchProd,
  fetchProdId,
  fetchProdMobile,
  fetchProductFromLocation,
  fetchTaxes,
  fetchProductFromLocationV1,
}