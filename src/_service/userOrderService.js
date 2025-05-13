
// const Db = require('../../config/dbcon')
const logger = require('../api/logger');
const db = require('../config/dbcon')
const dbAsync = require('../config/dbconAsync');

const createUserOrderHeader = async (headerRecord) => {
    console.log('Order header ', headerRecord);
    const sql = `INSERT INTO user_order_head(user_order_id, discount, cod_fee, rider_fee, locking_session_id) VALUES
     ('${headerRecord.orderId}','${headerRecord.discount}','${headerRecord.codFee}','${headerRecord.riderFee}','${headerRecord.lockingSessionId}')`
    try {
        const [rows, fields] = await dbAsync.execute(sql)
        logger.info("create order header done");
        return '00'
    } catch (error) {
        logger.error("create order header fail " + error);
        return '01'
    }
}
const createDynCustomer = async (customer, lockingSessionId, orderHeader) => {
    const name = customer.name;
    const tel = customer.tel;
    const shipping = customer.shipping;
    const custAddress = customer.address;
    const payment = customer.payment;
    const outlet = customer.outlet;
    const shippingFee = customer.shippingFee;
    const bookingDay = customer.workingDay;
    const riderId = customer.riderId == 0 ? null : customer.riderId;
    const geoId = customer.geoId;
    const sqlCom = `INSERT INTO dynamic_customer(name, tel, source_delivery_branch, 
        dest_delivery_branch, payment_code, shop_name,locking_session_id,shipping_fee_by,txn_date,discount,rider_fee,createdAt,updateTimestamp,riderId,geoId) 
    VALUES ('${name}','${tel}','${shipping}','${custAddress}','${payment}','${outlet}','${lockingSessionId}','${shippingFee}','${bookingDay}',${customer.discount},${customer.riderFee},NOW(),NOW(),${riderId},${geoId})`
    logger.info("Create dynamic customer sql: " + sqlCom);
    try {
        const [rows, fields] = await dbAsync.execute(sqlCom);
        logger.info("create dy customer done");
        createUserOrderHeader(orderHeader);
        return '00'
    } catch (error) {
        logger.error("Cannot create dy customer " + error)
        return '01'
    }
}



module.exports = {
    createUserOrderHeader,
    createDynCustomer,
}