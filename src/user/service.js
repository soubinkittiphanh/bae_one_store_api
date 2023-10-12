const logger = require('../api/logger');
const User = require('../models').user;
const Terminal = require('../models').terminal;
const Group = require('../models').group;
const Authority = require('../models').authority;
const getUserById = async ( cus_id, cus_pass) => {

    try {
        const user = await User.findOne({
            where: {
                cus_id, cus_pass
            }, include: [{
                model: Terminal,
                through: { attributes: [] }
            },
            {
                model: Group,
                as: 'userGroup', // set the alias for the userGroup association
                include: [
                    {
                        model: Authority
                    }
                ]
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