module.exports = (sequelize, DataTypes) => {
    const Ticket = sequelize.define('ticket', {
        ticketNumber: {
            type: DataTypes.STRING(20),
            //   allowNull: false,
            unique: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'preparing', 'ready', 'served', 'paid', 'cancel', 'void'),
            defaultValue: 'pending'
        },
        subtotal: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        tax: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        taxType: {
            type: DataTypes.ENUM('INC', 'EXC'),
            allowNull: false,
            defaultValue: 'INC'
        },
        total: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        paymentStatus: {
            type: DataTypes.ENUM('pending', 'paid', 'refunded', 'cancel'),
            defaultValue: 'pending'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // In your Ticket model definition
        promotionDiscount: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0,
            allowNull: false
        },
        appliedPromotions: {
            type: DataTypes.TEXT, // Store JSON string
            allowNull: true,
            get() {
                const value = this.getDataValue('appliedPromotions');
                return value ? JSON.parse(value) : [];
            },
            set(value) {
                this.setDataValue('appliedPromotions', value ? JSON.stringify(value) : null);
            }
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
    });

    // Static method to generate ticket number// Static method to generate ticket number with date for uniqueness
    Ticket.generateTicketNumber = async function () {
        const { Op } = require('sequelize');

        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Get date string (YYMMDD format)
            const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ''); // 251015

            // Count tickets created today
            const todayTicketCount = await Ticket.count({
                where: {
                    createdAt: {
                        [Op.gte]: today,
                        [Op.lt]: tomorrow
                    }
                }
            });

            // Calculate ticket number and round
            const ticketInDay = (todayTicketCount % 30) + 1; // 1-30
            const round = Math.floor(todayTicketCount / 30) + 1; // Round starts at 1

            // Format: DD/TT-YYMMDD (e.g., 01/01-251015)
            const paddedTicket = String(ticketInDay).padStart(2, '0');
            const paddedRound = String(round).padStart(2, '0');
            const ticketNumber = `${paddedTicket}/${paddedRound}-${dateStr}`;

            // Check if this ticket number already exists
            const existingTicket = await Ticket.findOne({
                where: { ticketNumber }
            });

            // If doesn't exist, return it
            if (!existingTicket) {
                console.log(`Generated unique ticket number: ${ticketNumber}`);
                return ticketNumber;
            }

            // If exists, increment attempts
            attempts++;
            console.warn(`Ticket number ${ticketNumber} already exists. Retry ${attempts}/${maxAttempts}`);

            // Wait a tiny bit before retrying to avoid race conditions
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Fallback: Add timestamp if all attempts failed
        const timestamp = Date.now().toString().slice(-4);
        const today = new Date();
        const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
        const fallbackNumber = `99/99-${dateStr}-${timestamp}`;

        console.error(`Failed to generate unique ticket number after ${maxAttempts} attempts. Using fallback: ${fallbackNumber}`);
        return fallbackNumber;
    };

    Ticket.associate = models => {
        Ticket.belongsTo(models.table, {
            foreignKey: 'tableId',
            as: 'table',
        });
        Ticket.belongsTo(models.payment, {
            foreignKey: 'paymentId',
            as: 'payment',
        });
        Ticket.belongsTo(models.client, {
            foreignKey: 'clientId',
            as: 'client',
        });
        Ticket.hasMany(models.ticketLine, {
            foreignKey: 'ticketId',
            as: 'ticketLines',
        });
    };

    return Ticket;
};