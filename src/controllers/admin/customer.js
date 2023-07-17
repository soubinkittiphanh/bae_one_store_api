const Db = require('../../config/dbcon');

const createCustomer = async (req, res) => {
    console.log("*************** CREATE user  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    console.log(req.body);
    const body = req.body
    let cus_id = body.cus_id;
    const cus_pass = body.cus_pass;
    const cus_name = body.cus_name;
    const cus_tel = body.cus_tel;
    const cus_email = body.cus_email;
    const cus_active = body.cus_active==true?1:0;
     Db.query("SELECT MAX(cus_id) AS ID FROM user HAVING MAX(cus_id) IS NOT NULL", (er, re) => {
        if (er) return res.send("Error: " + er)
        if (re.length < 1) cus_id = 1000
        else cus_id = parseInt(re[0]['ID']) + 1
        const sqlCom = `INSERT INTO user(cus_id,cus_pass,cus_name,cus_tel,cus_email,cus_active) VALUES('${cus_id}','${cus_pass}','${cus_name}','${cus_tel}','${cus_email}','${cus_active}')`
        Db.query(sqlCom, (er, re) => {
            if (er) return res.send('Error: ' + er)
            res.send('Transaction completed')
        })
    })
}
const updateCustomer = async (req, res) => {
    console.log("*************** UPDATE user  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    console.log(req.body);
    const body = req.body
    let cus_id = body.cus_id;
    const cus_pass = body.cus_pass;
    const cus_name = body.cus_name;
    const cus_tel = body.cus_tel;
    const cus_email = body.cus_email;
    const cus_active = body.cus_active==true?1:0;

    const sqlCom = `UPDATE user SET cus_pass='${cus_pass}', cus_name='${cus_name}',
    cus_tel='${cus_tel}',cus_email='${cus_email}',cus_active='${cus_active}' WHERE cus_id='${cus_id}'`
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send('Error: ' + er)
        res.send('Transaction completed')
    })
}
const fetchCustomer = async (req, res) => {
    console.log("*************** FETCH user  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    const sqlCom=`SELECT c.*,SUM(IFNULL(o.order_price_total,0))AS ORDER_DEBIT,IFNULL(tt.CREDIT,0) AS CREDIT,IFNULL(tt.DEBIT,0) AS DEBIT FROM user c LEFT JOIN user_order o ON o.user_id=c.cus_id LEFT JOIN (SELECT h.txn_id,h.user_id,SUM(IF(d.txn_sign='DR',h.txn_his_amount,0)) AS DEBIT,SUM(IF(d.txn_sign='CR',h.txn_his_amount,0))AS CREDIT FROM transaction_history h LEFT JOIN transaction t ON t.txn_id=h.txn_id LEFT JOIN transaction_code d ON d.txn_code_id=t.txn_code GROUP BY h.user_id) tt ON tt.user_id=c.cus_id GROUP BY c.cus_id `;
     Db.query(sqlCom, (er, re) => {
        if (er) res.send("Error: " + er)
        res.send(re)
    })
}

module.exports = {
    createCustomer,
    updateCustomer,
    fetchCustomer,

}