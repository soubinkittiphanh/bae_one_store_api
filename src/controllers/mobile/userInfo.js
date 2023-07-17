const Db = require('../../config/dbcon');

const updateUserName = async (req, res) => {
    console.log("*************** UPDATE USER NAME  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    const body = req.body
    const userId = body.user_id;
    const userName = body.user_name;
     Db.query(`UPDATE user SET cus_name='${userName}' WHERE cus_id='${userId}'`, (er, re) => {
        if (er) {
            console.log("Error:  ");
            return res.send("Error: " + er.message);
        }
        console.log("Transaction completed");
        res.send("Transaction completed");
    })
}
const updateTel = async (req, res) => {
    console.log("*************** UPDATE USER TELEPHONE  ***************");
    console.log(`*************Payload: ${req.body} *****************`);

    const body = req.body
    const userId = body.user_id;
    const userPhoneNumber = body.user_phone;
     Db.query(`UPDATE user SET cus_tel='${userPhoneNumber}' WHERE cus_id='${userId}'`, (er, re) => {
        if (er) return res.send("Error: " + er.message);
        res.send("Transaction completed");
    })
}
const updateEmail = async (req, res) => {
    console.log("*************** UPDATE USER EMAIL  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    const body = req.body
    const userId = body.user_id;
    const userEmail = body.user_email;
     Db.query(`UPDATE user SET cus_email='${userEmail}' WHERE cus_id='${userId}'`, (er, re) => {
        if (er) return res.send("Error: " + er.message);
        res.send("Transaction completed");
    })
}
const updatePassword = async (req, res) => {
    console.log("*************** UPDATE USER PASSWORD  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    const body = req.body
    const userId = body.user_id;
    const userPass = body.user_password;
     Db.query(`UPDATE user SET cus_pass='${userPass}' WHERE cus_id='${userId}'`, (er, re) => {
        if (er) return res.send("Error: " + er.message);
        res.send("Transaction completed");
    })
}
const balanceInquiry = async (req, res) => {
    console.log("*************** BALANCE INQUIRY  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    const body = req.body
    const userId = body.user_id;
    const sqlCom=`SELECT c.cus_id,IFNULL(b.DEBIT+b.ORDER_TOTAL,0) AS debit,IFNULL(b.CREDIT,0) AS credit,(IFNULL(b.CREDIT,0)-(IFNULL(b.DEBIT,0)+IFNULL(b.ORDER_TOTAL,0))) AS balance FROM user c 
    LEFT JOIN(SELECT c.cus_id,c.cus_name,h.txn_his_amount,h.user_id,h.txn_his_date,t.txn_id,t.txn_name,t.txn_code,d.txn_code_id,d.txn_code_name,d.txn_sign,SUM(IF(d.txn_sign='DR',h.txn_his_amount,0)) AS DEBIT,SUM(IF(d.txn_sign='CR',h.txn_his_amount,0))AS CREDIT,o.ORDER_TOTAL FROM user c
        LEFT JOIN transaction_history h ON h.user_id=c.cus_id
        LEFT JOIN transaction t ON t.txn_id=h.txn_id
        LEFT JOIN transaction_code d ON d.txn_code_id=t.txn_code
        LEFT JOIN (SELECT o.user_id,SUM(o.order_price_total) AS ORDER_TOTAL FROM user_order o WHERE o.user_id=(SELECT cus_id FROM user WHERE cus_id='${userId}')) o ON o.user_id=c.cus_id
        WHERE c.cus_id=(SELECT cus_id FROM user WHERE cus_id='${userId}')) b ON b.cus_id =c.cus_id 
        WHERE c.cus_id='${userId}'`
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er.message);
        let bal=re[0]['balance']
        let credit=re[0]['credit']
        let debit=re[0]['debit']
        console.log(bal);
        res.json(re);
    })
}
const resetPasswordByPhone = async (req, res) => {
    console.log("*************** RESET PASSWORD BY PHONE  ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    const body = req.body
    const userPhone = body.user_phone.substring(body.user_phone.length-8);

    const userPass = body.password;
    console.log("PHONE: "+userPhone);
    const sqlCom=`UPDATE user SET cus_pass='${userPass}' WHERE cus_tel LIKE '%${userPhone}'`
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er.message);
        res.send("Transaction completed");
    })
}
module.exports = {
    updateUserName,
    updateTel,
    updateEmail,
    updatePassword,
    balanceInquiry,
    resetPasswordByPhone
}