const { MemberOffer } = require('../models');
const  Client  = require('../models').client;
const  ProductCategory  = require('../models').category;
const { Op } = require('sequelize');

/**
 * Member Offer Controller
 * Handles all member offer operations including CRUD and business logic
 */
class MemberOfferController {

    /**
     * Get all member offers with pagination and filtering
     * GET /api/member-offers
     */
    static async getAllOffers(req, res) {
        try {
            const {
                page = 1,
                limit = 25,
                memberId,
                categoryId,
                isActive,
                startDate,
                endDate,
                search
            } = req.query;

            const offset = (page - 1) * limit;
            const whereClause = {};

            // Apply filters
            if (memberId) whereClause.memberId = memberId;
            if (categoryId) whereClause.categoryId = categoryId;
            if (isActive !== undefined) whereClause.isActive = isActive === 'true';
            
            // Date range filtering
            if (startDate || endDate) {
                whereClause.startDate = {};
                if (startDate) whereClause.startDate[Op.gte] = startDate;
                if (endDate) whereClause.endDate = { [Op.lte]: endDate };
            }

            // Search in offer name
            if (search) {
                whereClause.offerName = {
                    [Op.like]: `%${search}%`
                };
            }

            const { count, rows } = await MemberOffer.findAndCountAll({
                where: whereClause,
                include: [
                    {
                        model: Client,
                        as: 'member',
                        attributes: ['id', 'name', 'company', 'class']
                    },
                    {
                        model: ProductCategory,
                        as: 'category',
                        attributes: ['id', 'name', 'description']
                    }
                ],
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const totalPages = Math.ceil(count / limit);

            res.status(200).json({
                success: true,
                data: {
                    offers: rows,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages,
                        totalItems: count,
                        itemsPerPage: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching member offers:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching member offers',
                error: error.message
            });
        }
    }

    /**
     * Get member offer by ID
     * GET /api/member-offers/:id
     */
    static async getOfferById(req, res) {
        try {
            const { id } = req.params;

            const offer = await MemberOffer.findByPk(id, {
                include: [
                    {
                        model: Client,
                        as: 'member',
                        attributes: ['id', 'name', 'company', 'class']
                    },
                    {
                        model: ProductCategory,
                        as: 'category',
                        attributes: ['id', 'name', 'description']
                    }
                ]
            });

            if (!offer) {
                return res.status(404).json({
                    success: false,
                    message: 'Member offer not found'
                });
            }

            // Add computed fields
            const offerData = offer.toJSON();
            offerData.remainingQty = offer.getRemainingQty();
            offerData.isExpired = offer.isExpired();
            offerData.isValidToday = offer.isValidToday();

            res.status(200).json({
                success: true,
                data: offerData
            });

        } catch (error) {
            console.error('Error fetching member offer:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching member offer',
                error: error.message
            });
        }
    }

    /**
     * Create new member offer
     * POST /api/member-offers
     */
    static async createOffer(req, res) {
        try {
            const {
                memberId,
                categoryId,
                offerName,
                allowedQty,
                startDate,
                endDate,
                isActive = true
            } = req.body;

            // Validation
            if (!memberId || !categoryId || !offerName || !allowedQty || !startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: memberId, categoryId, offerName, allowedQty, startDate, endDate'
                });
            }

            // Check if member exists
            const member = await Client.findByPk(memberId);
            if (!member) {
                return res.status(404).json({
                    success: false,
                    message: 'Member not found'
                });
            }

            // Check if category exists
            const category = await ProductCategory.findByPk(categoryId);
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Product category not found'
                });
            }

            // Create the offer
            const offer = await MemberOffer.create({
                memberId,
                categoryId,
                offerName,
                allowedQty: parseInt(allowedQty),
                usedQty: 0,
                startDate,
                endDate,
                isActive
            });

            // Fetch the created offer with associations
            const createdOffer = await MemberOffer.findByPk(offer.id, {
                include: [
                    { model: Client, as: 'member', attributes: ['id', 'name', 'company'] },
                    { model: ProductCategory, as: 'category', attributes: ['categ_id', 'categ_name'] }
                ]
            });

            res.status(201).json({
                success: true,
                message: 'Member offer created successfully',
                data: createdOffer
            });

        } catch (error) {
            console.error('Error creating member offer:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating member offer',
                error: error.message
            });
        }
    }

    /**
     * Update member offer
     * PUT /api/member-offers/:id
     */
    static async updateOffer(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const offer = await MemberOffer.findByPk(id);
            if (!offer) {
                return res.status(404).json({
                    success: false,
                    message: 'Member offer not found'
                });
            }

            // Update the offer
            await offer.update(updateData);

            // Fetch updated offer with associations
            const updatedOffer = await MemberOffer.findByPk(id, {
                include: [
                    { model: Client, as: 'member', attributes: ['id', 'name', 'company'] },
                    { model: ProductCategory, as: 'category', attributes: ['id', 'name'] }
                ]
            });

            res.status(200).json({
                success: true,
                message: 'Member offer updated successfully',
                data: updatedOffer
            });

        } catch (error) {
            console.error('Error updating member offer:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating member offer',
                error: error.message
            });
        }
    }

    /**
     * Delete member offer
     * DELETE /api/member-offers/:id
     */
    static async deleteOffer(req, res) {
        try {
            const { id } = req.params;

            const offer = await MemberOffer.findByPk(id);
            if (!offer) {
                return res.status(404).json({
                    success: false,
                    message: 'Member offer not found'
                });
            }

            await offer.destroy();

            res.status(200).json({
                success: true,
                message: 'Member offer deleted successfully'
            });

        } catch (error) {
            console.error('Error deleting member offer:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting member offer',
                error: error.message
            });
        }
    }

    /**
     * Get active offers by member ID
     * GET /api/member-offers/member/:memberId/active
     */
    static async getActiveOffersByMember(req, res) {
        try {
            const { memberId } = req.params;

            const offers = await MemberOffer.getActiveOffersByMember(memberId);

            // Add computed fields
            const offersWithComputedFields = offers.map(offer => {
                const offerData = offer.toJSON();
                offerData.remainingQty = offer.getRemainingQty();
                offerData.isExpired = offer.isExpired();
                offerData.isValidToday = offer.isValidToday();
                return offerData;
            });

            res.status(200).json({
                success: true,
                data: offersWithComputedFields
            });

        } catch (error) {
            console.error('Error fetching active offers by member:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching active offers by member',
                error: error.message
            });
        }
    }

    /**
     * Get valid offers by member and category
     * GET /api/member-offers/member/:memberId/category/:categoryId
     */
    static async getValidOffersByMemberAndCategory(req, res) {
        try {
            const { memberId, categoryId } = req.params;

            const offers = await MemberOffer.getValidOffersByMemberAndCategory(memberId, categoryId);

            // Add computed fields
            const offersWithComputedFields = offers.map(offer => {
                const offerData = offer.toJSON();
                offerData.remainingQty = offer.getRemainingQty();
                offerData.canUse = offer.isValidToday();
                return offerData;
            });

            res.status(200).json({
                success: true,
                data: offersWithComputedFields
            });

        } catch (error) {
            console.error('Error fetching valid offers by member and category:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching valid offers by member and category',
                error: error.message
            });
        }
    }

    /**
     * Use offer items
     * POST /api/member-offers/:id/use
     */
    static async useOffer(req, res) {
        try {
            const { id } = req.params;
            const { quantity = 1 } = req.body;

            const offer = await MemberOffer.findByPk(id);
            if (!offer) {
                return res.status(404).json({
                    success: false,
                    message: 'Member offer not found'
                });
            }

            // Check if offer can be used
            if (!offer.canUseItem(quantity)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot use offer: expired, inactive, or insufficient remaining quantity',
                    remainingQty: offer.getRemainingQty(),
                    isValidToday: offer.isValidToday()
                });
            }

            // Use the offer
            await offer.useItems(quantity);

            // Fetch updated offer
            const updatedOffer = await MemberOffer.findByPk(id, {
                include: [
                    { model: Client, as: 'member', attributes: ['id', 'name'] },
                    { model: ProductCategory, as: 'category', attributes: ['id', 'name'] }
                ]
            });

            const offerData = updatedOffer.toJSON();
            offerData.remainingQty = updatedOffer.getRemainingQty();

            res.status(200).json({
                success: true,
                message: `Successfully used ${quantity} item(s) from offer`,
                data: offerData
            });

        } catch (error) {
            console.error('Error using offer:', error);
            res.status(500).json({
                success: false,
                message: 'Error using offer',
                error: error.message
            });
        }
    }

    /**
     * Get offer statistics
     * GET /api/member-offers/stats
     */
    static async getOfferStats(req, res) {
        try {
            const { memberId } = req.query;

            let whereClause = {};
            if (memberId) whereClause.memberId = memberId;

            const totalOffers = await MemberOffer.count({ where: whereClause });
            
            const activeOffers = await MemberOffer.count({
                where: {
                    ...whereClause,
                    isActive: true,
                    startDate: { [Op.lte]: new Date() },
                    endDate: { [Op.gte]: new Date() }
                }
            });

            const expiredOffers = await MemberOffer.count({
                where: {
                    ...whereClause,
                    endDate: { [Op.lt]: new Date() }
                }
            });

            const usedOffers = await MemberOffer.count({
                where: {
                    ...whereClause,
                    usedQty: { [Op.gt]: 0 }
                }
            });

            res.status(200).json({
                success: true,
                data: {
                    totalOffers,
                    activeOffers,
                    expiredOffers,
                    usedOffers,
                    unusedOffers: totalOffers - usedOffers
                }
            });

        } catch (error) {
            console.error('Error fetching offer stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching offer stats',
                error: error.message
            });
        }
    }

    /**
     * Toggle offer status (activate/deactivate)
     * PATCH /api/member-offers/:id/toggle-status
     */
    static async toggleOfferStatus(req, res) {
        try {
            const { id } = req.params;

            const offer = await MemberOffer.findByPk(id);
            if (!offer) {
                return res.status(404).json({
                    success: false,
                    message: 'Member offer not found'
                });
            }

            await offer.update({ isActive: !offer.isActive });

            res.status(200).json({
                success: true,
                message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
                data: { id: offer.id, isActive: offer.isActive }
            });

        } catch (error) {
            console.error('Error toggling offer status:', error);
            res.status(500).json({
                success: false,
                message: 'Error toggling offer status',
                error: error.message
            });
        }
    }
}

module.exports = MemberOfferController;