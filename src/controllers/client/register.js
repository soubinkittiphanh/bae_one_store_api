const Db = require('../../config/dbcon')

const createCustomer=async(req,res)=>{
    console.log("*************** CREATE user ***************");
    console.log(`*************Payload: ${req.body} *****************`);
    const body=req.body;
    const cus_name=body.cust_name;
    const cus_pass=body.cust_pass;
    const cus_phone=body.cust_phone;
    const cus_email=body.cust_email;
    const cus_gameId=body.cust_gameId;
    const village=body.cust_village;
    const district=body.cust_district;
    const province=body.cust_province;
    const remark=body.cust_remark;
    const login_id=cus_email===''?cus_phone:cus_email;

    console.log("...Register user...");
    console.log("Info data: "+body);
    const sqlCom =`INSERT INTO user(cus_id, cus_pass, cus_name, cus_tel, cus_email, cus_active,login_id,village,district,province,remark) VALUES ((SELECT IFNULL(MAX(c.cus_id),1000)+1 FROM user c),'${cus_pass}','${cus_name}','${cus_phone}','${cus_email}',1,'${login_id}','${village}','${district}','${province}','${remark}')`
     Db.query(`SELECT cus_id FROM user WHERE login_id='${login_id}'`,(er,re)=>{
        if(er)return res.send("Error: "+ er);
        console.log("LEN: "+re.length);
        if(re.length>0){
            //User already exist need to cancle registration
            console.log("User already existed");
            res.send("Error user is already exist")
        }else{
            Db.query(sqlCom,(er,re)=>{
                if(er)return res.send("Error: "+er);
                res.send("Transaction completed");
            })
        }
    });


}

module.exports={
    createCustomer,
}