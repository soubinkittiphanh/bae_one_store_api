// === model/service.js ===
module.exports = (sequelize, DataTypes) => {
    const Service = sequelize.define(
      "service",
      {
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        cost: {
          type: DataTypes.DOUBLE,
          allowNull: false,
          defaultValue: 0.00,
        },
        price: {
          type: DataTypes.DOUBLE,
          allowNull: false,
        },
        duration_minutes: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        inputter: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        update_user: {
          type: DataTypes.INTEGER,
        },
        update_time: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.NOW,
        },
        update_time_new: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.NOW,
        },
      },
      {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: "updateTimestamp",
        freezeTableName: true,
      }
    );
  
    return Service;
  };
  
  

  