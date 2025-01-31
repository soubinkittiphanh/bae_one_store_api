const Db = require('../../config/dbcon')
const deleteCard = async (req, res) => {
    const card_id = req.body.card_id;
    const user_id = req.body.user_id;

    var value_date = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60 * 1000).toJSON().slice(0, 19).replace('T', ' ');

    console.log("************* CARD DELETE *****************");
    console.log("************* DATE TIME " + value_date + "*****************");
    console.log(`*************Payload: ${card_id} *****************`);

    const sqlCom = `UPDATE card SET card_isused =2,update_user='${user_id}',update_time='${value_date}' WHERE id='${card_id}'`;
    // const sqlCom = `INSERT INTO card_his( card_type_code, product_id, card_number, card_isused, inputter) SELECT card_type_code, product_id, card_number, card_isused, '${user_id}' FROM card WHERE card.id = '${card_id}'`
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        // Db.query(`DELETE FROM card WHERE id = '${card_id}'`, (er, re) => {
        //     if (er) res.send("Error: " + er);
        return res.send("Transaction completed")
        // })
    })


}

const fetchCard = async (req, res) => {
    const proId = req.query.pro_id
    const { fDate, tDate, userId } = req.query;
    console.log("************* LOAD CARD *****************");
    console.log(`*************Payload: ${proId} *****************`);
    let sqlComCon = ''
    if (fDate && tDate) {
        sqlComCon = `AND card_input_date BETWEEN '${fDate} 00:00:00' AND '${tDate} 23:59:59' `
    }
    if (userId) {
        sqlComCon += ` AND inputter ='${userId}'`
    }
    console.log("SQL Con: " + sqlComCon);
    const sqlCom = `SELECT c.*,u.cus_name FROM card c LEFT JOIN user u ON u.id = c.inputter WHERE c.product_id='${proId}' ${sqlComCon} ORDER BY c.card_input_date DESC`

    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}

const fetchDeletedCard = async (req, res) => {
    const { fdate, tdate ,userId} = req.query;
 

    console.log("SELECT DEL CARD: "+fdate+" tdate: "+tdate);

    let sqlCom = `select c.*,p.pro_name,p.pro_price,u.cus_name from card c LEFT JOIN product p ON p.pro_id=c.product_id LEFT JOIN user u ON u.id=c.update_user WHERE c.card_isused=2 AND c.update_time BETWEEN '${fdate} 00:00:00' AND '${tdate} 23:59:59' `
    if (userId) {
        sqlCom += ` AND update_user ='${userId}'`
    }
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er);
        res.send(re);
    })
}
const fetchDeletedCardToday = async (req, res) => {
    var sqlDatetimeNow = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60 * 1000).toJSON().slice(0, 19).replace('T', ' ');
    const fdate=sqlDatetimeNow.substring(0,11);
    const tdate=sqlDatetimeNow.substring(0,11);
    console.log("SELECT DEL CARD: "+fdate+" tdate: "+tdate);

    let sqlCom = `select c.*,p.pro_name,p.pro_price,u.cus_name from card c LEFT JOIN product p ON p.pro_id=c.product_id LEFT JOIN user u ON u.id=c.update_user WHERE c.card_isused=2 AND c.update_time BETWEEN '${fdate} 00:00:00' AND '${tdate} 23:59:59'`
    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er);
        res.send(re);
    })
}
// ******* FUNCTION BELOW IS NOT USED ||PROBLEM WITH A WAIT IS NOT AWAIT******


module.exports = {
    deleteCard,
    fetchCard,
    fetchDeletedCard,
    fetchDeletedCardToday,
}