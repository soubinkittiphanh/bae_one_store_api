
const CategoryCtr = require('../controllers/admin/category')
const ProdCtr = require('../controllers/admin/product')
const Sale = require('../controllers/admin/sale')
const User = require('../controllers/admin/user')
const Customer = require('../controllers/admin/customer')
const TxnType = require('../controllers/admin/txnType')
const Txn = require('../controllers/admin/txn')
const TxnHis = require('../controllers/admin/txnHis')
const Login = require('../controllers/login');
const jwt = require('jsonwebtoken');
const Token = require('../config');
const Upload = require('../controllers/admin/upload')
const Auth = require('../controllers/admin/authen')
const multer = require('multer')

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/img', 'image/png', 'image/jpeg', 'image/gif','image/jpg']
    if (!allowedTypes.includes(file.mimetype)) {
        const error = new Error("Wrong file type");
        error.code = "LIMIT_FILE_TYPE"
        return cb(error, false);
    }
    cb(null, true);
}
const uploadModule = multer({ dest: './uploads/', fileFilter, limits: { fileSize: 2000000 } })
const upload = async (app) => {
    app.post('/uploadsinle',authentication, uploadModule.single('file'), Upload.single)
    app.post('/uploadmulti',authentication, uploadModule.array('files'), Upload.multi)
    app.post('/uploadmulti_update',authentication, uploadModule.array('files'), Upload.multiUpdate)
    app.post('/unlink_file',authentication, Upload.remove_file)
}
const category = async (app) => {
    app.post("/category_i",authentication, CategoryCtr.createCate);
    app.put('/category_e',authentication, CategoryCtr.updateCate);
    app.get('/category_f',authentication, CategoryCtr.fetchCate);
    app.get('/',authentication, (req, res) => {
        res.json({ "status": "succeed" });
    });

}
const product = async (app) => {
    app.post('/product_i',authentication, ProdCtr.createProd);
    app.put('/product_e',authentication, ProdCtr.updateProd);
    app.get('/product_f',authentication, ProdCtr.fetchProd);
    app.post('/product_f_id',authentication, ProdCtr.fetchProdId);
}

const sale = async (app) => {
    app.post('/sale_i',authentication, Sale.createSale)
    app.put('/sale_e',authentication, Sale.updateSale)
}
const user = async (app) => {
    app.post('/user_i',authentication, User.createUser)
    // app.put('/user_e', authentication, User.updateUser) //authenticate first
    app.put('/user_e',authentication, User.updateUser)
    app.get('/user_f',authentication, User.fetchUser)
}
const customer = async (app) => {
    app.post('/customer_i',authentication, Customer.createCustomer)
    app.put('/customer_e',authentication, Customer.updateCustomer)
    app.get('/customer_f',authentication, Customer.fetchCustomer)
}
const txntype = async (app) => {
    app.post('/txn_type_i',authentication, TxnType.createTxnType)
    app.put('/txn_type_e',authentication, TxnType.updateTxnType)
    app.get('/txn_type_f',authentication, TxnType.fetchTxnType)
}
const txn = async (app) => {
    app.post('/txn_i',authentication, Txn.createTxn)
    app.put('/txn_e',authentication, Txn.updateTxn)
    app.get('/txn_f',authentication, Txn.fetchTxn)
}
const txnHis = async (app) => {
    app.post('/txn_his_i',authentication, TxnHis.createTxnHis)
    app.put('/txn_his_e',authentication, TxnHis.updateTxnHis)
    app.get('/txn_his_f',authentication, TxnHis.fetchTxnHis)
}
// const authenticate = async (app) => {
//     app.post('/userLogin', Auth.authenticate)
//     app.post('/cus_auth', Auth.Authcustomer)
// }
// const login = async (app) => {
//     app.get('/login',authentication, Login.login)
// }
function authentication(req, res, next) {
    console.log("Middleware");
    const authHeader = req.headers['authorization']
    console.log("Middleware header: "+authHeader);
    const token = authHeader && authHeader.split(' ')[1]
    console.log("Middleware: "+token);
    if (token == null) return res.sendStatus(401).send('Invalid token null')
    jwt.verify(token, Token.actksecret, (er, user) => {
        if (er) return res.status(403).send('Token invalid or expired!')//res.sendStatus(403).send('invalid')
        console.log(user);
        req.user = user;
        next()
    })
}

module.exports = {
    category,
    product,
    sale,
    user,
    login,
    upload,
    customer,
    txntype,
    txn,
    txnHis,
    authenticate,

}