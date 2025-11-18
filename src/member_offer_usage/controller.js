const  {MemberOfferUsage}  = require('../models');
const  {MemberOffer} = require('../models');
const  Client  = require('../models').client;
const  ProductCategory  = require('../models').category;
const  Product  = require('../models').product;
const { Op } = require('sequelize');

/**
 * Member Offer Usage Controller
 * Handles tracking and reporting of offer usage
 */
class MemberOfferUsageController {

    /**
     * Get all usage records with pagination and filtering
     * GET /api/member-offer-usage
     */
    static async getAllUsage(req, res) {
        try {
            const {
                page = 1,
                limit = 25,
                memberOfferId,
                ticketId,
                categoryId,
                itemId,
                startDate,
                endDate,
                memberId
            } = req.query;

            const offset = (page - 1) * limit;
            const whereClause = {};

            // Apply filters
            if (memberOfferId) whereClause.memberOfferId = memberOfferId;
            if (ticketId) whereClause.ticketId = ticketId;
            if (categoryId) whereClause.categoryId = categoryId;
            if (itemId) whereClause.itemId = itemId;

            // Date range filtering
            if (startDate || endDate) {
                whereClause.usedDate = {};
                if (startDate) whereClause.usedDate[Op.gte] = startDate;
                if (endDate) whereClause.usedDate[Op.lte] = endDate;
            }

            const includeClause = [
                {
                    model: MemberOffer,
                    as: 'memberOffer',
                    attributes: ['id', 'offerName', 'allowedQty', 'usedQty'],
                    include: [{
                        model: Client,
                        as: 'member',
                        attributes: ['id', 'name', 'class']
                    }]
                },
                {
                    model: ProductCategory,
                    as: 'category',
                    attributes: ['id', 'name']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'price'],
                    required: false
                }
            ];

            // Filter by member if specified
            if (memberId) {
                includeClause[0].where = { memberId };
            }

            const { count, rows } = await MemberOfferUsage.findAndCountAll({
                where: whereClause,
                include: includeClause,
                order: [['usedDate', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const totalPages = Math.ceil(count / limit);

            res.status(200).json({
                success: true,
                data: {
                    usage: rows,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages,
                        totalItems: count,
                        itemsPerPage: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching usage records:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching usage records',
                error: error.message
            });
        }
    }

    /**
     * Create new usage record
     * POST /api/member-offer-usage
     */
    static async createUsage(req, res) {
        try {
            const {
                memberOfferId,
                ticketId,
                categoryId,
                itemId,
                qtyUsed = 1,
                originalPrice,
                notes
            } = req.body;

            // Validation
            if (!memberOfferId || !ticketId || !categoryId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: memberOfferId, ticketId, categoryId'
                });
            }

            // Create usage using the model's static method
            const usage = await MemberOfferUsage.createUsage({
                memberOfferId,
                ticketId,
                categoryId,
                itemId,
                qtyUsed: parseInt(qtyUsed),
                originalPrice: originalPrice ? parseFloat(originalPrice) : null,
                notes
            });

            // Fetch the created usage with associations
            const createdUsage = await MemberOfferUsage.findByPk(usage.id, {
                include: [
                    {
                        model: MemberOffer,
                        as: 'memberOffer',
                        attributes: ['id', 'offerName', 'allowedQty', 'usedQty'],
                        include: [{
                            model: Client,
                            as: 'member',
                            attributes: ['id', 'name']
                        }]
                    },
                    {
                        model: ProductCategory,
                        as: 'category',
                        attributes: ['id', 'name']
                    },
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name', 'price'],
                        required: false
                    }
                ]
            });

            res.status(201).json({
                success: true,
                message: 'Usage recorded successfully',
                data: createdUsage
            });

        } catch (error) {
            console.error('Error creating usage record:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating usage record',
                error: error.message
            });
        }
    }

    /**
     * Get usage records by offer ID
     * GET /api/member-offer-usage/offer/:memberOfferId
     */
    static async getUsageByOffer(req, res) {
        try {
            const { memberOfferId } = req.params;
            const { startDate, endDate, limit = 100 } = req.query;

            const usage = await MemberOfferUsage.getUsageByOffer(memberOfferId, {
                startDate,
                endDate,
                limit: parseInt(limit)
            });

            res.status(200).json({
                success: true,
                data: usage
            });

        } catch (error) {
            console.error('Error fetching usage by offer:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching usage by offer',
                error: error.message
            });
        }
    }

    /**
     * Get usage records by ticket ID
     * GET /api/member-offer-usage/ticket/:ticketId
     */
    static async getUsageByTicket(req, res) {
        try {
            const { ticketId } = req.params;

            const usage = await MemberOfferUsage.getUsageByTicket(ticketId);

            // Calculate total savings for this ticket
            const totalSavings = usage.reduce((sum, record) => {
                return sum + (parseFloat(record.originalPrice) || 0);
            }, 0);

            res.status(200).json({
                success: true,
                data: {
                    usage,
                    totalSavings,
                    totalItemsUsed: usage.reduce((sum, record) => sum + record.qtyUsed, 0)
                }
            });

        } catch (error) {
            console.error('Error fetching usage by ticket:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching usage by ticket',
                error: error.message
            });
        }
    }

    /**
     * Get usage statistics by member
     * GET /api/member-offer-usage/member/:memberId/stats
     */
    static async getUsageStatsByMember(req, res) {
        try {
            const { memberId } = req.params;
            const { startDate, endDate } = req.query;

            const stats = await MemberOfferUsage.getUsageStatsByMember(memberId, {
                startDate,
                endDate
            });

            // Calculate overall totals
            const overallStats = stats.reduce((totals, stat) => ({
                totalUsages: totals.totalUsages + parseInt(stat.dataValues.totalUsages),
                totalQtyUsed: totals.totalQtyUsed + parseInt(stat.dataValues.totalQtyUsed),
                totalSavings: totals.totalSavings + parseFloat(stat.dataValues.totalSavings || 0)
            }), { totalUsages: 0, totalQtyUsed: 0, totalSavings: 0 });

            res.status(200).json({
                success: true,
                data: {
                    categoryStats: stats,
                    overall: overallStats
                }
            });

        } catch (error) {
            console.error('Error fetching usage stats by member:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching usage stats by member',
                error: error.message
            });
        }
    }

    /**
     * Get usage reports with aggregations
     * GET /api/member-offer-usage/reports
     */
    static async getUsageReports(req, res) {
        try {
            const {
                reportType = 'daily',
                startDate,
                endDate,
                categoryId,
                memberId
            } = req.query;

            let dateFormat;
            switch (reportType) {
                case 'hourly':
                    dateFormat = '%Y-%m-%d %H:00:00';
                    break;
                case 'daily':
                    dateFormat = '%Y-%m-%d';
                    break;
                case 'weekly':
                    dateFormat = '%Y-Week-%u';
                    break;
                case 'monthly':
                    dateFormat = '%Y-%m';
                    break;
                default:
                    dateFormat = '%Y-%m-%d';
            }

            const whereClause = {};
            if (startDate) whereClause.usedDate = { [Op.gte]: startDate };
            if (endDate) whereClause.usedDate = { ...whereClause.usedDate, [Op.lte]: endDate };
            if (categoryId) whereClause.categoryId = categoryId;

            const includeClause = [{
                model: MemberOffer,
                as: 'memberOffer',
                attributes: []
            }];

            if (memberId) {
                includeClause[0].where = { memberId };
            }

            const reports = await MemberOfferUsage.findAll({
                attributes: [
                    [sequelize.fn('DATE_FORMAT', sequelize.col('usedDate'), dateFormat), 'period'],
                    [sequelize.fn('COUNT', sequelize.col('MemberOfferUsage.id')), 'totalUsages'],
                    [sequelize.fn('SUM', sequelize.col('qtyUsed')), 'totalQtyUsed'],
                    [sequelize.fn('SUM', sequelize.col('originalPrice')), 'totalSavings'],
                    [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('ticketId'))), 'uniqueTickets']
                ],
                where: whereClause,
                include: includeClause,
                group: [sequelize.fn('DATE_FORMAT', sequelize.col('usedDate'), dateFormat)],
                order: [[sequelize.fn('DATE_FORMAT', sequelize.col('usedDate'), dateFormat), 'DESC']],
                raw: true
            });

            res.status(200).json({
                success: true,
                data: {
                    reportType,
                    reports
                }
            });

        } catch (error) {
            console.error('Error generating usage reports:', error);
            res.status(500).json({
                success: false,
                message: 'Error generating usage reports',
                error: error.message
            });
        }
    }

    /**
     * Get usage summary for dashboard
     * GET /api/member-offer-usage/dashboard
     */
    static async getDashboardSummary(req, res) {
        try {
            const { memberId, days = 30 } = req.query;

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(days));

            const whereClause = {
                usedDate: { [Op.gte]: startDate }
            };

            const includeClause = [{
                model: MemberOffer,
                as: 'memberOffer',
                attributes: ['memberId']
            }];

            if (memberId) {
                includeClause[0].where = { memberId };
            }

            // Total usage in period
            const totalUsage = await MemberOfferUsage.count({
                where: whereClause,
                include: includeClause
            });

            // Total savings
            const totalSavings = await MemberOfferUsage.sum('originalPrice', {
                where: whereClause,
                include: includeClause
            }) || 0;

            // Most used categories
            const topCategories = await MemberOfferUsage.findAll({
                attributes: [
                    'categoryId',
                    [sequelize.fn('COUNT', sequelize.col('MemberOfferUsage.id')), 'usageCount'],
                    [sequelize.fn('SUM', sequelize.col('qtyUsed')), 'totalQty']
                ],
                where: whereClause,
                include: [
                    {
                        model: ProductCategory,
                        as: 'category',
                        attributes: ['id', 'name']
                    },
                    includeClause[0]
                ],
                group: ['categoryId', 'category.id'],
                order: [[sequelize.fn('COUNT', sequelize.col('MemberOfferUsage.id')), 'DESC']],
                limit: 5,
                raw: false
            });

            // Recent usage activity
            const recentActivity = await MemberOfferUsage.findAll({
                where: whereClause,
                include: [
                    {
                        model: MemberOffer,
                        as: 'memberOffer',
                        attributes: ['id', 'offerName'],
                        where: memberId ? { memberId } : {},
                        include: [{
                            model: Client,
                            as: 'member',
                            attributes: ['id', 'name']
                        }]
                    },
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name'],
                        required: false
                    }
                ],
                order: [['usedDate', 'DESC']],
                limit: 10
            });

            res.status(200).json({
                success: true,
                data: {
                    summary: {
                        totalUsage,
                        totalSavings: parseFloat(totalSavings).toFixed(2),
                        period: `Last ${days} days`
                    },
                    topCategories,
                    recentActivity
                }
            });

        } catch (error) {
            console.error('Error generating dashboard summary:', error);
            res.status(500).json({
                success: false,
                message: 'Error generating dashboard summary',
                error: error.message
            });
        }
    }

    /**
     * Delete usage record (admin only)
     * DELETE /api/member-offer-usage/:id
     */
    static async deleteUsage(req, res) {
        try {
            const { id } = req.params;

            const usage = await MemberOfferUsage.findByPk(id, {
                include: [{
                    model: MemberOffer,
                    as: 'memberOffer'
                }]
            });

            if (!usage) {
                return res.status(404).json({
                    success: false,
                    message: 'Usage record not found'
                });
            }

            // Restore the quantity to the member offer
            const memberOffer = usage.memberOffer;
            await memberOffer.update({
                usedQty: Math.max(0, memberOffer.usedQty - usage.qtyUsed)
            });

            // Delete the usage record
            await usage.destroy();

            res.status(200).json({
                success: true,
                message: 'Usage record deleted and quantity restored to offer'
            });

        } catch (error) {
            console.error('Error deleting usage record:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting usage record',
                error: error.message
            });
        }
    }
}

module.exports = MemberOfferUsageController;