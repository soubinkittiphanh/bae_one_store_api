
const logger = require('../api/logger');
const Client = require('../models').client
// function generateRandomString(length) {
//     let result = '';
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const charactersLength = characters.length;
//     for (let i = 0; i < length; i++) {
//       result += characters.charAt(Math.floor(Math.random() * charactersLength));
//     }

//     return result;
//   }

const createBulkClient = (req, res) => {
    const listOfClient = [{
        name: "Walk in customer",
        company: "ABC Inc.",
        address: "123 Main St",
        telephone: "555-555-5555",
        credit: 60,
        lateChargePercent: 0,
        grade: "B",
        isActive: true
    }, {
        name: "Jane Doe",
        company: "XYZ Corp.",
        address: "456 Elm St",
        telephone: "555-123-4567",
        credit: 45,
        lateChargePercent: 0.25,
        grade: "C",
        isActive: true
    }]
    Client.bulkCreate(listOfClient)
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

    createBulkClient
}
