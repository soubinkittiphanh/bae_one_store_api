module.exports = (sequelize, DataTypes) => {
  const ParkingPayment = sequelize.define('parking_payment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    paymentNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    paymentMethod: {
      type: DataTypes.ENUM('CASH', 'TRANSFER', 'QR', 'CARD', 'FREE_PASS'),
      allowNull: false,
      defaultValue: 'CASH'
    },
    paymentStatus: {
      type: DataTypes.ENUM('completed', 'refunded', 'void'),
      allowNull: false,
      defaultValue: 'completed'
    },
    referenceNo: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    cashierId: {
      type: DataTypes.INTEGER,
      allowNull: false
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
    tableName: 'parking_payments'
  });

  ParkingPayment.associate = function(models) {
    if (models.parkingTicket) {
      ParkingPayment.belongsTo(models.parkingTicket, { foreignKey: 'ticketId', as: 'ticket' });
    }
    if (models.user) {
      ParkingPayment.belongsTo(models.user, { foreignKey: 'cashierId', as: 'cashier' });
    }
  };

  return ParkingPayment;
};
