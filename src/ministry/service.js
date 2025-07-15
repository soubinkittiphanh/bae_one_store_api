const logger = require("../api/logger");

const Account = require("../models").chartAccount
const listOfAccount = 
[
  {
    "accountNumber": 1000,
    "accountName": "Cash on Hand",
    "accountLLName": "ເງິນສົດ",
    "accountType": "Asset",
    "isActive": true
  },
  {
    "accountNumber": 1001,
    "accountName": "Petty Cash",
    "accountLLName": "",
    "accountType": "Asset",
    "isActive": true
  },
  {
    "accountNumber": 1002,
    "accountName": "BCEL Saving LAK account of Mr Anousone",
    "accountLLName": "ບັນຊີເງິນຝາກ LAK ທະນາຄານາການຄ້າ BCEL ຂອງ Mr Anousone",
    "accountType": "Asset",
    "isActive": true
  },
  {
    "accountNumber": 1005,
    "accountName": "Accounts Receivable",
    "accountLLName": "",
    "accountType": "Asset",
    "isActive": true
  },
  {
    "accountNumber": 1006,
    "accountName": "Computer Equipment",
    "accountLLName": "ເຄື່ອງຄອມພິວເຕີ",
    "accountType": "Asset",
    "isActive": true
  },
  {
    "accountNumber": 1007,
    "accountName": "Inventory",
    "accountLLName": "ເຄື່ອງໃນສາງ",
    "accountType": "Asset",
    "isActive": true
  },
  {
    "accountNumber": 1200,
    "accountName": "Prepaid Expenses",
    "accountLLName": "",
    "accountType": "Asset",
    "isActive": true
  },
  {
    "accountNumber": 2000,
    "accountName": "Accounts Payable",
    "accountLLName": "",
    "accountType": "Liability",
    "isActive": true
  },
  {
    "accountNumber": 2005,
    "accountName": "Accrued Expenses",
    "accountLLName": "",
    "accountType": "Liability",
    "isActive": true
  },
  {
    "accountNumber": 2100,
    "accountName": "Unearned Revenue",
    "accountLLName": "",
    "accountType": "Liability",
    "isActive": true
  },
  {
    "accountNumber": 3000,
    "accountName": "Owner's Equity",
    "accountLLName": "ທຶນ",
    "accountType": "Equity",
    "isActive": true
  },
  {
    "accountNumber": 3100,
    "accountName": "Retained Earnings",
    "accountLLName": "",
    "accountType": "Equity",
    "isActive": true
  },
  {
    "accountNumber": 4000,
    "accountName": "Sales",
    "accountLLName": "ລາຍຮັບຂາຍສິນຄ້າ",
    "accountType": "Revenue",
    "isActive": true
  },
  {
    "accountNumber": 4005,
    "accountName": "Interest Income",
    "accountLLName": "ລາຍຮັບດອກເບ້ຍ",
    "accountType": "Revenue",
    "isActive": true
  },
  {
    "accountNumber": 5000,
    "accountName": "Cost of Goods Sold",
    "accountLLName": "ຕົ້ນທຶນຊື້ສິນຄ້າ",
    "accountType": "Expense",
    "": true
  },
  {
    "accountNumber": 5005,
    "accountName": "Rent Expense",
    "accountLLName": "ຄ່າເຊົ່າ ອາຄານ",
    "accountType": "Expense",
    "isActive": true
  },
  {
    "accountNumber": 5100,
    "accountName": "Salaries Expense",
    "accountLLName": "ເງິນເດືອນ ພະນັກງານ",
    "accountType": "Expense",
    "isActive": true
  }
]

const createBulk = async(req,res)=>{
    Account.bulkCreate(listOfAccount)
    .then(()=>{ 
        logger.info('Rows inserted successfully')
        return res.status(200).send("Transction completed")
    })
    .catch((error)=>{
        logger.error('Error inserting rows:', error)
        return res.status(403).send("Server error "+error)
    }); 
}
module.exports = {
    createBulk
}