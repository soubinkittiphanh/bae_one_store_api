const Db = require('../../config/dbcon')
const getOutletList = async (req, res) => {
    console.log("*************** GET OUTLET ***************");
    const sqlCom = `SELECT * FROM outlet`;
     Db.query(sqlCom, (er, re) => {
        if (er) {
            res.send("Error: " + er).status(503)
        } else if (re) {
            res.send(re);
        }

    })
}
module.exports = {
    getOutletList
}