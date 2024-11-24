const Helper = require('../../helper/');
const fs = require('fs');
const Db = require('../../config/dbcon')
const env = require('../../config');
// const axios = require('axios').create({ baseURL: `http://localhost:${env.port || 4000}` });
const productService = require('../../product/service'); ///Users/soubinkittiphanh/Desktop/Pro/dcommerce/dc_api/src/controllers/admin/product.js
const logger = require('../../api/logger');
const singleMasterUpdate = async (req, res) => {
    logger.info("*************** Single master UPADATE UploadImage ***************");
    logger.info(`*************Payload: ${req.body.ref} *****************`);
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
                logger.info("USER IMAGE IS NEVER UPLOAD YET");
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
                logger.info("UPDATE USER IMAGE");
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
    logger.info("Single Master upload:");
    logger.info("*************** Single master UploadImage ***************");
    logger.info(`*************Payload: ${req.body.ref} *****************`);
    logger.info('=>   File: ' + req.file);
    logger.info('=>   remark: ' + req.body.remark);
    logger.info('=>   ref: ' + req.body.ref);
    logger.info('=>   app_id: ' + req.body.app_id);
    logger.info('=>   File name: ' + req.file.originalname);
    logger.info('=>   File path: ' + req.file.path);
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
        Db.query(sqlCom, (er, re) => {
            if (er) return res.send("Error: " + er);
            return res.send("Transaction completed");
        })
        // res.send('Transaction complete'); 
    });
    src.on('error', (err) => { res.send('error'); });

}

const single = async (req, res) => {
    // const body=req.FORM;
    logger.info('=>   File: ' + req.file);
    logger.info('=>   File name: ' + req.file.originalname);
    logger.info('=>   File path: ' + req.file.path);
    var tmp_path = req.file.path;
    const rndName = Date.now();
    logger.info("*************** Single UploadImage ***************");
    logger.info(`*************Payload: ${tmp_path} *****************`);
    /** The original name of the uploaded file
     stored in the variable "originalname". **/
    var target_path = 'uploads/' + rndName + req.file.originalname;
    //customize upload 
    // fs.rename(oldpath, newpath, function (err) {
    //     if (err) {
    //         logger.info('Error: ' + err);
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
    logger.info("*************** Single UploadImage ***************");
    logger.info(`*************Payload: ${req.files}} *****************`);
    const files = req.files;
    logger.info('jSON: ' + req.body.FORM);
    logger.info('Files: ' + files.length);
    const rndName = Date.now();
    let imagesObj = [];

    files.forEach(el => {
        var target_path = 'uploads/';
        var oldpath = el.path;
        var newpath = target_path + rndName + el.originalname;
        fs.rename(oldpath, newpath, function (err) {
            if (err) {
                logger.info('Error: ' + err);
                return res.send('Error: ' + err)
                // throw err;
            }
        });
        imagesObj.push({ 'name': rndName + el.originalname, 'path': newpath })
        logger.info('Loop len: ' + imagesObj.length);
        logger.info("Inside loop");
    });
    logger.info("Outside loop");
    try {

        await productService.createProd(req, imagesObj )
        res.status(201).send('Transaction completed');
    } catch (error) {
        logger.info("False and removing files... ");
        logger.error(`Error by productService.createProd method ${error}`)
        imagesObj.forEach(el => {
            fs.unlinkSync(el.path, er => {
                logger.info("Error: cannot remove file " + er);
            })
        })
        logger.info("False and removing files...completed ");
        res.status(501).send('Error: ');
    }
    /*
    const commandResult = await axios.post("/product_i", { ...req.body, imagesObj }).then((res) => {
        logger.info("AXIOS Succeed: " + res.data);
        sqlComMessage = res.data
        logger.info("REQUEST STATUS CODE: " + res.data);
        logger.info("REQUEST STATUS CODE DATA: " + res.status);
        return res.data === 'Transaction completed' ? true : false;
    }).catch(er => {
        sqlComMessage = er;
        logger.info("AXIOS Error: " + er);
        return false;
    })
    logger.info("Return client: " + commandResult);
    */
    //*****************  REMOVE FILE IF THERE IS ERROR  *****************//
    /*
    if (commandResult === false) {
        logger.info("False and removing files... ");
        imagesObj.forEach(el => {
            fs.unlinkSync(el.path, er => {
                logger.info("Error: cannot remove file " + er);
            })
        })
        logger.info("False and removing files...completed ");
    }
    res.send(commandResult ? 'Transaction completed' : 'Error: ' + sqlComMessage);
    */


}
const remove_file = async (req, res) => {
    logger.info("IMAGE NAME: " + req.body.img_name);
    const imageName = req.body.img_name
    fs.existsSync(`uploads/${imageName}`) && fs.unlinkSync(`uploads/${imageName}`, er => {
        if (er) return res.send('Error: cannot remove file ' + er)
    })
    Helper.ImgH.remove(imageName) ? res.send('Transaction completed') : res.send('Error SQL')
}
const multiUpdate = async (req, res) => {
    const files = req.files;
    logger.info('jSON: ' + req.body.FORM);
    logger.info('Files: ' + files.length);
    const rndName = Date.now();
    let imagesObj = [];

    files.forEach(el => {
        var target_path = 'uploads/';
        var oldpath = el.path;
        var newpath = target_path + rndName + el.originalname;
        !(fs.existsSync(`${target_path}${el.originalname}`)) &&
            fs.rename(oldpath, newpath, function (err) {
                if (err) {
                    logger.info('Error: ' + err);
                    return res.send('Error: ' + err)
                    // throw err;
                }

            });
        imagesObj.push({ 'name': rndName + el.originalname, 'path': newpath })
        logger.info('Loop len: ' + imagesObj.length);
        logger.info("Inside loop");
    });
    logger.info("Outside loop");
    try {
        await productService.updateProd(req, imagesObj)
        res.status(200).send('Transaction completed');
    } catch (error) {
        logger.error(`Upload fail: ${error}`)
        //*****************  REMOVE FILE IF THERE IS ERROR  *****************//
        logger.info("False and removing files... ");
        imagesObj.forEach(el => {
            fs.unlinkSync(el.path, er => {
                logger.info("Error: cannot remove file " + er);
            })
        })
        logger.info("False and removing files...completed ");
        res.status(401).send(`Error: ${error}`);
    }

    /*
        const commandResult = await axios.put("/product_e", { ...req.body, imagesObj }).then((res) => {
            logger.info("AXIOS Succeed: " + res.data);
            sqlComMessage = res.data
            logger.info("REQUEST STATUS CODE update: " + res.data);
            logger.info("REQUEST STATUS CODE DATA update: " + res.status);
            return res.data === 'Transaction completed' ? true : false;
        }).catch(er => {
            sqlComMessage = er;
            logger.info("AXIOS Error: " + er.data.Error);
            logger.info("AXIOS Error: " + er.Error);
            logger.info("AXIOS Error: " + er);
            return false;
        })
    
        */

}

module.exports = {
    singleMaster,
    single,
    multi,
    remove_file,
    multiUpdate,
    singleMasterUpdate,
}