const Db = require('../../config/dbcon');

const createChat = async (req, res) => {
    const body = req.body;
    console.log("************* CREATE CHAT  *****************");
    console.log(`*************Payload: ${body.chat_type_id} *****************`);
    const chat_type_id = body.chat_type_id;
    const chat_msg = body.chat_msg;
    const chat_user_id = body.chat_user_id;
    const custId = body.cust_id;
    const sqlCom = `INSERT INTO chat( msg_type, chat_message, user_id, chat_isread) VALUES ('${chat_type_id}','${chat_msg}','${chat_user_id}',0)`
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send("Transaction completed");
    })
}
const markChatAsReaded = async (req, res) => {
    const body = req.body;
    
    console.log("************* MARK CHAT  *****************");
    console.log(`*************Payload: ${body.chat_id} *****************`);
    const chat_id = body.chat_id;
    // const currentDate=Date.prototype.toMysqlFormat();
    // console.log("Date: "+currentDate.toString());
    const sqlCom = `UPDATE  chat SET chat_isread=1,read_time=null WHERE id=${chat_id}`
    
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send("Transaction completed");
    })
}
// Date.prototype.toMysqlFormat = ()=> {
//     return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getUTCHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
// };

const fetchChat = async (req, res) => {

    console.log("************* FETCH CHAT *****************");
    const sqlCom = `SELECT m.* ,bc.bank_acc_id,bc.bank_acc_name,bc.bank_id,b.bank_name,c.cus_name,c.cus_tel FROM chat m LEFT JOIN user c ON c.cus_id=m.user_id
    LEFT JOIN bank_account bc ON bc.user_id=m.user_id
    LEFT JOIN bank b ON b.code=bc.bank_id
    
    `
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er);
        res.send(re);
    });
}
const fetchChatByID = async (req, res) => {
    const body = req.query
    console.log("************* FETCH CHAT BY ID *****************");
    console.log(`*************Payload: ${body.chat_type_id} *****************`);
    const sqlCom = `SELECT * FROM chat WHERE user_id='${body.chat_user_id}'`
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er);
        res.send(re);
    });
}
module.exports = {
    createChat,
    fetchChat,
    fetchChatByID,
    markChatAsReaded,
}