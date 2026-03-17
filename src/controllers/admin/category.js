const logger = require('../../api/logger');
const Db = require('../../config/dbcon')
const createCate = async (req, res) => {
    const cat_id = req.body.cat_id;
    console.log("*************** CREATE CATE ***************");
    console.log(`*************Payload: ${cat_id} *****************`);
    const { cat_name, cat_desc, createAt } = req.body;
    logger.info(req.body);
    Db.query("INSERT INTO `category`(`categ_name`,`categ_desc`,`createAt`)VALUES(?,?,?)", [cat_name, cat_desc, createAt], (er, re) => {
        if (er) {
            res.status(503).send('Error: ' + er);
        } else if (re) {
            console.log("GEN2: " + gen_cat_id);
            res.status(200).send('Transaction completed');
        }
    });
}
const updateCate = async (req, res) => {
    console.log("*************** UPDATE CATEG ***************");
    const cat_id = req.body.cat_id;
    console.log(`*************Payload: ${cat_id} *****************`);
    const { cat_name, cat_desc } = req.body;
    console.log(req.body);
    const sqlCom = `UPDATE category SET categ_name='${cat_name}', categ_desc='${cat_desc}' WHERE categ_id=${cat_id}`;
    Db.query(sqlCom, (er, re) => {
        if (er) {
            res.status(503).send("Error: " + er)
        } else if (re) {
            res.status(200).send('Transactoin completed');
        }
    })
}
const fetchCate = async (req, res) => {
    console.log("*************** FETCH CATEG ***************");
    console.log(`*************Payload:*****************`);
    Db.query("SELECT categ_id, categ_name,categ_desc,isActive FROM category", (er, re) => {
        if (er) return res.send("Error: " + er)
        res.send(re);
    })
}
// ******* FUNCTION BELOW IS NOT USED ||PROBLEM WITH A WAIT IS NOT AWAIT******
const generateId = async () => {
    console.log("*************** GENERATE ID CATEG  ***************");
    console.log(`*************Payload: *****************`);
    Db.query("SELECT MAX(categ_id) AS ID FROM category HAVING MAX(categ_id) IS NOT null", (er, re) => {
        if (er) return console.log("Error: " + er);
        if (re.length < 1) { return 1000 }
        const id = parseInt((re[0]['ID'])) + 1
        console.log("RES: " + id);
        console.log("RES: " + re[0]['ID'] + 1);
        return id
    })
}

module.exports = {
    createCate,
    updateCate,
    fetchCate,
}