const Helper = require('../../helper/');
const fs = require('fs');
const Db = require('../../config/dbcon')
const env = require('../../config');
const axios = require('axios').create({ baseURL: `http://localhost:${env.port || 4000}` });

const singleMasterUpdate = async (req, res) => {
    console.log("*************** Single master UPADATE UploadImage ***************");
    console.log(`*************Payload: ${req.body.ref} *****************`);
    var tmp_path = req.file.path;
    const rndName = Date.now();
    const appId = req.body.app_id;
    const remark = req.body.remark;
    const cusId = req.body.ref;
    var target_path = 'uploads/' + rndName + req.file.originalname;


    let sqlCom = `SELECT login_id from user WHERE cus_id='${cusId}'`
     Db.query(sqlCom, (er, re) => {
        if (er) return res.send("Error: " + er)
        if (re.length < 1) return res.send("Error: user id not found")
        const logInId = re[0]["login_id"]
        sqlCom = `SELECT img_path FROM image_path_master WHERE app_txn_id ='${logInId}'`
        Db.query(sqlCom, (er, re) => {
            if (er) return res.send("Error: " + er)
            var src = fs.createReadStream(tmp_path);
            var dest = fs.createWriteStream(target_path);
            if (re.length < 1) {
                console.log("USER IMAGE IS NEVER UPLOAD YET");
                src.pipe(dest);
                src.on('end', async () => {
                    sqlCom = `INSERT INTO image_path_master(app_id,app_txn_id,img_path,img_name,img_remark)VALUES('${appId}','${logInId}','${target_path}','${rndName + req.file.originalname}','${remark}')`
                    Db.query(sqlCom, (er, re) => {
                        if (er) return res.send("Error: " + er)
                        res.send("Transaction completed")
                    })
                })
                src.on('error', (err) => { res.send('error'); });
            } else {
                console.log("UPDATE USER IMAGE");
                src.pipe(dest);
                src.on('end', async () => {

                    sqlCom = `UPDATE image_path_master SET img_path='${target_path}',img_name='${rndName + req.file.originalname}' WHERE app_txn_id ='${logInId}'`
                    Db.query(sqlCom, (er, re) => {
                        if (er) res.send("Error: " + er)
                        res.send("Transaction completed");
                    })
                })
                src.on('error', (err) => { res.send('error'); });
            }
        })


    })

}

const singleMaster = async (req, res) => {
    console.log("Single Master upload:");
    console.log("*************** Single master UploadImage ***************");
    console.log(`*************Payload: ${req.body.ref} *****************`);
    console.log('=>   File: ' + req.file);
    console.log('=>   remark: ' + req.body.remark);
    console.log('=>   ref: ' + req.body.ref);
    console.log('=>   app_id: ' + req.body.app_id);
    console.log('=>   File name: ' + req.file.originalname);
    console.log('=>   File path: ' + req.file.path);
    var tmp_path = req.file.path;
    const rndName = Date.now();
    const appId = req.body.app_id;
    const ref = req.body.ref;
    const remark = req.body.remark;

    var target_path = 'uploads/' + rndName + req.file.originalname;
    var src = fs.createReadStream(tmp_path);
    var dest = fs.createWriteStream(target_path);
    src.pipe(dest);
    src.on('end', async () => {
        const sqlCom = `INSERT INTO image_path_master(app_id,app_txn_id,img_path,img_name,img_remark)VALUES('${appId}','${ref}','${target_path}','${rndName + req.file.originalname}','${remark}')`
        await Db.query(sqlCom, (er, re) => {
            if (er) return res.send("Error: " + er);
            return res.send("Transaction completed");
        })
        // res.send('Transaction complete'); 
    });
    src.on('error', (err) => { res.send('error'); });

}

const single = async (req, res) => {
    // const body=req.FORM;
    console.log('=>   File: ' + req.file);
    console.log('=>   File name: ' + req.file.originalname);
    console.log('=>   File path: ' + req.file.path);
    var tmp_path = req.file.path;
    const rndName = Date.now();
    console.log("*************** Single UploadImage ***************");
    console.log(`*************Payload: ${tmp_path} *****************`);
    /** The original name of the uploaded file
     stored in the variable "originalname". **/
    var target_path = 'uploads/' + rndName + req.file.originalname;
    //customize upload 
    // fs.rename(oldpath, newpath, function (err) {
    //     if (err) {
    //         console.log('Error: ' + err);
    //         return res.send('Error: ' + err)
    //         // throw err;
    //     }
    // });

    /** A better way to copy the uploaded file. **/
    var src = fs.createReadStream(tmp_path);
    var dest = fs.createWriteStream(target_path);
    src.pipe(dest);
    src.on('end', async () => {
        const sqlCom = `INSERT INTO image_path_ad(img_name,img_path,remark)VALUES('${rndName + req.file.originalname}','${target_path}','')`
         Db.query(sqlCom, (er, re) => {
            if (er) return res.send("Error: " + er);
            return res.send("Transaction completed");
        })
        // res.send('Transaction complete'); 
    });
    src.on('error', (err) => { res.send('error'); });
}

const multi = async (req, res) => {
    console.log("*************** Single UploadImage ***************");
    console.log(`*************Payload: ${req.files}} *****************`);
    const files = req.files;
    console.log('jSON: ' + req.body.FORM);
    console.log('Files: ' + files.length);
    const rndName = Date.now();
    let imagesObj = [];

    files.forEach(el => {
        var target_path = 'uploads/';
        var oldpath = el.path;
        var newpath = target_path + rndName + el.originalname;
        fs.rename(oldpath, newpath, function (err) {
            if (err) {
                console.log('Error: ' + err);
                return res.send('Error: ' + err)
                // throw err;
            }
        });
        imagesObj.push({ 'name': rndName + el.originalname, 'path': newpath })
        console.log('Loop len: ' + imagesObj.length);
        console.log("Inside loop");
    });
    console.log("Outside loop");
    let sqlComMessage;
    const commandResult = await axios.post("/product_i", { ...req.body, imagesObj }).then((res) => {
        console.log("AXIOS Succeed: " + res.data);
        sqlComMessage = res.data
        console.log("REQUEST STATUS CODE: " + res.data);
        console.log("REQUEST STATUS CODE DATA: " + res.status);
        return res.data === 'Transaction completed' ? true : false;
    }).catch(er => {
        sqlComMessage = er;
        console.log("AXIOS Error: " + er);
        return false;
    })
    console.log("Return client: " + commandResult);
    //*****************  REMOVE FILE IF THERE IS ERROR  *****************//
    if (commandResult === false) {
        console.log("False and removing files... ");
        imagesObj.forEach(el => {
            fs.unlinkSync(el.path, er => {
                console.log("Error: cannot remove file " + er);
            })
        })
        console.log("False and removing files...completed ");
    }
    res.send(commandResult ? 'Transaction completed' : 'Error: ' + sqlComMessage);
}
const remove_file = async (req, res) => {
    console.log("IMAGE NAME: " + req.body.img_name);
    const imageName = req.body.img_name
    fs.existsSync(`uploads/${imageName}`) && fs.unlinkSync(`uploads/${imageName}`, er => {
        if (er) return res.send('Error: cannot remove file ' + er)
    })
    Helper.ImgH.remove(imageName) ? res.send('Transaction completed') : res.send('Error SQL')
}
const multiUpdate = async (req, res) => {
    const files = req.files;
    console.log('jSON: ' + req.body.FORM);
    console.log('Files: ' + files.length);
    const rndName = Date.now();
    let imagesObj = [];

    files.forEach(el => {
        var target_path = 'uploads/';
        var oldpath = el.path;
        var newpath = target_path + rndName + el.originalname;
        !(fs.existsSync(`${target_path}${el.originalname}`)) &&
            fs.rename(oldpath, newpath, function (err) {
                if (err) {
                    console.log('Error: ' + err);
                    return res.send('Error: ' + err)
                    // throw err;
                }

            });
        imagesObj.push({ 'name': rndName + el.originalname, 'path': newpath })
        console.log('Loop len: ' + imagesObj.length);
        console.log("Inside loop");
    });
    console.log("Outside loop");
    let sqlComMessage;
    const commandResult = await axios.put("/product_e", { ...req.body, imagesObj }).then((res) => {
        console.log("AXIOS Succeed: " + res.data);
        sqlComMessage = res.data
        console.log("REQUEST STATUS CODE update: " + res.data);
        console.log("REQUEST STATUS CODE DATA update: " + res.status);
        return res.data === 'Transaction completed' ? true : false;
    }).catch(er => {
        sqlComMessage = er;
        console.log("AXIOS Error: " + er.data.Error);
        console.log("AXIOS Error: " + er.Error);
        console.log("AXIOS Error: " + er);
        return false;
    })
    console.log("Return client update: " + commandResult);
    //*****************  REMOVE FILE IF THERE IS ERROR  *****************//
    if (!commandResult) {
        console.log("False and removing files... ");
        imagesObj.forEach(el => {
            fs.unlinkSync(el.path, er => {
                console.log("Error: cannot remove file " + er);
            })
        })
        console.log("False and removing files...completed ");
    }
    res.send(commandResult ? 'Transaction completed' : 'Error: ' + sqlComMessage);
}

module.exports = {
    singleMaster,
    single,
    multi,
    remove_file,
    multiUpdate,
    singleMasterUpdate,
}