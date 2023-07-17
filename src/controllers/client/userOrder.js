const Db = require('../../config/dbcon')
const dbAsync = require('../../config/dbconAsync');
const OrderHelper = require('../../helper/mobile/orderHelper')
const service = require('../../service').userOrderService;
const interalResponse =require('../../common')
const logger = require('../../api/logger')
//************************* Flow of create order******************************/
//************************* 1. Check Stock availability for each product *************************
//************************* 2. Create order in user_order_table *************************
//************************* 3. Create sale_card for keeping the stock status *************************
//************************* 4. Create dynamic customer *************************
//************************* 5. Create order_header *************************
const createOrder = async (req, res) => {
    const { user_id, cart_data, customer } = req.body;
    let headerRecord = {
        orderId: '',
        discount: customer.discount,
        codFee: 0,
        riderFee: customer.riderFee,
        lockingSessionId: ''
    }
    logger.info("************* CREATE ORDER *****************");
    logger.info(`*************Payload: ${req.body} *****************`);
    logger.info(`************* CREATING ORDER **************`);
    logger.info(`************* ${new Date()} *************`);
    // ****** TRACK ALL PROCESS STATUS ****** //
    let allProcessResult = []
    let processItem = { 'processName': '', 'processResult': '', 'processMessage': '' };
    logger.info("product discount " + cart_data[0]["product_discount"]);
    //*******NOTE THE PRODUCT TO UPDATE PRDUCT SALE COUNT (STATISTIC)*******//
    let listOfProduct = [];
    //*******END NOTE THE PRODUCT TO UPDATE PRDUCT SALE COUNT (STATISTIC)*******//
    let i = 0;
    let sqlCom = `INSERT INTO user_order(order_id, user_id, product_id, product_amount, product_price, order_price_total, product_discount,locking_session_id,rider_fee) VALUES `;
    let sqlComCardSale = ``;
    //Get last order_id
    logger.info(`************* GETING ORDER ID **************`);
    logger.info(`************* ${new Date()} *************`);
    // Card table locking id
    const lockingSessionId = Date.now()
    let productId = ''
    Db.query('SELECT IFNULL(MAX(order_id),0) AS order_id FROM user_order;', async (er, re) => {
        if (er) return res.send("Error: " + er)
        let genOrderId = re[0]['order_id'];
        if (genOrderId == 0) genOrderId = 10000;
        else genOrderId = parseInt(genOrderId) + 1;
        headerRecord.orderId = genOrderId;
        headerRecord.lockingSessionId = lockingSessionId;

        logger.info(`************* LOOPING THROUGH ALL TXN **************`);
        logger.info(`************* ${new Date()} *************`);
        for (let i = 0; i < cart_data.length; i++) {
            const el = cart_data[i];
            productId = el.product_id;
            logger.info(`************* CHECKING STOCK AVAILABILITY **************`);
            logger.info(`************* ${new Date()} *************`);
            const count_stock = await OrderHelper.checkStockAvailability(el.product_id, el.product_amount, lockingSessionId);
            if (count_stock != 200) {
                logger.info("STOCK STATUS CODE: " + count_stock);
                return res.send(count_stock == 503 ? "ເກີດຂໍ້ຜິດພາດ ສິນຄ້າ |" + el.product_id + "| ບໍ່ພຽງພໍ" : "Connection Error");
            }
            if (i == cart_data.length - 1) {
                //Last row
                sqlCom = sqlCom + `(${genOrderId},${user_id},${el.product_id},${el.product_amount},${el.product_price_retail},${el.product_price_retail * el.product_amount},${el.product_discount},${lockingSessionId},${customer.riderFee});`;
            } else {
                sqlCom = sqlCom + `(${genOrderId},${user_id},${el.product_id},${el.product_amount},${el.product_price_retail},${el.product_price_retail * el.product_amount},${el.product_discount},${lockingSessionId},${customer.riderFee}),`;
            }
            const QRCode = generateQR()
            //20230505_1920 sqlComCardSale = `INSERT INTO card_sale(card_code,card_order_id,price,qrcode,pro_id,pro_discount) SELECT c.card_number,'${genOrderId}','${el.product_price}','${QRCode}','${el.product_id}','${el.product_discount || 0}' FROM card c WHERE c.locking_session_id ='${lockingSessionId}' LIMIT ${el.product_amount};`;
            sqlComCardSale = sqlComCardSale + `INSERT INTO card_sale(card_code,card_order_id,price,qrcode,pro_id,pro_discount) SELECT c.card_number,'${genOrderId}','${el.product_price}','${QRCode}','${el.product_id}','${el.product_discount || 0}' FROM card c WHERE c.locking_session_id ='${lockingSessionId}' LIMIT ${el.product_amount};`;
        }


        processItem.processName = 'STOCK CHECK';
        processItem.processResult = '00';
        allProcessResult.push(processItem);

        logger.info(`************* PUTTING TXN INTO USER ORDER TABLE **************`);
        logger.info(`************* ${new Date()} *************`);
        logger.info(`************* ${sqlCom} *************`);
        Db.query(sqlCom, (er, re) => {
            if (er) {
                return res.send("Error: " + er);
            }
            // If no error insert to order then we should insert to card_sale for mapping card_sale -> user_order -> card
            logger.info(`************* PUTTING TXN INTO CARD SALE TABLE **************`);
            logger.info(`************* ${new Date()} *************`);
            Db.query(sqlComCardSale, (er, re) => {
                logger.info("SQL: " + sqlComCardSale);
                if (er) {
                    logger.error("Error: " + er);
                    logger.error("Trying to insert to card_sale again: ");
                    Db.query(sqlComCardSale, (er, re) => {
                        if (er) {
                            //IF STILL NOT ABLE TO PROCESS SALE THEN WE WILL REVERSE TRANSACTION
                            const resverseSqlcom = `DELETE FROM user_order WHERE order_id=${genOrderId}`
                            Db.query(resverseSqlcom, (er, re) => {
                                if (er) return res.send(`Error: ບໍ່ສາມາດສົ່ງບັດໄດ້ ກະລຸນາແຈ້ງ ແອັດມິນ ລົບອໍເດີ ເລກ: ${genOrderId}`)
                                return res.send("Error: ກະລຸນາລອງໃຫມ່ອີກຄັ້ງ server timeout" + er)
                            })


                        }
                        else {
                            // ******** create dynamic customer ********//
                            service.createDynCustomer(customer, lockingSessionId, headerRecord);
                            logger.info(`************* PROCESS ORDER IS DONE **************`);
                            res.send("Transaction completed");
                            //update stock value
                            logger.info(`************* UPDATE STOCK VALUE **************`);
                            updateStockCount(productId, lockingSessionId);
                        }
                    })
                } else {
                    // ******** create dynamic customer ********//
                    service.createDynCustomer(customer, lockingSessionId, headerRecord);
                    logger.info(`************* PROCESS ORDER IS DONE **************`);
                    res.send("Transaction completed");
                    //update stock value
                    logger.info(`************* UPDATE STOCK VALUE **************`);
                    logger.info(`************* ${new Date()} *************`);
                    updateStockCount(productId, lockingSessionId);
                }
            })
        })

    });
}
const updateStockCount = async (productId, lockingSessionId) => {
    //Change card status for those card id is in card sale table 
    //UPDATE card c SET c.card_isused=1 WHERE c.card_isused=0 AND c.card_number IN(SELECT s.card_code FROM card_sale s WHERE s.processing_date >='2022-06-21 00:00:00')
    try {
        logger.info(`************* ${new Date()}  UPDATE STOCK COUNT **************`);
        const [rows, fields] = await dbAsync.execute(`UPDATE card c SET c.card_isused=1 WHERE locking_session_id='${lockingSessionId}'`)
        logger.info(`*********** ${new Date()} PROCESSED RECORD: ${rows.affectedRows}`);
        await updateProductStockCountSingleProduct(productId);
    } catch (error) {
        logger.error("Update stock counter error: " + error);
    }

}

const updateProductStockCountSingleProduct = async (productId) => {
    //********************//********************
    //Update product stock count after sale 
    //for single product in PRODUCT table
    //********************//********************
    logger.info(`************* ${new Date()}  updateProductStockCountDirectSingle **************`);
    const sqlCom = `UPDATE product p SET p.stock_count=(SELECT COUNT(c.card_number) FROM card c WHERE product_id=${productId} AND c.card_isused=0) WHERE p.pro_id=${productId};`
    try {
        const [rows, fields] = await dbAsync.execute(sqlCom);
        logger.info(`*********** ${new Date()} PROCESSED RECORD: => ${rows.affectedRows}`);
    } catch (error) {
        logger.error("Cannot get product sale count");
    }

}
const reverseOrderByOrderId = async (orderId) => {
    const sqlCom = `DELETE FROM user_order WHERE order_id=${orderId}`
    return Db.query(sqlCom, (er, re) => {
        if (er) return `05:${er}`
        return '00:Transaction completed'
    })
}
const generateQR = () => {
    logger.info("*************** GENERATE QR  ***************");

    let QRCodeStr = '';
    for (let i = 0; i < 16; i++) {
        const subQR = getRandomInt(10)
        QRCodeStr += subQR.toString();
    }

    return QRCodeStr;
}
const getRandomInt = (max) => {
    logger.info("*************** GET RANDOM INT  ***************");

    return Math.floor(Math.random() * max);
}

const fetchOrder = async (req, res) => {
    logger.info("*************** FETCH ORDER  ***************");
    const memId = req.query.mem_id;
    const fDate = req.query.f_date;
    const tDate = req.query.t_date;

    logger.info("mem_id: " + memId);
    Db.query(`SELECT o.*,p.pro_name FROM user_order o LEFT JOIN product p on o.product_id=p.pro_id 
    WHERE o.user_id ='${memId}' AND o.txn_date BETWEEN '${fDate} 00:00:00' AND '${tDate} 23:59:59' 
    ORDER BY o.order_id DESC`, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}
const findOrderByUserId = async (req, res) => {
    logger.info("*************** FETCH ORDER  ***************");
    const memId = req.query.mem_id;
    const fDate = req.query.f_date;
    const tDate = req.query.t_date;
    const sqlCom = `
    SELECT o.order_id,o.user_id,o.product_id,o.product_amount,o.product_price,o.order_price_total,o.record_status,o.cancel_reason,
    d.*,p.pro_name,p.outlet,p.name as outlet_name,p.tel as shop_tel,
    s.name as record_status,s.description as record_status_desc 
    FROM user_order o
    LEFT JOIN (SELECT p.pro_id, p.pro_name,p.outlet,u.name,u.tel 
        FROM product p LEFT JOIN outlet u ON u.id = p.outlet) AS p ON p.pro_id = o.product_id
    LEFT JOIN dynamic_customer d ON d.locking_session_id = o.locking_session_id 
    LEFT JOIN order_status s ON s.id = o.record_status
    WHERE o.user_id = '${memId}' AND o.txn_date BETWEEN'${fDate} 00:00:00' AND '${tDate} 23:59:59'
    `
    logger.info("Sql command: "+ sqlCom);
    Db.query(sqlCom, (er, re) => {
        if (er) return res.status(201).send("Database error: " + er)
        return res.status("200").send(re);
    })

}
const changeOrderStatus = async (req, res) => {
    //TODO: send back the card id to for hitting stock count / Logic complete please test scenior
    let processResList = [];
    let tempResponse;
    const { orderId, status, userId, reason } = req.body;
    logger.info(orderId)
    logger.info(status)
    logger.info(userId)
    logger.info(reason)
    // return res.status(200).send("complete");
    const sqlCmd = `UPDATE user_order set record_status = ${status}, cancel_reason='${reason}' WHERE order_id = '${orderId}'`
    logger.info("sqlCommand: ", sqlCmd);
    // ************ Change record_status from dynamic_customer table ************
    processResList.push(await changeDynamyCustomerRecordStatus(orderId,status))

    const lockingSessionId = Date.now();
    activity = {
        userId,
        action: 'update',
        remark: `Change order status to ${status}`,
        table: 'user_order',
        recordId: orderId, lockingSessionId
    }
    //******Track user activity ****** */
    const response = await OrderHelper.trackUserActivityHistory(activity)
    if (response.mti != '00') {
        return res.status(201).send("Transaction fail")
    }
    Db.query(sqlCmd, async (er, re) => {
        if (er) {
            //****** Track user fail handler ******* */
            await OrderHelper.reverseUserActivityHistory(lockingSessionId);
            return res.status(201).send("Database error: " + er)
        }
        logger.info("Number of records affected with warning : " + re.warningCount);
        logger.info("Message from MySQL Server : " + re.message);
        logger.info("Number of rows affected : " + re.affectedRows);
        logger.info("Number of rows changedRows : " + re.changedRows);
      const response =  await returnStock(orderId)
      if(response.includes('00')) return res.status("200").send("Transaction completed");
      return res.status('201').send(`Transaction fail, contact admin to check order ${orderId} n`)
        
    })
}

// return stock 

const returnStock = async(orderId)=>{
    const sql = `UPDATE card SET card_isused = 0 WHERE card_number IN(SELECT card_code FROM card_sale WHERE card_order_id ='${orderId}')`
    try {
        logger.info("Update card table")
        const [rows,fields] = await dbAsync.query(sql);
        logger.info("update card table rows message: "+rows.message)
        logger.info("update card table rows change: "+rows.changedRows)
        if (rows.changedRows>0) return await deleteCardFromCardSale(orderId)
        return '01'
    } catch (error) {
        logger.warn(`update card table error ${error}`)
        logger.error("Database error: ",error);
        return '01'
    }
}

const deleteCardFromCardSale = async(orderId)=>{
    const sql =`DELETE FROM card_sale WHERE card_order_id ='${orderId}'`
    try {
        logger.info("Delete card from card_sale table")
        const [rows,fields] = await dbAsync.query(sql)
        // logger.info(`change: ${rows.changedRows}`) change rows is not present for DELETE query
        logger.info(`effected: ${rows.affectedRows}`)
        // logger.info(`message: ${rows.message}`) Message is not present for DELETE query
        if(rows.affectedRows>0) return '00'
        return '01'
    } catch (error) {
        logger.error("Server error ",error);
        return '01'
    }

}
const changeDynamyCustomerRecordStatus = async(orderId,status)=>{
    const sql =`UPDATE dynamic_customer SET record_status = ${status} WHERE locking_session_id =(SELECT locking_session_id from user_order WHERE order_id='${orderId}') limit 1`
    interalResponse.key = 'change dynamic_customer record status'
    try {
        const [rows,fields] = await dbAsync.query(sql)
        if(rows.affectedRows>0)
            interalResponse.mti = '00'
        else
            interalResponse.mti = '01'
        
        return interalResponse;
    } catch (error) {
        logger.error("Server error ",error);
        interalResponse.mti='01'
        interalResponse.msg = 'Error: '+error
        return interalResponse
    }
}

const fetchMaxOrderByUserId = async (req, res) => {
    logger.info("*************** FETCH MAX ORDER ID'S TXN  ***************");
    const memId = req.query.mem_id;
    logger.info("mem_id: " + memId);
    Db.query(`SELECT o.*,p.pro_name 
    FROM user_order o LEFT JOIN product p on o.product_id=p.pro_id 
    WHERE o.user_id ='${memId}' AND o.order_id=(SELECT MAX(order_id) 
    FROM user_order WHERE user_id='${memId}') 
    ORDER BY o.order_id DESC`, (er, re) => {
        if (er) return res.send("Error: " + er.message)
        res.send(re.data);
    })
}
const fetchOrderByDate = async (req, res) => {
    const body = req.body;
    logger.info("*************** FETCH ORDER BY DATE  ***************");
    logger.info(`*************Payload: ${body} *****************`);
    const fromDate = req.query.fromDate
    const toDate = req.query.toDate
    const userId = req.query.userId
    logger.info("************* LOAD ORDER BY DATE *****************");
    logger.info(`*************Payload: ${fromDate} *****************`);
    logger.info(`*************Payload: ${toDate} *****************`);
    logger.info(`*************Payload: ${userId} *****************`);
    let extraCondition;
    if (userId.includes(null) || userId == '') {
        extraCondition = ''
    } else {
        extraCondition = ` AND o.user_id=${userId}`
    }
    const sqlCom = `SELECT o.*,p.pro_name,c.cus_name FROM user_order o LEFT JOIN product p on o.product_id=p.pro_id LEFT JOIN user c ON c.cus_id=o.user_id WHERE o.txn_date BETWEEN '${fromDate} 00:00:00' AND '${toDate} 23:59:59' ${extraCondition}  ORDER BY o.order_id DESC`
    logger.info("sal com: " + sqlCom);
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}



const findOrderByPaymentType = async (req, res) => {
    const { paymentCode, fromDate, toDate,orderId } = req.query;
    logger.info("Request query param " + fromDate);
    logger.info("Request query param " + toDate);
    let sqlComOption = `AND c.payment_code IN('${paymentCode}','RIDER_COD')`
    if (paymentCode == 'ALL') {
        // sqlComOption = `AND c.payment_code NOT IN('COD','RIDER_COD')`;
        sqlComOption = ``;
    }
    const sql = `SELECT o.*,p.pro_name FROM user_order o
    LEFT JOIN product p on o.product_id=p.pro_id
     WHERE o.order_id =  '${orderId}' AND o.payment_code NOT IN('COD','RIDER_COD')`
    logger.info(sqlCom);
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}

const orderSettlement = async (req, res) => {
    let { lockingSessionId, paymentCode, codFee, orderId, userId, amount } = req.body;
    // TODO: TAKE param for mysql locking session id
    // return res.send('Try again later');
    const paymentParam = {
        'locking_session_id': lockingSessionId,
        'order_id': orderId,
        'user_id': userId,
        'payment_method': paymentCode,
        'payment_amount': amount,
        'payment_status': 'PAID'
    }
    logger.info(paymentParam);
    let sqlCom = `UPDATE dynamic_customer SET cod_fee=${+codFee} WHERE locking_session_id='${lockingSessionId}'`;
    // let sqlCom = 'SELECT * FROM dynamic_customer'
    logger.info("DYN CUS ",sqlCom);
    try {
        const [rows,fields] = await dbAsync.execute(sqlCom);
        logger.info('DYN TABLE',rows.affectedRows);
        const response = await createPayment(paymentParam);
        if(response=='00'){
            return res.status(201).send('Transaction completed')
        }
        return res.status(200).send('Transaction fail');
    } catch (error) {
        logger.error("error: ",error);
    }

}

const createPayment = async (param) => {
    
    const sql = `INSERT INTO order_payment 
    (locking_session_id,order_id,user_id,payment_method,payment_amount,payment_status)
    VALUE('${param.locking_session_id}','${param.order_id}','${param.user_id}','${param.payment_method}','${param.payment_amount}','${param.payment_status}')`
        logger.info("PAYMENT SQL ",sql);
        try {
            const [rows,fields] =  await dbAsync.query(sql);
            logger.info('order_payment ',rows.affectedRows);
            if(rows.affectedRows ==1 ){
                return '00'
            }
            return '01'
        } catch (error) {
            logger.error('Server error: ',error)
            return '01'
        }

}

const multipleStatements = async (req, res) => {
    const sqlCmd = `UPDATE card_sale SET mark_readed = 0 WHERE card_code ='1680052073744';
    UPDATE card_sale SET mark_readed = 0 WHERE card_code ='1680052450039';
    UPDATE card_sale SET mark_readed = 0 WHERE card_code ='1680048751885';`

    Db.query(sqlCmd, (er, re, fields) => {
        if (er) throw er
        re.forEach(element => {
            logger.info("Result: ", element.affectedRows);
            logger.info("Change: ", element.changedRows);
            logger.info("message: ", element.message);
            logger.info("Result: ", element);
        });
        logger.info("Field: ", fields);
        res.send("done")
    })
}
const findOrderHeader = async (req, res) => {
    const { fdate, tdate } = req.query;
    const sql = `SELECT * FROM user_order_head WHERE booking_date BETWEEN '${fdate}' AND  '${tdate}'`;
    logger.info(sql);
    try {
        const [row, fields] = await dbAsync.query(sql);
        logger.info("DATA : ", row);
        res.send(row);
    } catch (error) {
        res.send('Server error: ' + error)
    }

}
const findOrderById = async (req, res) => {
    const { orderId } = req.query
    logger.info("Find order by id");
    const sql = `SELECT o.*,p.pro_name FROM user_order o
    LEFT JOIN product p on o.product_id=p.pro_id
     WHERE o.order_id =  '${orderId}'`;
    logger.info(sql);
    try {
        const [row, fields] = await dbAsync.query(sql);
        let fieldsName = []
        fields.forEach(el => {
            fieldsName.push(el.name)
            logger.info("DATA : ", el.name,);
        })
        res.send({ row, fieldsName });
    } catch (error) {
        logger.error(error)
        res.send('Server error: ' + error)
    }
}
const findCancelOrder=async(req,res)=>{
    const {fDate,tDate} = req.query;
    const sql = `SELECT d.*,o.order_id,o.cancel_reason,SUM(o.order_price_total) AS cart_total FROM dynamic_customer d 
    LEFT JOIN user_order o ON o.locking_session_id = d.locking_session_id
    WHERE d.record_status != 1 AND d.txn_date BETWEEN '${fDate} 00:00:00' AND '${tDate} 23:59:59'
    GROUP BY d.locking_session_id
    `
    logger.info(sql)
    const userOrder =`SELECT locking_session_id,record_status,order_id FROM user_order`
    try {
        const [rows,fields] = await dbAsync.query(sql);
        
        // rows.forEach(el=>{
        //     logger.info("Field name: "+el.locking_session_id);
        //     Db.query(`UPDATE dynamic_customer SET record_status=${el.record_status} WHERE locking_session_id = '${el.locking_session_id}'`,(er,re)=>{
        //         if(er){
        //             logger.error('cannot update '+er)
        //         }else{
        //             logger.info("Update completed")
        //         }
        //     })
        // })
        logger.error('Row counted: '+rows.length)
        return res.status(200).send(rows)

        
    } catch (error) {
        logger.error('Database error ',error)
        return res.status(201).send("Server error "+error)
    }
}

module.exports = {
    createOrder,
    fetchOrder,
    fetchOrderByDate,
    fetchMaxOrderByUserId,
    updateStockCount,
    updateProductStockCountSingleProduct,
    findOrderByPaymentType,
    orderSettlement,
    findOrderByUserId,
    changeOrderStatus,
    multipleStatements,
    findOrderHeader,
    findOrderById,
    findCancelOrder,
}