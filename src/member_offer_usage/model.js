module.exports = (sequelize, DataTypes) => {
    const MemberOfferUsage = sequelize.define('member_offer_usage', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        memberOfferId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'member_offer',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
        },

        qtyUsed: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 1
            },
            comment: 'How many items used from this offer'
        },
        usedDate: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            comment: 'When the offer was used'
        },
        // Additional tracking fields
        originalPrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: 'Original price of the item (for savings calculation)'
        },
        discountValue: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: 'Value of discount applied'
        },
        notes: {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: 'Additional notes about the usage'
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        tableName: 'member_offer_usage',
        
        // Indexes for better performance
        indexes: [
            {
                fields: ['memberOfferId']
            },
            {
                fields: ['ticketId']
            },
            {
                fields: ['categoryId']
            },
            {
                fields: ['itemId']
            },
            {
                fields: ['usedDate']
            },
            {
                // Composite index for reporting
                fields: ['memberOfferId', 'usedDate']
            },
            {
                // Composite index for ticket analysis
                fields: ['ticketId', 'categoryId']
            }
        ],
        
        // Model-level validation
        validate: {
            // Ensure used date is not in the future
            usedDateNotFuture() {
                if (this.usedDate && this.usedDate > new Date()) {
                    throw new Error('Used date cannot be in the future');
                }
            }
        }
    });

    // Define associations
    MemberOfferUsage.associate = function(models) {
        // Usage belongs to a Member Offer
        MemberOfferUsage.belongsTo(models.MemberOffer, {
            foreignKey: 'memberOfferId',
            as: 'memberOffer',
            onDelete: 'CASCADE'
        });

        // Usage belongs to a Ticket/Sale Header
        MemberOfferUsage.belongsTo(models.ticket, { // Adjust model name as needed
            foreignKey: 'ticketId',
            as: 'ticket',
            onDelete: 'RESTRICT'
        });

        // Usage belongs to a Category
        MemberOfferUsage.belongsTo(models.category, {
            foreignKey: 'categoryId',
            as: 'category',
            onDelete: 'RESTRICT'
        });

        // Usage belongs to a Product (optional)
        MemberOfferUsage.belongsTo(models.product, {
            foreignKey: 'itemId',
            as: 'product',
            onDelete: 'SET NULL'
        });

        // Reverse associations for member_offer model
        if (models.member_offer) {
            models.member_offer.hasMany(MemberOfferUsage, {
                foreignKey: 'memberOfferId',
                as: 'usages'
            });
        }
    };

    // Instance methods
    MemberOfferUsage.prototype.getSavingsAmount = function() {
        return this.originalPrice || 0;
    };

    MemberOfferUsage.prototype.getUsageDescription = function() {
        const productName = this.product?.name || 'Unknown Product';
        const categoryName = this.category?.name || 'Unknown Category';
        return `${this.qtyUsed}x ${productName} from ${categoryName} category`;
    };

    // Class methods
    MemberOfferUsage.getUsageByOffer = function(memberOfferId, options = {}) {
        const { startDate, endDate, limit = 100 } = options;
        
        const whereClause = { memberOfferId };
        
        if (startDate || endDate) {
            whereClause.usedDate = {};
            if (startDate) whereClause.usedDate[sequelize.Sequelize.Op.gte] = startDate;
            if (endDate) whereClause.usedDate[sequelize.Sequelize.Op.lte] = endDate;
        }

        return this.findAll({
            where: whereClause,
            include: [
                {
                    model: sequelize.models.ticket_header,
                    as: 'ticket',
                    attributes: ['id', 'ticketNumber', 'totalAmount']
                },
                {
                    model: sequelize.models.product,
                    as: 'product',
                    attributes: ['id', 'name', 'price']
                },
                {
                    model: sequelize.models.product_category,
                    as: 'category',
                    attributes: ['id', 'name']
                }
            ],
            order: [['usedDate', 'DESC']],
            limit
        });
    };

    MemberOfferUsage.getUsageByTicket = function(ticketId) {
        return this.findAll({
            where: { ticketId },
            include: [
                {
                    model: sequelize.models.member_offer,
                    as: 'memberOffer',
                    attributes: ['id', 'offerName', 'allowedQty', 'usedQty']
                },
                {
                    model: sequelize.models.product,
                    as: 'product',
                    attributes: ['id', 'name', 'price']
                }
            ]
        });
    };

    MemberOfferUsage.getUsageStatsByMember = function(memberId, options = {}) {
        const { startDate, endDate } = options;
        
        const whereClause = {};
        if (startDate || endDate) {
            whereClause.usedDate = {};
            if (startDate) whereClause.usedDate[sequelize.Sequelize.Op.gte] = startDate;
            if (endDate) whereClause.usedDate[sequelize.Sequelize.Op.lte] = endDate;
        }

        return this.findAll({
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalUsages'],
                [sequelize.fn('SUM', sequelize.col('qtyUsed')), 'totalQtyUsed'],
                [sequelize.fn('SUM', sequelize.col('originalPrice')), 'totalSavings'],
                'categoryId'
            ],
            where: whereClause,
            include: [
                {
                    model: sequelize.models.member_offer,
                    as: 'memberOffer',
                    where: { memberId },
                    attributes: []
                },
                {
                    model: sequelize.models.product_category,
                    as: 'category',
                    attributes: ['id', 'name']
                }
            ],
            group: ['categoryId', 'category.id'],
            raw: false
        });
    };

    // Static method to create usage record
    MemberOfferUsage.createUsage = async function(usageData) {
        const {
            memberOfferId,
            ticketId,
            categoryId,
            itemId,
            qtyUsed = 1,
            originalPrice = null,
            notes = null
        } = usageData;

        // Validate that the member offer exists and can be used
        const memberOffer = await sequelize.models.member_offer.findByPk(memberOfferId);
        if (!memberOffer) {
            throw new Error('Member offer not found');
        }

        if (!memberOffer.canUseItem(qtyUsed)) {
            throw new Error('Cannot use offer: expired, inactive, or insufficient remaining quantity');
        }

        // Create usage record
        const usage = await this.create({
            memberOfferId,
            ticketId,
            categoryId,
            itemId,
            qtyUsed,
            originalPrice,
            discountValue: originalPrice, // Assuming full discount
            notes,
            usedDate: new Date()
        });

        // Update the member offer's used quantity
        await memberOffer.useItems(qtyUsed);

        return usage;
    };

    return MemberOfferUsage;
};

/*
 * Usage Examples:
 * 
 * 1. Create usage record when processing a sale:
 * const usage = await MemberOfferUsage.createUsage({
 *     memberOfferId: 1,
 *     ticketId: 123,
 *     categoryId: 2,
 *     itemId: 45,
 *     qtyUsed: 2,
 *     originalPrice: 10.50,
 *     notes: 'Free drinks with Gold membership'
 * });
 * 
 * 2. Get usage history for an offer:
 * const usageHistory = await MemberOfferUsage.getUsageByOffer(1, {
 *     startDate: '2025-01-01',
 *     endDate: '2025-12-31'
 * });
 * 
 * 3. Get usage for a specific ticket:
 * const ticketUsage = await MemberOfferUsage.getUsageByTicket(123);
 * 
 * 4. Get member usage statistics:
 * const memberStats = await MemberOfferUsage.getUsageStatsByMember(1, {
 *     startDate: '2025-01-01'
 * });
 * 
 * 5. Check what offers were used in a ticket:
 * const usage = await MemberOfferUsage.findAll({
 *     where: { ticketId: 123 },
 *     include: ['memberOffer', 'product', 'category']
 * });
 */