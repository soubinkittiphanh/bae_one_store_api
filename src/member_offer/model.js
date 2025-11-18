module.exports = (sequelize, DataTypes) => {
    const MemberOffer = sequelize.define('member_offer', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        offerName: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: 'e.g. "10 Drinks Free Offer"'
        },
        allowedQty: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Total items allowed in this offer'
        },
        usedQty: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'How many items already used'
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            comment: 'Offer valid from this date'
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            comment: 'Offer valid until this date'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: 'Whether the offer is still valid'
        },
    }, {
        sequelize,
        // Enable timestamps
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        // Don't pluralize table name
        freezeTableName: true,
        
        // Table options
        tableName: 'member_offer',
        
        // Indexes for better performance
        indexes: [
            {
                fields: ['memberId']
            },
            {
                fields: ['categoryId']
            },
            {
                fields: ['startDate', 'endDate']
            },
            {
                fields: ['isActive']
            },
            {
                // Composite index for active offers by member
                fields: ['memberId', 'isActive']
            }
        ],
        
        // Validation at model level
        validate: {
            // Ensure end date is after start date
            endDateAfterStartDate() {
                if (this.startDate && this.endDate && this.endDate <= this.startDate) {
                    throw new Error('End date must be after start date');
                }
            },
            // Ensure used quantity doesn't exceed allowed quantity
            usedQtyNotExceedAllowed() {
                if (this.usedQty > this.allowedQty) {
                    throw new Error('Used quantity cannot exceed allowed quantity');
                }
            }
        }
    });

    // Define associations (to be called in index.js)
    MemberOffer.associate = function(models) {
        // Member Offer belongs to a Member (Client)
        MemberOffer.belongsTo(models.client, {
            foreignKey: 'memberId',
            as: 'member',
            onDelete: 'CASCADE'
        });

        // Member Offer belongs to a Product Category
        MemberOffer.belongsTo(models.category, {
            foreignKey: 'categoryId',
            as: 'category',
            onDelete: 'RESTRICT'
        });
    };

    // Instance methods
    MemberOffer.prototype.getRemainingQty = function() {
        return this.allowedQty - this.usedQty;
    };

    MemberOffer.prototype.isExpired = function() {
        const today = new Date();
        return this.endDate < today;
    };

    MemberOffer.prototype.isValidToday = function() {
        const today = new Date();
        return this.isActive && 
               this.startDate <= today && 
               this.endDate >= today &&
               this.getRemainingQty() > 0;
    };

    MemberOffer.prototype.canUseItem = function(quantity = 1) {
        return this.isValidToday() && this.getRemainingQty() >= quantity;
    };

    MemberOffer.prototype.useItems = async function(quantity = 1) {
        if (!this.canUseItem(quantity)) {
            throw new Error('Cannot use items: offer expired, inactive, or insufficient remaining quantity');
        }
        
        this.usedQty += quantity;
        await this.save();
        return this;
    };

    // Class methods
    MemberOffer.getActiveOffersByMember = function(memberId) {
        return this.findAll({
            where: {
                memberId: memberId,
                isActive: true,
                startDate: {
                    [sequelize.Sequelize.Op.lte]: new Date()
                },
                endDate: {
                    [sequelize.Sequelize.Op.gte]: new Date()
                }
            },
            include: [
                {
                    model: sequelize.models.category,
                    as: 'category'
                }
            ]
        });
    };

    MemberOffer.getValidOffersByMemberAndCategory = function(memberId, categoryId) {
        return this.findAll({
            where: {
                memberId: memberId,
                categoryId: categoryId,
                isActive: true,
                startDate: {
                    [sequelize.Sequelize.Op.lte]: new Date()
                },
                endDate: {
                    [sequelize.Sequelize.Op.gte]: new Date()
                },
                usedQty: {
                    [sequelize.Sequelize.Op.lt]: sequelize.Sequelize.col('allowedQty')
                }
            }
        });
    };

    return MemberOffer;
};

/*
 * Usage Examples:
 * 
 * 1. Create a new offer:
 * const offer = await MemberOffer.create({
 *     memberId: 1,
 *     categoryId: 2,
 *     offerName: "10 Drinks Free Offer",
 *     allowedQty: 10,
 *     startDate: "2025-01-01",
 *     endDate: "2025-12-31"
 * });
 * 
 * 2. Get active offers for a member:
 * const activeOffers = await MemberOffer.getActiveOffersByMember(1);
 * 
 * 3. Use an offer:
 * const offer = await MemberOffer.findByPk(1);
 * if (offer.canUseItem(2)) {
 *     await offer.useItems(2);
 *     console.log(`Remaining: ${offer.getRemainingQty()}`);
 * }
 * 
 * 4. Check if offer is valid:
 * const isValid = offer.isValidToday();
 * const remaining = offer.getRemainingQty();
 */