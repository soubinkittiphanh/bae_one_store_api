const logger = require('../api/logger');
const User = require('../models').user;
const Terminal = require('../models').terminal;
const Group = require('../models').group;
const Authority = require('../models').menuHeader;
const MenuLine = require('../models').menuLine;
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

// const createDefaultUser = async (user) => {
//     try {


//         const defaultUser = await User.create(user);

//         logger.info(`********** Default User Created: ${JSON.stringify(defaultUser)} **********`);
//         return defaultUser;
//     } catch (error) {
//         logger.error(`Cannot create default user with error: ${error}`);
//         return null;
//     }
// };

const ensureDefaultUserExists = async (user_create) => {
    try {
        const users = await countUser();

        if (!users || users.length === 0) {
            logger.info('No users found. Creating default user...');

            const defaultUser = await User.create(user_create);

            if (defaultUser) {
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
};


module.exports = {
    getUserById,
    ensureDefaultUserExists,
}