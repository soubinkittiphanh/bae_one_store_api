const Db = require('../../config/dbcon')
const dbAsync = require('../../config/dbconAsync');
const OrderHelper = require('../../helper/mobile/orderHelper')
const service = require('../../service').userOrderService;
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
    console.log("************* CREATE ORDER *****************");
    console.log(`*************Payload: ${req.body} *****************`);
    console.log(`************* CREATING ORDER **************`);
    console.log(`************* ${new Date()} *************`);
    // ****** TRACK ALL PROCESS STATUS ****** //
    let allProcessResult = []
    let processItem = { 'processName': '', 'processResult': '', 'processMessage': '' };
    console.log("product discount " + cart_data[0]["product_discount"]);
    //*******NOTE THE PRODUCT TO UPDATE PRDUCT SALE COUNT (STATISTIC)*******//
    let listOfProduct = [];
    //*******END NOTE THE PRODUCT TO UPDATE PRDUCT SALE COUNT (STATISTIC)*******//
    let i = 0;
    let sqlCom = `INSERT INTO user_order(order_id, user_id, product_id, product_amount, product_price, order_price_total, product_discount,locking_session_id,rider_fee) VALUES `;
    let sqlComCardSale = ``;
    //Get last order_id
    console.log(`************* GETING ORDER ID **************`);
    console.log(`************* ${new Date()} *************`);
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

        console.log(`************* LOOPING THROUGH ALL TXN **************`);
        console.log(`************* ${new Date()} *************`);
        for (let i = 0; i < cart_data.length; i++) {
            const el = cart_data[i];
            productId = el.product_id;
            console.log(`************* CHECKING STOCK AVAILABILITY **************`);
            console.log(`************* ${new Date()} *************`);
            const count_stock = await OrderHelper.checkStockAvailability(el.product_id, el.product_amount, lockingSessionId);
            if (count_stock != 200) {
                console.log("STOCK STATUS CODE: " + count_stock);
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

        console.log(`************* PUTTING TXN INTO USER ORDER TABLE **************`);
        console.log(`************* ${new Date()} *************`);
        console.log(`************* ${sqlCom} *************`);
        Db.query(sqlCom, (er, re) => {
            if (er) {
                return res.send("Error: " + er);
            }
            // If no error insert to order then we should insert to card_sale for mapping card_sale -> user_order -> card
            console.log(`************* PUTTING TXN INTO CARD SALE TABLE **************`);
            console.log(`************* ${new Date()} *************`);
            Db.query(sqlComCardSale, (er, re) => {
                console.log("SQL: " + sqlComCardSale);
                if (er) {
                    console.log("Error: " + er);
                    console.log("Trying to insert to card_sale again: ");
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
                            console.log(`************* PROCESS ORDER IS DONE **************`);
                            res.send("Transaction completed");
                            //update stock value
                            console.log(`************* UPDATE STOCK VALUE **************`);
                            updateStockCount(productId, lockingSessionId);
                        }
                    })
                } else {
                    // ******** create dynamic customer ********//
                    service.createDynCustomer(customer, lockingSessionId, headerRecord);
                    console.log(`************* PROCESS ORDER IS DONE **************`);
                    res.send("Transaction completed");
                    //update stock value
                    console.log(`************* UPDATE STOCK VALUE **************`);
                    console.log(`************* ${new Date()} *************`);
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
        console.log(`************* ${new Date()}  UPDATE STOCK COUNT **************`);
        const [rows, fields] = await dbAsync.execute(`UPDATE card c SET c.card_isused=1 WHERE locking_session_id='${lockingSessionId}'`)
        console.log(`*********** ${new Date()} PROCESSED RECORD: ${rows.affectedRows}`);
        await updateProductStockCountSingleProduct(productId);
    } catch (error) {
        console.log("Update stock counter error: " + error);
    }

}
const updateProductStockCountDirect = async () => {
    //update product table set product sale statistic [sale amount]
    console.log(`************* ${new Date()}  updateProductStockCountDirect **************`);
    const sqlCom = `UPDATE product pro  INNER JOIN  (SELECT d.product_id AS card_pro_id,COUNT(d.card_number)-COUNT(cs.card_code) AS card_count 
  FROM card d LEFT JOIN card_sale cs ON cs.card_code=d.card_number 
  WHERE d.card_isused!=2  
  GROUP BY d.product_id) proc ON proc.card_pro_id=pro.pro_id 
  SET pro.stock_count=proc.card_count;`

    try {
        const [rows, fields] = await dbAsync.execute(sqlCom);
        console.log(`*********** ${new Date()} PROCESSED RECORD: ${rows.affectedRows}`);
    } catch (error) {
        console.log("Cannot get product sale count");
    }

}

const updateProductStockCountSingleProduct = async (productId) => {
    //********************//********************
    //Update product stock count after sale 
    //for single product in PRODUCT table
    //********************//********************
    console.log(`************* ${new Date()}  updateProductStockCountDirectSingle **************`);
    const sqlCom = `UPDATE product p SET p.stock_count=(SELECT COUNT(c.card_number) FROM card c WHERE product_id=${productId} AND c.card_isused=0) WHERE p.pro_id=${productId};`
    try {
        const [rows, fields] = await dbAsync.execute(sqlCom);
        console.log(`*********** ${new Date()} PROCESSED RECORD: => ${rows.affectedRows}`);
    } catch (error) {
        console.log("Cannot get product sale count");
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
    console.log("*************** GENERATE QR  ***************");

    let QRCodeStr = '';
    for (let i = 0; i < 16; i++) {
        const subQR = getRandomInt(10)
        QRCodeStr += subQR.toString();
    }

    return QRCodeStr;
}
const getRandomInt = (max) => {
    console.log("*************** GET RANDOM INT  ***************");

    return Math.floor(Math.random() * max);
}

const fetchOrder = async (req, res) => {
    console.log("*************** FETCH ORDER  ***************");
    const memId = req.query.mem_id;
    const fDate = req.query.f_date;
    const tDate = req.query.t_date;

    console.log("mem_id: " + memId);
    Db.query(`SELECT o.*,p.pro_name FROM user_order o LEFT JOIN product p on o.product_id=p.pro_id 
    WHERE o.user_id ='${memId}' AND o.txn_date BETWEEN '${fDate} 00:00:00' AND '${tDate} 23:59:59' 
    ORDER BY o.order_id DESC`, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}
const findOrderByUserId = async (req, res) => {
    console.log("*************** FETCH ORDER  ***************");
    const memId = req.query.mem_id;
    const fDate = req.query.f_date;
    const tDate = req.query.t_date;
    const sqlCom = `
    SELECT o.*,d.*,p.pro_name,p.outlet,p.name as outlet_name,p.tel as shop_tel,s.name as record_status,s.description as record_status_desc 
    FROM user_order o
    LEFT JOIN (SELECT p.pro_id, p.pro_name,p.outlet,u.name,u.tel FROM product p LEFT JOIN outlet u ON u.id = p.outlet) AS p ON p.pro_id = o.product_id
    LEFT JOIN dynamic_customer d ON d.locking_session_id = o.locking_session_id 
    LEFT JOIN order_status s ON s.id = o.record_status
    WHERE o.user_id = '${memId}' AND o.txn_date BETWEEN'${fDate} 00:00:00' AND '${tDate} 23:59:59'
    `
    console.log("Sql command: ", sqlCom);
    Db.query(sqlCom, (er, re) => {
        if (er) return res.status(201).send("Database error: " + er)
        return res.status("200").send(re);
    })

}
const changeOrderStatus = async (req, res) => {
    const { orderId, status, userId, reason } = req.body;
    const sqlCmd = `UPDATE user_order set record_status = ${status}, cancel_reason='${reason}' WHERE order_id = '${orderId}'`
    console.log("sqlCommand: ", sqlCmd);
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
        console.log("Number of records affected with warning : " + re.warningCount);
        console.log("Message from MySQL Server : " + re.message);
        console.log("Number of rows affected : " + re.affectedRows);
        console.log("Number of rows changedRows : " + re.changedRows);
        return res.status("200").send("Transaction completed");
    })
}
const fetchMaxOrderByUserId = async (req, res) => {
    console.log("*************** FETCH MAX ORDER ID'S TXN  ***************");
    const memId = req.query.mem_id;
    console.log("mem_id: " + memId);
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
    console.log("*************** FETCH ORDER BY DATE  ***************");
    console.log(`*************Payload: ${body} *****************`);
    const fromDate = req.query.fromDate
    const toDate = req.query.toDate
    const userId = req.query.userId
    console.log("************* LOAD ORDER BY DATE *****************");
    console.log(`*************Payload: ${fromDate} *****************`);
    console.log(`*************Payload: ${toDate} *****************`);
    console.log(`*************Payload: ${userId} *****************`);
    let extraCondition;
    if (userId.includes(null) || userId == '') {
        extraCondition = ''
    } else {
        extraCondition = ` AND o.user_id=${userId}`
    }
    const sqlCom = `SELECT o.*,p.pro_name,c.cus_name FROM user_order o LEFT JOIN product p on o.product_id=p.pro_id LEFT JOIN customer c ON c.cus_id=o.user_id WHERE o.txn_date BETWEEN '${fromDate} 00:00:00' AND '${toDate} 23:59:59' ${extraCondition}  ORDER BY o.order_id DESC`
    console.log("sal com: " + sqlCom);
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}



const findOrderByPaymentType = async (req, res) => {
    const { paymentCode, fromDate, toDate } = req.query;
    console.log("Request query param " + fromDate);
    console.log("Request query param " + toDate);
    let sqlComOption = `AND c.payment_code IN('${paymentCode}','RIDER_COD')`
    if (paymentCode == 'ALL') {
        // sqlComOption = `AND c.payment_code NOT IN('COD','RIDER_COD')`;
        sqlComOption = ``;
    }
    // const sqlCom = `SELECT c.name,c.tel,c.source_delivery_branch AS shipping,c.dest_delivery_branch AS cus_address,c.payment_code,u.name AS shop_name,c.shipping_fee_by,
    // o.order_id,o.user_id,o.product_id,o.product_amount,o.product_price,o.product_discount,o.txn_date,o.locking_session_id,o.rider_fee,o.record_status,o.cancel_reason,
    // p.pro_name
    // FROM dynamic_customer c 
    // LEFT JOIN user_order o ON c.locking_session_id = o.locking_session_id
    // LEFT JOIN product p on p.pro_id = o.product_id
    // LEFT JOIN outlet u on u.id = c.shop_name
    // WHERE c.txn_date BETWEEN '${fromDate} 00:00:00' AND '${toDate} 23:59:59' ${sqlComOption}`
    const sql = `SELECT o.*,p.pro_name FROM user_order o
    LEFT JOIN product p on o.product_id=p.pro_id
     WHERE o.order_id =  '${orderId}' AND o.payment_code NOT IN('COD','RIDER_COD')`
    console.log(sqlCom);
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}

const orderSettlement = async (req, res) => {
    let { lockingSessionId, paymentCode, codFee, orderId, userId, amount } = req.body;
    // TODO: TAKE param for mysql locking session id
    const paymentParam = {
        'locking_session_id': lockingSessionId,
        'order_id': orderId,
        'user_id': userId,
        'payment_method': paymentCode,
        'payment_amount': amount,
        'payment_status': 'PAID'
    }
    console.log(paymentParam);
    let sqlCom = `UPDATE dynamic_customer SET cod_fee=${+codFee} WHERE locking_session_id='${lockingSessionId}'`;
    // let sqlCom = 'SELECT * FROM dynamic_customer'
    console.log("DYN CUS ", sqlCom);
    try {
        const [rows, fields] = await dbAsync.execute(sqlCom);
        console.log('DYN TABLE', rows.affectedRows);
        const response = await createPayment(paymentParam);
        if (response == '00') {
            return res.status(201).send('Transaction completed')
        }
        return res.status(200).send('Transaction fail');
    } catch (error) {
        console.log("error: ", error);
    }
    // console.log("response 0 "+rows);



    // if (codFee && +codFee > 0) {
    //     // ******** create fee for the COD ************//
    //     sqlCom = `UPDATE user_order SET cod_fee ='${codFee}' WHERE locking_session_id = '${lockingSessionId}'`
    //     console.log("sql 2 " + sqlCom);
    //     Db.query(sqlCom, (er, re) => {
    //         if (er) return res.send('Error: ' + er)
    //         console.log("Effected: " + re.effectedRows);
    //         res.send('Transaction completed')
    //     })
    // } else {
    //     res.status(200).send("Transaction completed")
    // }


}

const createPayment = async (param) => {

    const sql = `INSERT INTO order_payment 
    (locking_session_id,order_id,user_id,payment_method,payment_amount,payment_status)
    VALUE('${param.locking_session_id}','${param.order_id}','${param.user_id}','${param.payment_method}','${param.payment_amount}','${param.payment_status}')`
    console.log("PAYMENT SQL ", sql);
    try {
        const [rows, fields] = await dbAsync.query(sql);
        console.log('order_payment ', rows.affectedRows);
        if (rows.affectedRows == 1) {
            return '00'
        }
        return '01'
    } catch (error) {
        console.log('Server error: ', error)
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
            console.log("Result: ", element.affectedRows);
            console.log("Change: ", element.changedRows);
            console.log("message: ", element.message);
            console.log("Result: ", element);
        });
        console.log("Field: ", fields);
        res.send("done")
    })
}
const findOrderHeader = async (req, res) => {
    const { fdate, tdate } = req.query;
    const sql = `SELECT * FROM user_order_head WHERE booking_date BETWEEN '${fdate}' AND  '${tdate}'`;
    console.log(sql);
    try {
        const [row, fields] = await dbAsync.query(sql);
        console.log("DATA : ", row);
        res.send(row);
    } catch (error) {
        res.send('Server error: ' + error)
    }

}
const findOrderById = async (req, res) => {
    const { orderId } = req.query
    console.log("Find order by id");
    const sql = `SELECT o.*,p.pro_name FROM user_order o
    LEFT JOIN product p on o.product_id=p.pro_id
     WHERE o.order_id =  '${orderId}'`;
    console.log(sql);
    try {
        const [row, fields] = await dbAsync.query(sql);
        let fieldsName = []
        fields.forEach(el => {
            fieldsName.push(el.name)
            console.log("DATA : ", el.name,);
        })
        res.send({ row, fieldsName });
    } catch (error) {
        res.send('Server error: ' + error)
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
    findOrderById
}