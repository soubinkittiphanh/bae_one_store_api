const { jwtApi } = require('../../api');
const logger = require('../../api/logger');
const Db = require('../../config/dbcon')
const userService = require('../../user/service')
const authenticate = async (req, res) => {
    const body = req.body;
    console.log("************* User auth  *****************");
    console.log(`*************Payload: ${body} *****************`);
    const { mem_id, mem_pwd } = body;
    const user = await userService.getUserById(mem_id,mem_pwd)
    if(!user) return  res.send({ "accessToken": "", "error": "ລະຫັດຜ່ານ ຫລື ໄອດີບໍ່ຖືກຕ້ອງ" })
    logger.info(`**********${user}**********`)
    const plainPayload = { 
        id:user.id,
        cus_id:user.cus_id,
        cus_name:user.cus_name,
        cus_tel:user.cus_tel,
        userGroup: user.userGroup,
        terminal: user.terminals
    };
    res.send(jwtApi.generateToken(plainPayload))
}
const Authcustomer = async (req, res) => {
    console.log("*************** user AUTH  ***************");
    const { version } = req.body;
    console.log("Verion: " + version);
    // if(!version)return res.send('Error: ກະລຸນາອັບເດດເວີຊັ່ນໃຫມ່')
    // if(version!='1.1.0')return res.send('Error: ກະລຸນາອັບເດດເວີຊັ່ນໃຫມ່')
    const body = req.body;
    const u_id = body.cus_id;
    const u_pw = body.cus_pwd;
    console.log("cus_id: " + u_id);
    console.log("cus_pwd: " + u_pw);
    const sqlCom = `SELECT c.*,IFNULL(b.DEBIT+b.ORDER_TOTAL,0) AS debit,IFNULL(b.CREDIT,0) AS credit,img_path FROM user c 
    LEFT JOIN(
        SELECT c.cus_id,c.cus_name,h.txn_his_amount,h.user_id,h.txn_his_date,t.txn_id,t.txn_name,t.txn_code,d.txn_code_id,d.txn_code_name,d.txn_sign,SUM(IF(d.txn_sign='DR',h.txn_his_amount,0)) AS DEBIT,SUM(IF(d.txn_sign='CR',h.txn_his_amount,0))AS CREDIT,o.ORDER_TOTAL,i.img_path FROM user c
        LEFT JOIN transaction_history h ON h.user_id=c.cus_id
        LEFT JOIN transaction t ON t.txn_id=h.txn_id
        LEFT JOIN image_path_master i ON i.app_txn_id =c.login_id
        LEFT JOIN transaction_code d ON d.txn_code_id=t.txn_code
        LEFT JOIN (SELECT o.user_id,SUM(o.order_price_total) AS ORDER_TOTAL FROM user_order o WHERE o.user_id=(SELECT cus_id FROM user WHERE login_id='${u_id}')) o ON o.user_id=c.cus_id
        WHERE c.cus_id=(SELECT cus_id FROM user WHERE login_id='${u_id}')) b ON b.cus_id =c.cus_id 
        WHERE c.login_id='${u_id}' AND c.cus_pass='${u_pw}'`;
    // const sqlCom=`SELECT * FROM user where login_id='${u_id}' AND cus_pass='${u_pw}'`;

    Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        console.log("************* AUTH SUCCEED *****************");
        console.log("LEN: " + re.length);
        re.length > 0 ? res.send(Login.login(re[0]['cus_name'], re[0]['cus_id'], re[0]['cus_tel'],
            re[0]['cus_email'], re[0]['debit'], re[0]['credit'], re[0]['img_path']))
            : res.send({ "accessToken": "", "error": "ລະຫັດຜ່ານ ຫລື ໄອດີບໍ່ຖືກຕ້ອງ" })

    })
}

module.exports = {
    Authcustomer,
    authenticate,
}