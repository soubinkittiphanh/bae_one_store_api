// models/WashJobServiceProduct.js
module.exports = (sequelize, DataTypes) => {
    const WashJobServiceProduct = sequelize.define('WashJobServiceProduct', {
      washJobId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      serviceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      price: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },
      cost: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    }, {
      freezeTableName: true,
      timestamps: true,
    });
  
    return WashJobServiceProduct;
  };
  