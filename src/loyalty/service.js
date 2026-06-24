const { loyaltyTransaction, client, spf, sequelize } = require('../models');
const logger = require('../api/logger');

/**
 * Get loyalty configuration from SPF
 */
const getConfig = async () => {
    const params = await spf.findAll({
        where: {
            code: ['LOYALTY_ENABLED', 'LOYALTY_EARN_RATE', 'LOYALTY_REDEEM_RATE']
        }
    });

    const config = {
        enabled: params.find(p => p.code === 'LOYALTY_ENABLED')?.value === 'Y',
        earnRate: parseFloat(params.find(p => p.code === 'LOYALTY_EARN_RATE')?.value || '10000'), // Amount per 1 point
        redeemRate: parseFloat(params.find(p => p.code === 'LOYALTY_REDEEM_RATE')?.value || '10'), // Discount per 1 point
    };

    return config;
};

/**
 * Award points to a client based on sale amount
 */
exports.awardPoints = async (clientId, saleHeaderId, amount, transaction) => {
    try {
        const config = await getConfig();
        if (!config.enabled) return null;

        const pointsToAward = Math.floor(amount / config.earnRate);
        if (pointsToAward <= 0) return null;

        logger.info(`Awarding ${pointsToAward} points to client ${clientId} for sale ${saleHeaderId}`);

        // 1. Create loyalty transaction
        await loyaltyTransaction.create({
            clientId,
            saleHeaderId,
            points: pointsToAward,
            type: 'AWARDED',
            remark: `Points earned from sale #${saleHeaderId}`
        }, { transaction });

        // 2. Update client balance
        const customer = await client.findByPk(clientId, { transaction });
        if (customer) {
            await customer.increment('loyaltyPoints', { by: pointsToAward, transaction });
        }

        return pointsToAward;
    } catch (error) {
        logger.error(`Error awarding points: ${error.message}`);
        throw error;
    }
};

/**
 * Redeem points for a discount
 */
exports.redeemPoints = async (clientId, saleHeaderId, points, transaction) => {
    try {
        const config = await getConfig();
        if (!config.enabled) throw new Error('Loyalty program is disabled');

        const customer = await client.findByPk(clientId, { transaction });
        if (!customer || customer.loyaltyPoints < points) {
            throw new Error('Insufficient loyalty points');
        }

        logger.info(`Redeeming ${points} points for client ${clientId} for sale ${saleHeaderId}`);

        // 1. Create loyalty transaction
        await loyaltyTransaction.create({
            clientId,
            saleHeaderId,
            points: -points,
            type: 'REDEEMED',
            remark: `Points redeemed for discount${saleHeaderId ? ` in sale #${saleHeaderId}` : ''}`
        }, { transaction });

        // 2. Update client balance
        await customer.decrement('loyaltyPoints', { by: points, transaction });

        const discountAmount = points * config.redeemRate;
        return discountAmount;
    } catch (error) {
        logger.error(`Error redeeming points: ${error.message}`);
        throw error;
    }
};

/**
 * Reverse points awarded/redeemed for a sale (on cancellation)
 */
exports.reversePointsForSale = async (saleHeaderId, transaction) => {
    try {
        const txns = await loyaltyTransaction.findAll({
            where: { saleHeaderId, isActive: true },
            transaction
        });

        for (const txn of txns) {
            logger.info(`Reversing loyalty transaction ${txn.id} for sale ${saleHeaderId}`);

            let remark = `Reversal of transaction #${txn.id} due to sale cancellation`;
            if (txn.type === 'REDEEMED') {
                remark = `Refunded points from Cancelled Sale ID: ${saleHeaderId}`;
            } else if (txn.type === 'AWARDED') {
                remark = `Reversal of awarded points for Sale ID: ${saleHeaderId}`;
            }

            // Create reversal transaction
            await loyaltyTransaction.create({
                clientId: txn.clientId,
                saleHeaderId: txn.saleHeaderId,
                points: -txn.points,
                type: 'CANCELLED',
                remark
            }, { transaction });

            // Update client balance (reverse the previous change)
            const customer = await client.findByPk(txn.clientId, { transaction });
            if (customer) {
                // If points were positive (awarded), we subtract them.
                // If points were negative (redeemed), we add them back.
                await customer.increment('loyaltyPoints', { by: -txn.points, transaction });
            }

            // Deactivate original transaction
            await txn.update({ isActive: false }, { transaction });
        }
    } catch (error) {
        logger.error(`Error reversing points: ${error.message}`);
        throw error;
    }
};

/**
 * Get all loyalty transactions for a specific client
 */
exports.getTransactionsByClient = async (clientId) => {
    try {
        return await loyaltyTransaction.findAll({
            where: { clientId },
            order: [['createdAt', 'DESC']]
        });
    } catch (error) {
        logger.error(`Error fetching loyalty transactions for client ${clientId}: ${error.message}`);
        throw error;
    }
};

/**
 * Get summary of loyalty transactions by date range
 */
exports.getSummaryReport = async (fromDate, toDate) => {
    try {
        const { Op } = require('sequelize');
        
        const where = {
            isActive: true,
            createdAt: {
                [Op.between]: [fromDate + ' 00:00:00', toDate + ' 23:59:59']
            }
        };

        const txns = await loyaltyTransaction.findAll({
            where,
            include: [
                { 
                    model: client, 
                    as: 'client', 
                    attributes: ['name', 'telephone', 'company'] 
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const summary = {
            totalAwarded: 0,
            totalRedeemed: 0,
            totalCancelled: 0,
            transactions: txns
        };

        txns.forEach(t => {
            if (t.type === 'AWARDED') summary.totalAwarded += t.points;
            else if (t.type === 'REDEEMED') summary.totalRedeemed += Math.abs(t.points);
            else if (t.type === 'CANCELLED') summary.totalCancelled += Math.abs(t.points);
        });

        const config = await getConfig();

        return {
            ...summary,
            config
        };
    } catch (error) {
        logger.error(`Error generating loyalty summary report: ${error.message}`);
        throw error;
    }
};
