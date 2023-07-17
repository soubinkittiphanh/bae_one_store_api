const logger = require('../api/logger');
const Payment = require('../models').payment
// function generateRandomString(length) {
//     let result = '';
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const charactersLength = characters.length;
//     for (let i = 0; i < length; i++) {
//       result += characters.charAt(Math.floor(Math.random() * charactersLength));
//     }

//     return result;
//   }

const createHulkPayment = (req, res) => {


    const rowsToInsert =
        [
            {
                payment_code: "CASH",
                payment_name: "Cash Payment",
                payment_desc: "Payment made in cash",
                isActive: true
            },
            {
                payment_code: "CCARD",
                payment_name: "Credit Card Payment",
                payment_desc: "Payment made with a credit card",
                isActive: true
            },
            {
                payment_code: "BANK",
                payment_name: "Bank Transfer Payment",
                payment_desc: "Payment made through a bank transfer",
                isActive: true
            },
            {
                payment_code: "CHECK",
                payment_name: "Check Payment",
                payment_desc: "Payment made through a check",
                isActive: false
            }
        ]

    Payment.bulkCreate(rowsToInsert)
        .then(() => {
            logger.info('Rows inserted successfully')
            return res.status(200).send("Transction completed")
        })
        .catch((error) => {
            logger.error('Error inserting rows:', error)
            return res.status(403).send("Server error " + error)
        });
}

module.exports = {
    createHulkPayment,
}