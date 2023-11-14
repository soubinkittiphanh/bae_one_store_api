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

module.exports = {
    getUserById,
}