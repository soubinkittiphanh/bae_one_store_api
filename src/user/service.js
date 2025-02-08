const logger = require('../api/logger');
const User = require('../models/index.js').user;
const Terminal = require('../models/index.js').terminal;
const Group = require('../models/index.js').group;
const Authority = require('../models/index.js').menuHeader;
const MenuLine = require('../models/index.js').menuLine;
const env = require("../config");
const db = require('../models/index.js')
const getUserById = async (cus_id, cus_pass) => {

    try {
        const user = await User.findOne({
            where: {
                cus_id, cus_pass
            }, include: [
                {
                    model: Terminal,
                    through: { attributes: [] }
                },
                {
                    model: Group,
                    as: 'userGroup',
                    attributes: ['code', 'name', 'id'],
                    // include: [
                    //     {
                    //         model: Authority,
                    //         attributes: ['name', 'llname', 'icon', 'expand'],
                    //         include: [
                    //             {
                    //                 model: MenuLine,
                    //                 attributes: ['name', 'llname', 'icon', 'path'],
                    //             }
                    //         ]
                    //     }
                    // ]
                }
            ]
        })
        logger.info(`**********${user}**********`)
        return user;
    } catch (error) {
        logger.error(`Cannot get user with error ${error}`)
        return null
    }
};
const countUser = async () => {
    try {
        const allUser = await User.findAll();
        logger.info(`********** Found Users: ${JSON.stringify(allUser)} **********`);
        return allUser;
    } catch (error) {
        logger.error(`Cannot get user with error: ${error}`);
        return null;
    }
};


const ensureDefaultUserExists = async () => {
    const dfUserId = env.db.database.split('_')[3]
    let isbrandNewDB = false;
    const userToCreate = {
        cus_id: dfUserId || '1000',                  // User ID (integer, required)
        cus_pass: dfUserId || 'dcommerce@2024',      // Password (string, required)
        cus_name: "DC Auto",         // Full name (string, required)
        cus_tel: "123456789",         // Telephone number (string, optional)
        cus_email: "jane.doe@example.com", // Email address (string, optional)
        cus_active: true,             // Customer active status (boolean, defaults to true)
        village: "Village Name",      // Village name (string, optional)
        district: "District Name",    // District name (string, optional)
        province: "Province Name",    // Province name (string, optional)
        remark: "New customer",       // Remark (string, optional)
        isActive: true,               // Active status (boolean, defaults to true)
        groupId: 1,
    };
    try {
        const users = await countUser();

        if (!users || users.length === 0) {
            logger.info('No users found. Creating default user...');
            await basicParameterInitialise();
            const defaultUser = await User.create(userToCreate);

            if (defaultUser) {
                isbrandNewDB = true;
                logger.info('Default user created successfully.');
            } else {
                logger.error('Failed to create default user.');
            }
        } else {
            logger.info('Users already exist. No need to create a default user.');
        }
    } catch (error) {
        logger.error(`Error ensuring default user exists: ${error}`);
    }
    return isbrandNewDB;
};
const basicParameterInitialise = async () => {
    try {
        await db.sequelize.transaction(async (transaction) => {
            const query0 = `INSERT INTO location SELECT * FROM dcommerce_pro_init.location;`;
            const query1 = `INSERT INTO userGroup SELECT * FROM dcommerce_pro_init.userGroup;`;
            const query2 = `INSERT INTO terminal SELECT * FROM dcommerce_pro_init.terminal;`;
            const query3 = `INSERT INTO UserTerminals SELECT * FROM dcommerce_pro_init.UserTerminals;`;
            const query15 = `INSERT INTO menuHeader SELECT * FROM dcommerce_pro_init.menuHeader;`;
            const query16 = `INSERT INTO menuLine SELECT * FROM dcommerce_pro_init.menuLine;`;
            const query4 = `INSERT INTO GroupMenuHeader SELECT * FROM dcommerce_pro_init.GroupMenuHeader;`;
            const query5 = `INSERT INTO MenuHeaderLines SELECT * FROM dcommerce_pro_init.MenuHeaderLines;`;
            const query6 = `INSERT INTO GroupAuthorities SELECT * FROM dcommerce_pro_init.GroupAuthorities;`;
            const query7 = `CREATE TABLE card_sale AS SELECT * FROM dcommerce_pro_init.card_sale;`;
            const query8 = `INSERT INTO company SELECT * FROM dcommerce_pro_init.company;`;
            const query9 = `INSERT INTO shipping SELECT * FROM dcommerce_pro_init.shipping;`;
            const query10 = `INSERT INTO geography SELECT * FROM dcommerce_pro_init.geography;`;
            const query11 = `INSERT INTO rider SELECT * FROM dcommerce_pro_init.rider;`;
            const query12 = `INSERT INTO payment SELECT * FROM dcommerce_pro_init.payment;`;
            const query13 = `INSERT INTO client (id, name, company, email, address, telephone, credit, lateChargePercent, grade, isActive, createdAt, updateTimestamp)
            SELECT id, name, company, email, address, telephone, credit, lateChargePercent, grade,
            IF(isActive NOT IN (0, 1), 1, isActive), createdAt, updateTimestamp
            FROM dcommerce_pro_init.client;
            `;
            const query14 = `INSERT INTO currency SELECT * FROM dcommerce_pro_init.currency;`;

            await db.sequelize.query(query15, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query16, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query8, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query0, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query1, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query2, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query3, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query4, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query5, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query6, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query9, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query10, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query11, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query12, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query13, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query14, { type: db.sequelize.QueryTypes.INSERT, transaction });
            await db.sequelize.query(query7, { transaction });
        });

        logger.info("All data copied successfully in a single transaction.");
    } catch (error) {
        logger.error(`Error copying data: ${error}`);
    }
};




module.exports = {
    getUserById,
    ensureDefaultUserExists,
}