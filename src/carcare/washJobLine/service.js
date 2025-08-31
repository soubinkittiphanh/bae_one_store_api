const logger = require('../api/logger');
const Unit = require('../models').unit
// function generateRandomString(length) {
//     let result = '';
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const charactersLength = characters.length;
//     for (let i = 0; i < length; i++) {
//       result += characters.charAt(Math.floor(Math.random() * charactersLength));
//     }

//     return result;
//   }

const createHulkUnit = (req, res) => {
    const rowsToInsert =
        [
            {
                name: 'each',
                unitRate: 1,
                isActive: true
            },
            {
                name: 'dozen',
                unitRate: 12,
                isActive: true
            },
            {
                name: 'pound',
                unitRate: 16,
                isActive: true
            },
            {
                name: 'gallon',
                unitRate: 128,
                isActive: true
            },
            {
                name: 'bottle',
                unitRate: 1,
                isActive: true
            },
            {
                name: 'case',
                unitRate: 12,
                isActive: true
            },
            {
                name: 'can',
                unitRate: 1,
                isActive: true
            },
            {
                name: 'pack',
                unitRate: 6,
                isActive: true
            },
            {
                name: 'piece',
                unitRate: 1,
                isActive: true
            },
            {
                name: "meter",
                unitRate: 1.0,
                isActive: true
            },
            {
                name: "liter",
                unitRate: 0.001,
                isActive: true
            },
            {
                name: "kilogram",
                unitRate: 1.0,
                isActive: false
            },

        ]

    Unit.bulkCreate(rowsToInsert)
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
    createHulkUnit,
}