// / models/Vehicle.js
module.exports = (sequelize, DataTypes) => {
  const Vehicle = sequelize.define('Vehicle', {

    licensePlate: {
      type: DataTypes.STRING,
    //   allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    brand: {
      type: DataTypes.STRING,
    //   allowNull: false,
    },
    model: {
      type: DataTypes.STRING,
    //   allowNull: false,
    },
    color: {
      type: DataTypes.STRING,
    },
    notes: {
      type: DataTypes.TEXT,
    },
  },{
    sequelize,
    // don't forget to enable timestamps!
    timestamps: true,
    // I don't want createdAt
    createdAt: true,
    // I want updatedAt to actually be called updateTimestamp
    updatedAt: 'updateTimestamp',
    // disable the modification of tablenames; By default, sequelize will automatically
    // transform all passed model names (first parameter of define) into plural.
    // if you don't want that, set the following
    freezeTableName: true,
});

  return Vehicle;
};
