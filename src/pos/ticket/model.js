module.exports = (sequelize, DataTypes) => {
  const Ticket = sequelize.define('ticket', {
    ticketNumber: {
      type: DataTypes.STRING(20),
    //   allowNull: false,
      unique: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'preparing', 'ready', 'served', 'paid','cancel','void'),
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
    total: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    paymentStatus: {
      type: DataTypes.ENUM('pending', 'paid', 'refunded','cancel'),
      defaultValue: 'pending'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
  });

  // Static method to generate ticket number
  Ticket.generateTicketNumber = async function() {
    const { Op } = require('sequelize');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

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

    // Format: DD/TT (where DD is ticket number 01-30, TT is round number)
    const paddedTicket = String(ticketInDay).padStart(2, '0');
    const paddedRound = String(round).padStart(2, '0');
    
    return `${paddedTicket}/${paddedRound}`;
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