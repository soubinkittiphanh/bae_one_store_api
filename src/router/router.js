// TODO: MANAGE THIS CODE
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
const OrderUser=require('../controllers/client/userOrder')
const UserInfo=require('../controllers/mobile/userInfo')
const WalletTxn=require('../controllers/mobile/walletTxn')
const StockCate=require('../controllers/admin/stockCategory')
const StockMethod=require('../controllers/admin/stockTransaction')
const Card=require('../controllers/admin/card')
const Adv=require('../controllers/admin/advertise')
const UserInbox=require('../controllers/client/userInbox')
const Bank=require('../controllers/client/bank')
const Ticket=require('../controllers/client/ticket')
const ChatType=require('../controllers/client/chatType')
const Chat=require('../controllers/client/chats')
const RegisterCustomer=require('../controllers/client/register')
const Report=require("../controllers/admin/report")
const multer = require('multer')
const tokenHook=require('../api/jwtApi').validateToken;
const jwtUtil =require('../api/jwtApi');
const Outlet = require("../controllers/admin/outlet")
const Payment = require("../controllers/admin/payment");
const Shipping = require("../controllers/admin/shipping");
const productController = require('../product/controller')

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/img', 'image/png', 'image/jpeg', 'image/gif','image/jpg']
    if (!allowedTypes.includes(file.mimetype)) {
        const error = new Error("Wrong file type");
        error.code = "LIMIT_FILE_TYPE"
        return cb(error, false);
    }
    cb(null, true);
}
const uploadModule = multer({ dest: './uploads/', fileFilter, limits: { fileSize: 200000000 } })
const upload = async (app) => {
    app.post('/uploadsingle', uploadModule.single('file'), Upload.single)
    app.post('/uploadsingle_master', uploadModule.single('file'), Upload.singleMaster)
    app.post('/uploadsingle_master_update', uploadModule.single('file'), Upload.singleMasterUpdate)
    app.post('/uploadmulti', uploadModule.array('files'), Upload.multi)
    app.post('/uploadmulti_update', uploadModule.array('files'), Upload.multiUpdate)
    app.post('/unlink_file', Upload.remove_file)
}
const category = async (app) => {
    app.post("/category_i", CategoryCtr.createCate);
    app.put('/category_e', CategoryCtr.updateCate);
    app.get('/category_f', CategoryCtr.fetchCate);
    app.get('/', (req, res) => {
        res.json({ "status": "succeed" });
    });

}
const product = async (app) => {
    app.post('/product_i', ProdCtr.createProd);
    app.put('/product_e', ProdCtr.updateProd);
    // app.get('/product_f', ProdCtr.fetchProd);
    app.get('/product_f/:locationId', ProdCtr.fetchProductFromLocation);
    app.get('/product_mobile_f', ProdCtr.fetchProdMobile);
    app.get('/product_f_id/:id', productController.getProductById);
}

const sale = async (app) => {
    app.post('/sale_i', Sale.createSale)
    app.put('/sale_e', Sale.updateSale)
}
const user = async (app) => {
    app.post('/user_i', User.createUser)
    app.put('/user_e', User.updateUser)
    app.get('/user_f', User.fetchUser)
}
const customer = async (app) => {
    app.post('/customer_i', Customer.createCustomer)
    app.put('/customer_e', Customer.updateCustomer)
    app.get('/customer_f', Customer.fetchCustomer)
}
const txntype = async (app) => {
    app.post('/txn_type_i', TxnType.createTxnType)
    app.put('/txn_type_e', TxnType.updateTxnType)
    app.get('/txn_type_f', TxnType.fetchTxnType)
}
const txn = async (app) => {
    app.post('/txn_i', Txn.createTxn)
    app.put('/txn_e', Txn.updateTxn)
    app.get('/txn_f', Txn.fetchTxn)
}
const txnHis = async (app) => {
    app.post('/txn_his_i',tokenHook, TxnHis.createTxnHis)
    app.put('/txn_his_e',tokenHook, TxnHis.updateTxnHis)
    app.get('/txn_his_f', TxnHis.fetchTxnHis)
}
const authenticate = async (app) => {
    app.post('/userLogin', Auth.authenticate)
    app.post('/cus_auth', Auth.Authcustomer)
}
const login = async (app) => {
    // app.get('/login', Login.login),
    app.get('/logout', jwtUtil.deleteToken),
    app.get('/me',jwtUtil.getUserFromToken)

}
const userorder=async (app)=>{
    // app.post('/order_i',tokenHook,OrderUser.createOrder)
    app.post('/order_i',OrderUser.createOrder)
    app.get('/order_f',OrderUser.fetchOrder)
    app.get('/order_date_f',OrderUser.fetchOrderByDate)
    app.get('/max_order_f',OrderUser.fetchMaxOrderByUserId)
    app.get('/order_by_payment',OrderUser.findOrderByPaymentType)
    app.post('/order_cod_settle',OrderUser.orderSettlement)
}
const updateUserInfo=async (app)=>{
    app.post('/username_e',UserInfo.updateUserName)
    app.post('/usertel_e',UserInfo.updateTel)
    app.post('/userpass_e',UserInfo.updatePassword)
    app.post('/useremail_e',UserInfo.updateEmail)
    app.post('/userbalance_f',UserInfo.balanceInquiry)
    app.post('/resetpassword_e',UserInfo.resetPasswordByPhone)
}
const fetchStockCategory=async (app)=>{
    app.get('/stockcate_f',StockCate.fetchStockCategory)

}
const stockAction=async (app)=>{
    app.post('/stock_action_i',StockMethod.createStockTransaction)

}
const userIbox=async (app)=>{
    app.get('/user_inbox_f',UserInbox.fetchInbox)
    app.post('/user_inbox_markreaded_u',UserInbox.markReaded)

}
const registerCus=async (app)=>{

    app.post('/register_i',RegisterCustomer.createCustomer)

}
const card=async (app)=>{

    app.post('/card_x',Card.deleteCard)
    app.get('/card_f',Card.fetchCard)
    app.get('/card_his_f',Card.fetchDeletedCard)
    app.get('/card_his_today_f',Card.fetchDeletedCardToday)

}
const advertise=async (app)=>{

    app.get('/ad_f',Adv.fetchAd)
    app.post('/ad_u',Adv.updateAd)

}
const bank=async (app)=>{

    app.post('/bank_acc_c',Bank.createBankAcc)
    app.get('/bank_acc_f_id',Bank.fetchBankAccByID)
    app.get('/bank_acc_f_user_id',Bank.fetchBankAccByUserID)
    app.get('/bank_acc_u',Bank.updateBankAcc)
    app.get('/bank_com_f',Bank.fetchBanks)
    app.post('/bank_com_c',Bank.createBankID)
    app.post('/bank_com_u',Bank.updateBankID)


}
const ticket=async(app)=>{
    app.get('/ticket_f',Ticket.getTicketHeaderInfo);
}
const chatType=async(app)=>{
    app.get('/chattype_f',ChatType.fetchChatType)
    app.post('/chattype_u',ChatType.updateChatType)
    app.post('/chattype_c',ChatType.createChatType)
}
const chat=async(app)=>{
    app.post('/chat_c',Chat.createChat)
    app.get('/chat_f',Chat.fetchChat)
    app.post('/chat_m',Chat.markChatAsReaded)
    app.get('/chat_f_id',Chat.fetchChatByID)
}
const walletTxn=async(app)=>{
    app.get('/wallettxn_crndr_f',WalletTxn.fetchWaletTxnCRnDR)
    app.get('/wallettxn_order_f',WalletTxn.fetchWalletOrderTxn)
}
const report=async(app)=>{
    app.get('/report_txn',Report.txnReport);
}
const outlet = async(app)=>{
    app.get("/outlet",Outlet.getOutletList)
}
const payment = async(app)=>{
    app.get("/payment",Payment.getPaymentList)
}
const shipping = async(app)=>{
    app.get("/shipping",Shipping.getShippingList)
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
    userorder,
    updateUserInfo,
    fetchStockCategory,
    stockAction,
    userIbox,
    registerCus,
    card,
    advertise,
    bank,
    chatType,
    chat,
    walletTxn,
    report,
    ticket,
    outlet,
    payment,
    shipping
}